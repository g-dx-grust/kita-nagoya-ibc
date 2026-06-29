// E2E フルフロー結合テスト。
//
// 製造計画システムの 7 ステップ業務フローを、実際のサーバーエントリポイント
// (API route ハンドラ / サービス関数) を通して順番に流し、各ステップの出力が
// 次のステップの入力へ正しく連結している「継ぎ目 (seam)」を検証する。
// これがフロー全体がエンドツーエンドで実行可能であることの証明であり、
// 恒久的なリグレッションガードになる。
//
// フロー:
//   1+2. 前年比予測 → 月間候補生成 → 採用 → ドラフト生産予定の作成
//   3.   当日割り当て (出勤者を作業場所へ配置)
//   4.   日報ドラフト作成 → 確定 (実績在庫・実績原価へ反映)
//   5.   確定日報 → 月次実績 (ProductMonthlyActual) への自動集計
//   6.   在庫不足 → 発注候補生成 (発注ロット丸め)
//   7.   発注候補 → 発注 → 発注書ドキュメント (PDF / Excel)
//
// 決定論的シナリオを各テスト内でシードし、prisma/seed.ts には依存しない。
// 日付は固定文字列から構築し、Date.now()/new Date() の暗黙の「今」をロジックに使わない。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestEmployee,
  createTestMaterial,
  createTestPackagingMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestStockMovement,
  createTestSupplier,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("E2E フルフロー: 予測→予定→割当→日報→月次実績→発注候補→発注書", () => {
  const prisma = getTestPrisma();

  // --- 固定シナリオの定数 (Date.now() は使わない) ---
  const TARGET = "2026-06"; // 予測対象月
  const SCHEDULE_DATE = "2026-06-02"; // 月間予定 / 当日割り当て / 日報の生産日
  const SHORTAGE_PLAN_DATE = "2026-06-20"; // 在庫不足を起こすための後続ドラフト予定日
  const MONTH_FROM = "2026-06-01";
  const MONTH_TO = "2026-06-30";

  // BOM 係数 (1 製品あたりの原料/資材使用量)
  const RAW_PER_UNIT = 0.5; // kg / 製品
  const PACK_PER_UNIT = 1; // 枚 / 製品

  // 原料発注ロット/安全在庫/リードタイム
  const RAW_OPENING = 5; // 期首確定在庫 (極小 → 不足を起こす)
  const RAW_SAFETY = 50;
  const RAW_LEAD_DAYS = 5;
  const RAW_ORDER_LOT = 100;

  // ステップ間で共有する状態
  let workAreaId: string;
  let productId: string;
  let rawMaterialId: string;
  let packagingId: string;
  let supplierId: string;

  let generatedPlanId: string; // 月間予定で生成された 2026-06-02 のドラフト予定
  let generatedPlanQty: number;
  let shortagePlanId: string; // 在庫不足用の後続ドラフト予定 (2026-06-20)

  let dailyReportId: string;
  let confirmedActualQuantity: number;

  let purchaseOrderId: string; // 原料の発注候補 → 発注

  beforeAll(async () => {
    await cleanupAll(prisma);
    await seedScenario();
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  // 決定論的シナリオのシード。
  async function seedScenario() {
    // 社内作業場所 (生産能力・当日割り当ての対象)
    const workArea = await createTestWorkArea(prisma, {
      name: "E2E_製造室",
      areaType: "internal",
      maxPeopleCount: 4,
      displayOrder: 1,
    });
    workAreaId = workArea.id;

    // 商品 (在庫品 / 前年比予測 / 小さな生産ロット)
    const product = await createTestProduct(prisma, {
      productCode: "E2E-PROD-001",
      officialName: "E2E_テスト製品",
      productionType: "stock",
      forecastMethod: "YEAR_RATIO",
      standardProductionLotSize: 10,
      unit: "袋",
      defaultWorkAreaId: workArea.id,
    });
    productId = product.id;

    // 作業場所別の生産能力。1 人 1 時間あたりを大きくして、
    // 月間シミュレーションが予測数量を 1 日 (生産日) に収めきれるようにする。
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 2000,
        standardPeople: 1,
      },
    });

    // 手間賃単価 (実績原価 > 0 を保証するため)
    await prisma.billingPrice.create({
      data: {
        productId: product.id,
        unitPrice: 30,
        unit: "袋",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        billingTarget: true,
      },
    });

    // 仕入先
    const supplier = await createTestSupplier(prisma, { name: "E2E_仕入先" });
    supplierId = supplier.id;

    // 原料 (希少在庫 → 不足を起こす)。安全在庫・リードタイム・発注ロットを設定。
    const rawMaterial = await createTestMaterial(prisma, {
      materialCode: "E2E-RAW-001",
      name: "E2E_原料",
      unit: "kg",
      standardUnitPrice: 100,
      supplierId: supplier.id,
      leadTimeDays: RAW_LEAD_DAYS,
      safetyStockQuantity: RAW_SAFETY,
      orderLotQty: RAW_ORDER_LOT,
    });
    rawMaterialId = rawMaterial.id;

    // 資材 (潤沢在庫 → 不足を起こさない)
    const packaging = await createTestPackagingMaterial(prisma, {
      materialCode: "E2E-PK-001",
      name: "E2E_資材",
      unit: "枚",
      standardUnitPrice: 5,
      supplierId: supplier.id,
      leadTimeDays: RAW_LEAD_DAYS,
      safetyStockQuantity: 10,
      orderLotQty: 50,
    });
    packagingId = packaging.id;

    // BOM: 製品 → 原料 + 資材
    await prisma.productBomItem.createMany({
      data: [
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: rawMaterial.id,
          quantityPerUnit: RAW_PER_UNIT,
          unit: "kg",
        },
        {
          productId: product.id,
          itemType: "packaging",
          itemId: packaging.id,
          quantityPerUnit: PACK_PER_UNIT,
          unit: "枚",
        },
      ],
    });

    // 期首在庫 (確定在庫): 資材は潤沢、原料は希少。生産日より前の日付で確定。
    await createTestStockMovement(prisma, {
      itemId: packaging.id,
      itemType: "packaging",
      movementType: "opening",
      quantity: 100000,
      movementDate: new Date("2026-05-01T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "opening",
      sourceId: `opening_pk_${packaging.id}`,
    });
    await createTestStockMovement(prisma, {
      itemId: rawMaterial.id,
      itemType: "raw_material",
      movementType: "opening",
      quantity: RAW_OPENING,
      movementDate: new Date("2026-05-01T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "opening",
      sourceId: `opening_raw_${rawMaterial.id}`,
    });

    // 従業員 2 名 + 対象月内のシフト (月間シミュレーション/当日割り当ての出勤者)。
    const e1 = await createTestEmployee(prisma, { name: "E2E_作業者1" });
    const e2 = await createTestEmployee(prisma, { name: "E2E_作業者2" });
    // 6/1〜6/30 の平日想定で複数日にシフトを入れる (生産日 6/2 を含む)。
    const shiftDays = [1, 2, 3, 4, 5, 8, 9, 10, 19, 20];
    for (const day of shiftDays) {
      const date = new Date(`2026-06-${String(day).padStart(2, "0")}T00:00:00.000Z`);
      for (const emp of [e1, e2]) {
        await prisma.shift.create({
          data: {
            employeeId: emp.id,
            date,
            startTime: "09:00",
            endTime: "17:00",
            breakMinutes: 60,
            status: "confirmed",
          },
        });
      }
    }

    // 前年比 (YoY) 予測エンジンが必要とする月次実績 (ProductMonthlyActual)。
    // 対象月 T=2026-06 に対して:
    //   T-12 (前年当月)      = 2025-06 = 1000 (掛け算の基礎)
    //   T-2  (前々月)        = 2026-04 = 900
    //   T-14 (前々月前年)    = 2025-04 = 800  → 前々月前年比 = 900/800 = 1.125
    //   (補助) T-1=2026-05, T-13=2025-05
    // 予測 = 1000 × 1.125 = 1125 → ロット10で切上げ 1130。
    const monthlyActuals: Array<{ yearMonth: string; actualQuantity: number }> = [
      { yearMonth: "2025-06", actualQuantity: 1000 },
      { yearMonth: "2026-04", actualQuantity: 900 },
      { yearMonth: "2025-04", actualQuantity: 800 },
      { yearMonth: "2026-05", actualQuantity: 950 },
      { yearMonth: "2025-05", actualQuantity: 850 },
    ];
    await prisma.productMonthlyActual.createMany({
      data: monthlyActuals.map((row) => ({
        productId: product.id,
        yearMonth: row.yearMonth,
        actualQuantity: row.actualQuantity,
        sourceType: "manual",
      })),
    });
  }

  // ステップ 1+2: 前年比予測 → 月間候補生成 → 採用 → 月間ドラフト生産予定。
  // POST /api/product-planning/monthly-schedule
  // POST /api/planning/monthly-runs/[id]/adopt
  // 継ぎ目: 予測 (YoY) → ProductionPlanCandidate → ProductionPlan(draft)。
  it("ステップ1+2: 月間スケジュールが前年比予測から候補を保存し、採用でドラフト予定を生成する", async () => {
    const { POST } = await import("@/app/api/product-planning/monthly-schedule/route");
    const response = await POST(
      new Request("http://test.local/api/product-planning/monthly-schedule", {
        method: "POST",
        body: JSON.stringify({
          dateFrom: SCHEDULE_DATE, // preferredDate = dateFrom → 予定は生産日に着地
          dateTo: MONTH_TO,
          planningBasis: "historical_actual",
          productionLeadDays: 1,
          defaultStartTime: "09:00",
          baselineEndTime: "17:00",
          replaceExistingDrafts: true,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.runId).toBeTruthy();
    expect(json.createdCount).toBe(0);
    expect(json.candidateCount).toBeGreaterThan(0);

    const candidateCountBeforeAdoption = await prisma.productionPlanCandidate.count({
      where: { planningRunId: json.runId },
    });
    expect(candidateCountBeforeAdoption).toBeGreaterThan(0);

    const plansBeforeAdoption = await prisma.productionPlan.count({
      where: { planningRunId: json.runId },
    });
    expect(plansBeforeAdoption).toBe(0);

    const { POST: ADOPT } = await import("@/app/api/planning/monthly-runs/[id]/adopt/route");
    const adoptResponse = await ADOPT(
      new Request("http://test.local/api/planning/monthly-runs/run/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: json.runId }) },
    );
    const adoptJson = await adoptResponse.json();
    expect(adoptResponse.status).toBe(200);
    expect(adoptJson.createdCount).toBeGreaterThan(0);

    // 実 DB のドラフト予定を確認 (予測 → 予定の継ぎ目)。
    const draftPlans = await prisma.productionPlan.findMany({
      where: { productId, status: "draft", planningRunId: json.runId },
      orderBy: { date: "asc" },
    });
    expect(draftPlans.length).toBeGreaterThan(0);

    // 生産日 (2026-06-02) のドラフト予定を 1 件選ぶ。
    const planOnScheduleDate = draftPlans.find(
      (plan) => plan.date.toISOString().slice(0, 10) === SCHEDULE_DATE,
    );
    expect(planOnScheduleDate).toBeDefined();
    expect(planOnScheduleDate!.plannedQuantity).toBeGreaterThan(0);
    expect(planOnScheduleDate!.planningBatchId).toBe(adoptJson.batchId);

    generatedPlanId = planOnScheduleDate!.id;
    generatedPlanQty = planOnScheduleDate!.plannedQuantity;

    // 在庫不足を確実に検出させるため、後続のドラフト予定 (2026-06-20) を明示的に追加する。
    // ステップ4で生産日の予定が completed になっても、こちらは draft のまま残り、
    // ステップ6の所要量 (ProductionPlanRequirement) の供給源になる。
    const shortagePlan = await createTestProductionPlan(prisma, {
      productId,
      workAreaId,
      plannedQuantity: 200, // 200 × 0.5kg = 100kg 所要 (期首5kgでは大幅不足)
      date: new Date(`${SHORTAGE_PLAN_DATE}T00:00:00.000Z`),
      plannedStartTime: "09:00",
      plannedPeopleCount: 1,
      status: "draft",
    });
    shortagePlanId = shortagePlan.id;
    // BOM から所要量 (ProductionPlanRequirement) と PLANNED 在庫トランザクションを生成。
    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(shortagePlanId);

    const requirements = await prisma.productionPlanRequirement.findMany({
      where: { productionPlanId: shortagePlanId },
    });
    expect(requirements.length).toBe(2); // 原料 + 資材
  });

  // ステップ 3: 当日割り当て。
  // POST /api/production-plans/allocate-day (persist=true)
  // 継ぎ目: ProductionPlan → ProductionPlanAssignment の生成。
  it("ステップ3: 当日割り当てで生産予定に出勤者の割り当てが作られる", async () => {
    expect(generatedPlanId).toBeDefined();

    const { POST } = await import("@/app/api/production-plans/allocate-day/route");
    const response = await POST(
      new Request("http://test.local/api/production-plans/allocate-day", {
        method: "POST",
        body: JSON.stringify({
          date: SCHEDULE_DATE,
          persist: true,
          planStatuses: ["draft", "confirmed"],
          stepMinutes: 5,
          dayStart: "09:00",
          dayEnd: "17:00",
        }),
      }),
    );
    expect(response.status).toBe(200);

    // 生産日の予定に割り当て行が存在する (予定 → 割り当ての継ぎ目)。
    const assignments = await prisma.productionPlanAssignment.findMany({
      where: { productionPlanId: generatedPlanId },
    });
    expect(assignments.length).toBeGreaterThan(0);
  });

  // ステップ 4: 日報ドラフト作成 → 確定。
  // POST /api/daily-reports/from-production-plan/[id] → POST /api/daily-reports/[id]/confirm
  // 継ぎ目:
  //   - 確定日報の実績原価 > 0
  //   - ProductionPlan.status === "completed"
  //   - CONFIRMED な ACTUAL_* 在庫トランザクション発行
  //       (製品: ACTUAL_PRODUCTION_IN(+), 原料: ACTUAL_MATERIAL_USE(-))
  //   - getInventoryFor で製品の theoreticalStock が「実績のみ」の数量に等しい
  //     (= planned + actual の二重計上になっていないこと)
  it("ステップ4: 日報蓄積(B)を保存すると実績在庫・原価へ反映され二重計上が起きない", async () => {
    expect(generatedPlanId).toBeDefined();

    confirmedActualQuantity = generatedPlanQty;
    const rawConsumption = Math.round(confirmedActualQuantity * RAW_PER_UNIT * 10000) / 10000;

    // 日報蓄積(B)を保存。原料は実測kgを入力、資材はBOM標準量で自動差引、製品は生産数で入荷。
    const { POST } = await import("@/app/api/production-daily-reports/route");
    const res = await POST(
      new Request("http://test.local/api/production-daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: SCHEDULE_DATE,
          productId,
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          workerCount: 1,
          productionQty: confirmedActualQuantity,
          materials: [{ materialId: rawMaterialId, materialName: "E2E_原料", usedKg: rawConsumption }],
        }),
      }),
    );
    const entry = await res.json();
    expect(res.status).toBe(201);
    dailyReportId = entry.id;
    expect(dailyReportId).toBeDefined();

    // 売値・原価が算出されている (売値 = 生産数 × 手間賃単価30、原料原価 = 実測kg × 100)。
    expect(entry.sales).toBeGreaterThan(0);
    expect(entry.materialCost).toBeGreaterThan(0);

    // 同一(商品×生産日)の生産予定が completed になっている。
    const plan = await prisma.productionPlan.findUniqueOrThrow({ where: { id: generatedPlanId } });
    expect(plan.status).toBe("completed");

    // CONFIRMED な ACTUAL_* 在庫トランザクション(B由来)が発行されている。
    const actualMovements = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", status: "CONFIRMED" },
    });
    expect(actualMovements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movementType: "ACTUAL_PRODUCTION_IN",
          itemType: "product",
          itemId: productId,
          quantity: confirmedActualQuantity,
        }),
        expect.objectContaining({
          movementType: "ACTUAL_MATERIAL_USE",
          itemType: "raw_material",
          itemId: rawMaterialId,
          quantity: -rawConsumption,
        }),
      ]),
    );

    // 二重計上が起きていないこと: 製品の理論在庫は「実績のみ」の数量に等しい。
    // 完了プランの PLANNED_PRODUCTION_IN は計算層で除外される。
    const { getInventoryFor } = await import("@/lib/inventory");
    const asOf = new Date(`${SCHEDULE_DATE}T23:59:59.000Z`);
    const productInv = await getInventoryFor("product", [productId], asOf);
    expect(productInv[productId].onHand).toBe(confirmedActualQuantity);
    expect(productInv[productId].plannedIn).toBe(0);
    expect(productInv[productId].theoreticalStock).toBe(confirmedActualQuantity);
  });

  // ステップ 5: 確定日報 → 月次実績 (ProductMonthlyActual) への自動集計。
  // 継ぎ目: 日報確定時に syncMonthlyActualFromDailyReports が当月の実績を upsert する。
  it("ステップ5: 確定日報が月次実績へ自動集計される", async () => {
    const monthlyActual = await prisma.productMonthlyActual.findUniqueOrThrow({
      where: { productId_yearMonth: { productId, yearMonth: TARGET } },
    });
    // 当月 (2026-06) の行が日報由来で存在し、実績数量 = 確定日報の数量。
    expect(monthlyActual.sourceType).toBe("daily_report");
    expect(monthlyActual.actualQuantity).toBe(confirmedActualQuantity);

    // 予実 read-model の累計実績にも反映されている。
    const { loadMonthlyProductionSchedulePreview } = await import(
      "@/lib/product-planning-service"
    );
    const preview = await loadMonthlyProductionSchedulePreview({
      dateFrom: new Date(`${MONTH_FROM}T00:00:00.000Z`),
      dateTo: new Date(`${MONTH_TO}T00:00:00.000Z`),
      planningBasis: "historical_actual",
    });
    const row = preview.reconciliation.find((r) => r.productId === productId);
    expect(row).toBeDefined();
    expect(row!.cumulativeActual).toBeGreaterThan(0);
  });

  // ステップ 6: 在庫不足 → 発注候補生成。
  // POST /api/purchase-candidates/generate
  // 継ぎ目: 不足検出 → PurchaseOrder(candidate)。recommendedOrderDate / urgency が設定され、
  //         orderedQuantity が発注ロットの倍数へ丸められている (ロット丸めの継ぎ目)。
  it("ステップ6: 在庫不足から発注候補が生成されロット丸めされる", async () => {
    // ステップ4の確定で原料は更に減っている。後続ドラフト予定 (6/20) の所要が不足を起こす。
    const { POST } = await import("@/app/api/purchase-candidates/generate/route");
    const response = await POST(
      new Request("http://test.local/api/purchase-candidates/generate", {
        method: "POST",
        body: JSON.stringify({
          dateFrom: "2026-06-10", // ステップ4実績の後・後続予定 (6/20) を含む窓
          dateTo: "2026-06-30",
          replaceExistingCandidates: true,
        }),
      }),
    );
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.rowCount).toBeGreaterThanOrEqual(1);

    // 原料の発注候補を確認する。
    const candidate = await prisma.purchaseOrder.findFirst({
      where: { itemType: "raw_material", itemId: rawMaterialId, status: "candidate" },
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.recommendedOrderDate).not.toBeNull();
    expect(candidate!.urgency).not.toBe("NONE");

    // 発注量が発注ロット (100) の倍数へ切り上げられている。
    expect(candidate!.orderedQuantity).toBeGreaterThan(0);
    expect(candidate!.orderedQuantity % RAW_ORDER_LOT).toBe(0);

    purchaseOrderId = candidate!.id;
  });

  // ステップ 7: 発注候補 → 発注 → 発注書ドキュメント。
  // POST /api/purchase-orders/[id]/order → GET /api/purchase-orders/[id]/document
  // 継ぎ目: candidate → ordered_unconfirmed への遷移、そこから PDF/Excel ドキュメント生成。
  it("ステップ7: 発注候補を発注し発注書 (PDF/Excel) を出力できる", async () => {
    expect(purchaseOrderId).toBeDefined();

    // 候補 → 発注 (ordered_unconfirmed)
    const { POST: ORDER } = await import("@/app/api/purchase-orders/[id]/order/route");
    const orderRes = await ORDER(
      new Request(`http://test.local/api/purchase-orders/${purchaseOrderId}/order`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: purchaseOrderId }) },
    );
    const ordered = await orderRes.json();
    expect(orderRes.status).toBe(200);
    expect(ordered.status).toBe("ordered_unconfirmed");

    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");
    const updateRes = await PUT(
      new Request(`http://test.local/api/purchase-orders/${purchaseOrderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedArrivalDate: "2026-06-19" }),
      }),
      { params: Promise.resolve({ id: purchaseOrderId }) },
    );
    expect(updateRes.status).toBe(200);

    const { GET: DOCUMENT } = await import("@/app/api/purchase-orders/[id]/document/route");

    // PDF ドキュメント。先頭バイトが "%PDF"。
    const pdfRes = await DOCUMENT(
      new Request(
        `http://test.local/api/purchase-orders/${purchaseOrderId}/document?format=pdf`,
      ),
      { params: Promise.resolve({ id: purchaseOrderId }) },
    );
    expect(pdfRes.status).toBe(200);
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");

    // Excel ドキュメント。ZIP コンテナなので先頭バイトが "PK"。
    const xlsxRes = await DOCUMENT(
      new Request(
        `http://test.local/api/purchase-orders/${purchaseOrderId}/document?format=xlsx`,
      ),
      { params: Promise.resolve({ id: purchaseOrderId }) },
    );
    expect(xlsxRes.status).toBe(200);
    const xlsxBytes = Buffer.from(await xlsxRes.arrayBuffer());
    expect(xlsxBytes.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  // スプリント0-1追加: 月次計画の主要導線を、状態機械の読み取りAPIまで通す。
  // 継ぎ目: 月間ドラフト予定 → 材料不足 → 発注候補 → 入荷予定付き未確定発注 →
  //         PO更新フックで自動仮確定され、GET /api/production-plans/promotable でも状態が見える。
  it("ステップ7.5: 入荷予定がある未確定発注で月次仮予定が仮確定候補に出る", async () => {
    expect(shortagePlanId).toBeDefined();
    expect(purchaseOrderId).toBeDefined();

    const { GET } = await import("@/app/api/production-plans/promotable/route");
    const response = await GET(
      new Request(`http://test.local/api/production-plans/promotable?ym=${TARGET}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    const row = json.results.find((result: { id: string }) => result.id === shortagePlanId);
    expect(row).toMatchObject({
      id: shortagePlanId,
      status: "tentative_confirmed",
      canTentativeConfirm: true,
      canConfirm: false,
    });
    expect(row.backingPurchaseOrderIds).toContain(purchaseOrderId);
    expect(json.demotionWarnings.map((result: { id: string }) => result.id)).not.toContain(shortagePlanId);
  });
});
