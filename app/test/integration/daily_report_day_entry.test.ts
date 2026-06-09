import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

async function callDayEntry(body: unknown) {
  const { POST } = await import("@/app/api/daily-reports/day-entry/route");
  return POST(
    new Request("http://test.local/api/daily-reports/day-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("daily-report day-entry (当日一括入力)", () => {
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

  async function setup() {
    const product = await createTestProduct(prisma);
    const workArea = await createTestWorkArea(prisma);
    const material = await createTestMaterial(prisma);
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 100,
      date: new Date("2026-06-15T00:00:00.000Z"),
      unit: "袋",
    });
    await prisma.productionPlanRequirement.create({
      data: {
        productionPlanId: plan.id,
        itemType: "raw_material",
        itemId: material.id,
        itemName: material.name,
        unit: "kg",
        plannedQuantity: 12,
        unitPriceSnapshot: 5,
      },
    });
    return { product, workArea, material, plan };
  }

  it("confirm:false で下書き保存され、実数量・実使用量が入る(在庫はまだ動かない)", async () => {
    const { plan, material } = await setup();
    const res = await callDayEntry({
      confirm: false,
      entries: [
        {
          planId: plan.id,
          actualQuantity: 90,
          consumptions: [{ itemType: "raw_material", itemId: material.id, actualQuantity: 11, unitPriceSnapshot: 5 }],
        },
      ],
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.saved).toBe(1);

    const report = await prisma.dailyReport.findUnique({
      where: { productionPlanId: plan.id },
      include: { consumptions: true },
    });
    expect(report?.status).toBe("draft");
    expect(report?.actualQuantity).toBe(90);
    expect(report?.consumptions[0]?.actualQuantity).toBe(11);

    const mv = await prisma.stockMovement.count({ where: { sourceType: "daily_report" } });
    expect(mv).toBe(0);
  });

  it("confirm:true で確定し予定が完了になる(在庫差引はB系統へ移管したためA確定では台帳を動かさない)", async () => {
    const { plan, material } = await setup();
    const res = await callDayEntry({
      confirm: true,
      entries: [
        {
          planId: plan.id,
          actualQuantity: 80,
          consumptions: [{ itemType: "raw_material", itemId: material.id, actualQuantity: 10, unitPriceSnapshot: 5 }],
        },
      ],
    });
    const json = await res.json();
    expect(json.confirmed).toBe(1);

    const report = await prisma.dailyReport.findUnique({ where: { productionPlanId: plan.id } });
    expect(report?.status).toBe("confirmed");
    const updatedPlan = await prisma.productionPlan.findUnique({ where: { id: plan.id } });
    expect(updatedPlan?.status).toBe("completed");

    // 在庫差引・実績は日報蓄積(B)が正。A系統の確定では daily_report の在庫行を作らない。
    const mv = await prisma.stockMovement.count({ where: { sourceType: "daily_report" } });
    expect(mv).toBe(0);
  });

  it("確定済みの予定は再確定せずスキップ(値を上書きしない)", async () => {
    const { plan, material } = await setup();
    await callDayEntry({
      confirm: true,
      entries: [
        { planId: plan.id, actualQuantity: 80, consumptions: [{ itemType: "raw_material", itemId: material.id, actualQuantity: 10 }] },
      ],
    });
    const res = await callDayEntry({
      confirm: true,
      entries: [{ planId: plan.id, actualQuantity: 999, consumptions: [] }],
    });
    const json = await res.json();
    expect(json.alreadyConfirmed).toBe(1);
    expect(json.confirmed).toBe(0);

    const report = await prisma.dailyReport.findUnique({ where: { productionPlanId: plan.id } });
    expect(report?.actualQuantity).toBe(80);
  });

  it("確定済みの日報は from-production-plan からの再保存(下書き化)を 409 で拒否する", async () => {
    const { plan, material } = await setup();
    await callDayEntry({
      confirm: true,
      entries: [
        { planId: plan.id, actualQuantity: 80, consumptions: [{ itemType: "raw_material", itemId: material.id, actualQuantity: 10 }] },
      ],
    });

    const { POST } = await import("@/app/api/daily-reports/from-production-plan/[id]/route");
    const res = await POST(
      new Request(`http://test.local/api/daily-reports/from-production-plan/${plan.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualQuantity: 1, consumptions: [] }),
      }),
      { params: Promise.resolve({ id: plan.id }) },
    );
    expect(res.status).toBe(409);

    const report = await prisma.dailyReport.findUnique({ where: { productionPlanId: plan.id } });
    expect(report?.status).toBe("confirmed");
    expect(report?.actualQuantity).toBe(80);
  });
});
