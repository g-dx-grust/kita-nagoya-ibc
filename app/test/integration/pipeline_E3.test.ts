// 実績在庫の正は日報蓄積(B=ProductionDailyReportEntry)。保存時に ACTUAL_* を発行し、
// 同一(商品×生産日)の予定を完了化して PLANNED 予約を実績で置換する(二重計上防止)。
// A系統(DailyReport)の確定はもう在庫台帳へ書かない。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

const PLAN_DATE = new Date("2026-05-10T00:00:00.000Z");

describe("Pipeline E3: 日報蓄積(B) → ACTUAL_* と予定完了", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("A系統の下書き日報は実績在庫を変えない", async () => {
    const material = await createTestMaterial(prisma);
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 10,
      date: PLAN_DATE,
    });

    await prisma.dailyReport.create({
      data: {
        productionPlanId: plan.id,
        actualQuantity: 10,
        status: "draft",
        consumptions: {
          create: [{ itemType: "raw_material", itemId: material.id, actualQuantity: 3 }],
        },
      },
    });

    const actualMovements = await prisma.stockMovement.count({
      where: { sourceType: "daily_report" },
    });
    expect(actualMovements).toBe(0);
  });

  it("B日報の保存で ACTUAL_MATERIAL_USE と ACTUAL_PRODUCTION_IN を発行する", async () => {
    const material = await createTestMaterial(prisma, { standardUnitPrice: 100 });
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");

    await createProductDailyReportEntry({
      reportDate: "2026-05-10",
      productId: product.id,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      workerCount: 1,
      productionQty: 10,
      materials: [{ materialId: material.id, materialName: material.name, usedKg: 3 }],
    });

    const movements = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", status: "CONFIRMED" } as any,
      orderBy: { movementType: "asc" },
    });

    expect(movements.map((m) => m.movementType)).toEqual(["ACTUAL_MATERIAL_USE", "ACTUAL_PRODUCTION_IN"]);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: "raw_material", itemId: material.id, quantity: -3 }),
        expect.objectContaining({ itemType: "product", itemId: product.id, quantity: 10 }),
      ]),
    );
  });

  it("B保存で予定が完了になり PLANNED 行は残る(計算層で置換)", async () => {
    const material = await createTestMaterial(prisma);
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 10,
      date: PLAN_DATE,
    });

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "PLANNED_MATERIAL_USE",
      quantity: -3,
      movementDate: plan.date,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: plan.id,
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 10,
      movementDate: plan.date,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: plan.id,
    });

    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");
    await createProductDailyReportEntry({
      reportDate: "2026-05-10",
      productId: product.id,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      workerCount: 1,
      productionQty: 10,
      materials: [{ materialId: material.id, materialName: material.name, usedKg: 3 }],
    });

    const plannedMovements = await prisma.stockMovement.findMany({
      where: { sourceType: "production_plan", sourceId: plan.id, status: "PLANNED" } as any,
      orderBy: { movementType: "asc" },
    });
    const actualMovements = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", status: "CONFIRMED" } as any,
    });

    expect(plannedMovements.map((m) => m.movementType)).toEqual([
      "PLANNED_MATERIAL_USE",
      "PLANNED_PRODUCTION_IN",
    ]);
    expect(actualMovements).toHaveLength(2);

    const updatedPlan = await prisma.productionPlan.findUnique({ where: { id: plan.id } });
    expect(updatedPlan?.status).toBe("completed");
  });

  it("B保存後の理論在庫は ACTUAL のみ(PLANNED+ACTUAL の二重計上なし)", async () => {
    const material = await createTestMaterial(prisma);
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 10,
      date: PLAN_DATE,
    });

    // 予定の PLANNED 行(plan-engine 由来を模す)。完了化で計算層から除外される。
    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "PLANNED_MATERIAL_USE",
      quantity: -3,
      movementDate: PLAN_DATE,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: `${plan.id}:raw_material:${material.id}:0`,
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 10,
      movementDate: PLAN_DATE,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: plan.id,
    });

    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");
    await createProductDailyReportEntry({
      reportDate: "2026-05-10",
      productId: product.id,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      workerCount: 1,
      productionQty: 10,
      materials: [{ materialId: material.id, materialName: material.name, usedKg: 3 }],
    });

    // PLANNED 行は DB に残る(設計どおり)。
    const plannedRows = await prisma.stockMovement.findMany({
      where: { sourceType: "production_plan", status: "PLANNED" } as any,
    });
    expect(plannedRows).toHaveLength(2);

    const { getInventoryFor } = await import("@/lib/inventory");
    const asOf = new Date("2026-05-31T00:00:00.000Z");
    const productInv = await getInventoryFor("product", [product.id], asOf);
    const materialInv = await getInventoryFor("raw_material", [material.id], asOf);

    // ACTUAL-only: product +10 (not 20), material -3 (not -6).
    expect(productInv[product.id].theoreticalStock).toBe(10);
    expect(productInv[product.id].onHand).toBe(10);
    expect(productInv[product.id].plannedIn).toBe(0);

    expect(materialInv[material.id].theoreticalStock).toBe(-3);
    expect(materialInv[material.id].onHand).toBe(-3);
    expect(materialInv[material.id].plannedOut).toBe(0);
  });
});
