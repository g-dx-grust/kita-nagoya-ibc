import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProductionPlan,
  createTestPurchaseOrder,
  createTestProduct,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Flow redesign Sprint 1 foundation", () => {
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

  it("material forecast includes tentative_confirmed production plan requirements", async () => {
    const { workArea, product, material } = await seedBomPlanBase();
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 20,
      status: "tentative_confirmed",
    });

    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });

    const { loadMaterialForecast } = await import("@/lib/material-forecast");
    const forecast = await loadMaterialForecast({
      dateFrom: new Date("2026-07-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-31T23:59:59.999Z"),
    });

    expect(forecast.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productionPlanId: plan.id,
          itemType: "raw_material",
          itemId: material.id,
          plannedQuantity: 20,
        }),
      ]),
    );
  });

  it("plan backing ignores purchase orders without expectedArrivalDate and uses dated arrivals only", async () => {
    const { workArea, product, material } = await seedBomPlanBase();
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 100,
      status: "draft",
    });
    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });

    const purchaseOrder = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: null,
    });

    const { evaluatePlanBacking } = await import("@/lib/plan-backing");
    const [withoutArrival] = await evaluatePlanBacking([plan.id]);
    expect(withoutArrival.canTentativeConfirm).toBe(false);
    expect(withoutArrival.backingPurchaseOrderIds).not.toContain(purchaseOrder.id);

    await prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: { expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z") },
    });

    const [withArrival] = await evaluatePlanBacking([plan.id]);
    expect(withArrival.canTentativeConfirm).toBe(true);
    expect(withArrival.canConfirm).toBe(false);
    expect(withArrival.backingPurchaseOrderIds).toContain(purchaseOrder.id);
  });

  it("同一未確定POを複数planが二重に裏付け主張しない", async () => {
    const { workArea, product, material } = await seedBomPlanBase();
    const firstPlan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 100,
      status: "draft",
    });
    const secondPlan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-11T00:00:00.000Z"),
      plannedQuantity: 100,
      status: "draft",
    });

    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(firstPlan.id, { refreshMaterialForecast: false });
    await recalculateProductionPlan(secondPlan.id, { refreshMaterialForecast: false });

    const purchaseOrder = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const { evaluatePlanBacking } = await import("@/lib/plan-backing");
    const results = await evaluatePlanBacking([firstPlan.id, secondPlan.id]);
    const resultByPlanId = new Map(results.map((result) => [result.planId, result]));

    expect(resultByPlanId.get(firstPlan.id)).toMatchObject({
      canTentativeConfirm: true,
      canConfirm: false,
      backingPurchaseOrderIds: [purchaseOrder.id],
    });
    expect(resultByPlanId.get(secondPlan.id)).toMatchObject({
      canTentativeConfirm: false,
      canConfirm: false,
      backingPurchaseOrderIds: [],
    });
    expect(results.flatMap((result) => result.backingPurchaseOrderIds)).toEqual([
      purchaseOrder.id,
    ]);
  });

  it("単票評価でも同月先行planの引当を考慮する", async () => {
    const { workArea, product, material } = await seedBomPlanBase();
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      movementType: "opening",
      movementDate: new Date("2026-06-30T00:00:00.000Z"),
    });
    const earlierPlan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-05T00:00:00.000Z"),
      plannedQuantity: 80,
      status: "draft",
    });
    const laterPlan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-20T00:00:00.000Z"),
      plannedQuantity: 80,
      status: "draft",
    });

    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(earlierPlan.id, { refreshMaterialForecast: false });
    await recalculateProductionPlan(laterPlan.id, { refreshMaterialForecast: false });

    const { evaluatePlanBacking } = await import("@/lib/plan-backing");
    const [singleResult] = await evaluatePlanBacking([laterPlan.id]);
    const batchResults = await evaluatePlanBacking([earlierPlan.id, laterPlan.id]);
    const batchLaterResult = batchResults.find((result) => result.planId === laterPlan.id);

    expect(singleResult.canConfirm).toBe(false);
    expect(singleResult.canTentativeConfirm).toBe(false);
    expect(singleResult.blockingRequirements[0]).toMatchObject({
      itemType: "raw_material",
      itemId: material.id,
      shortageType: "hard_shortage",
    });
    expect(batchLaterResult).toMatchObject({
      canTentativeConfirm: singleResult.canTentativeConfirm,
      canConfirm: singleResult.canConfirm,
    });
  });

  it("requirement 0件のplanは昇格可能にしない", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      unit: "袋",
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 20,
      status: "draft",
    });

    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });

    const { evaluatePlanBacking } = await import("@/lib/plan-backing");
    const [result] = await evaluatePlanBacking([plan.id]);

    expect(result.canTentativeConfirm).toBe(false);
    expect(result.canConfirm).toBe(false);
    expect(result.blockingRequirements[0]?.reason).toBe("BOM未登録または所要量未計算です。");
  });

  async function seedBomPlanBase() {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      unit: "袋",
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 100,
        standardPeople: 1,
      },
    });
    const material = await createTestMaterial(prisma, {
      unit: "kg",
      safetyStockQuantity: 0,
    });
    await prisma.productBomItem.create({
      data: {
        productId: product.id,
        itemType: "raw_material",
        itemId: material.id,
        quantityPerUnit: 1,
        unit: "kg",
      },
    });

    return { workArea, product, material };
  }
});
