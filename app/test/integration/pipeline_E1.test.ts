// Phase 2-2/2-4 完了時に ProductionPlan から PLANNED_* ledger 行が発行されるため、以下のテストの skip を解除すること。
// 2-2 prompt: prompts/v2/phase_2_subtasks/2_2_ledger_unification.md
// 2-4 prompt: prompts/v2/phase_2_subtasks/2_4_unified_inventory_calc.md

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getInventoryFor } from "@/lib/inventory";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

type FutureInventoryRow = {
  onHand: number;
  confirmedInbound: number;
  unconfirmedInbound: number;
  plannedIn?: number;
  plannedOut?: number;
  theoreticalStock?: number;
};

describe("Pipeline E1: production plan → BOM → ledger PLANNED → shortage detection", () => {
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

  it("ProductionPlan creation emits PLANNED_MATERIAL_USE in StockMovement", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const material = await createTestMaterial(prisma);
    await prisma.productBomItem.create({
      data: {
        productId: product.id,
        itemType: "raw_material",
        itemId: material.id,
        quantityPerUnit: 0.5,
        unit: "kg",
      },
    });
    const { POST } = await import("@/app/api/production-plans/route");

    await POST(
      new Request("http://localhost/api/production-plans", {
        method: "POST",
        body: JSON.stringify({
          date: "2026-05-10",
          productId: product.id,
          productionType: "stock",
          plannedQuantity: 20,
          unit: "袋",
          workAreaId: workArea.id,
          plannedStartTime: "09:00",
          plannedPeopleCount: 1,
        }),
      }),
    );

    const plan = await prisma.productionPlan.findFirstOrThrow({
      where: { productId: product.id },
      orderBy: { createdAt: "desc" },
    });
    const movements = await prisma.stockMovement.findMany({
      where: {
        sourceType: "production_plan",
        sourceId: plan.id,
        movementType: "PLANNED_MATERIAL_USE",
        status: "PLANNED",
      } as any,
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      itemType: "raw_material",
      itemId: material.id,
      quantity: -10,
    });
  });

  it("Shortage is detected from theoretical stock", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const material = await createTestMaterial(prisma);

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "opening",
      quantity: 5,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "PLANNED_MATERIAL_USE",
      quantity: -10,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "plan-shortage-001",
    });

    const inventory = (await getInventoryFor("raw_material", [material.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[material.id].onHand).toBe(5);
    expect(inventory[material.id].theoreticalStock).toBe(-5);
  });

  it("Purchase candidate is generated from shortage", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const material = await createTestMaterial(prisma, { leadTimeDays: 2 });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 20,
      date: new Date("2026-05-10T00:00:00.000Z"),
    });
    await prisma.productionPlanRequirement.create({
      data: {
        productionPlanId: plan.id,
        itemType: "raw_material",
        itemId: material.id,
        itemName: material.name,
        unit: material.unit,
        plannedQuantity: 10,
        onHandQuantity: 0,
        confirmedInbound: 0,
        unconfirmedInbound: 0,
        shortageQuantity: 10,
        shortageType: "hard_shortage",
        unitPriceSnapshot: material.standardUnitPrice,
      },
    });
    const { POST } = await import("@/app/api/purchase-candidates/generate/route");

    await POST(
      new Request("http://localhost/api/purchase-candidates/generate", {
        method: "POST",
        body: JSON.stringify({
          dateFrom: "2026-05-01",
          dateTo: "2026-05-31",
          replaceExistingCandidates: true,
        }),
      }),
    );

    const candidate = await prisma.purchaseOrder.findFirst({
      where: { itemType: "raw_material", itemId: material.id, status: "candidate" },
    });

    expect(candidate).toMatchObject({
      orderedQuantity: 10,
      sourceType: "material_forecast",
    });
  });
});
