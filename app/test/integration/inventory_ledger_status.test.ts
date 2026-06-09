// Phase 2-1 完了時に status カラムが追加されるため、以下のテストの skip を解除すること。
// 2-1 prompt: prompts/v2/phase_2_subtasks/2_1_stock_movement_extension.md

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getInventoryFor } from "@/lib/inventory";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestPurchaseOrder,
  createTestStockMovement,
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

describe("InventoryLedger status transitions", () => {
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

  it("persists explicit PLANNED/CONFIRMED/CANCELLED statuses", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const product = await createTestProduct(prisma);

    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
      sourceType: "seed",
      sourceId: "confirmed-opening",
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 50,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "planned-plan",
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_SHIPMENT_OUT",
      quantity: -10,
      movementDate: asOf,
      status: "CANCELLED",
      sourceType: "product_demand",
      sourceId: "cancelled-demand",
    });

    const statuses = await prisma.stockMovement.findMany({
      where: { itemType: "product", itemId: product.id },
      select: { status: true },
      orderBy: { movementType: "asc" },
    });

    expect(statuses.map((row) => row.status).sort()).toEqual(["CANCELLED", "CONFIRMED", "PLANNED"]);
  });

  it("PLANNED rows contribute to theoretical stock but not to confirmed stock", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const product = await createTestProduct(prisma);

    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 50,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "plan-001",
    });

    const inventory = (await getInventoryFor("product" as any, [product.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[product.id].onHand).toBe(100);
    expect(inventory[product.id].theoreticalStock).toBe(150);
  });

  it("PLANNED → CONFIRMED transition recomputes both stocks correctly", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const product = await createTestProduct(prisma);

    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    const planned = await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 50,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "plan-002",
    });

    await prisma.stockMovement.update({
      where: { id: planned.id },
      data: { status: "CONFIRMED" } as any,
    });

    const inventory = (await getInventoryFor("product" as any, [product.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[product.id].onHand).toBe(150);
    expect(inventory[product.id].theoreticalStock).toBe(150);
  });

  it("CANCELLED rows are excluded from both stocks", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const product = await createTestProduct(prisma);

    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    const planned = await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_PRODUCTION_IN",
      quantity: 50,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "plan-003",
    });

    await prisma.stockMovement.update({
      where: { id: planned.id },
      data: { status: "CANCELLED" } as any,
    });

    const inventory = (await getInventoryFor("product" as any, [product.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[product.id].onHand).toBe(100);
    expect(inventory[product.id].theoreticalStock).toBe(100);
  });

  it("Future PLANNED_SHIPMENT_OUT reduces theoretical stock but not confirmed", async () => {
    const openingDate = new Date("2026-05-10T00:00:00.000Z");
    const shipmentDate = new Date("2026-05-12T00:00:00.000Z");
    const product = await createTestProduct(prisma);

    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "opening",
      quantity: 100,
      movementDate: openingDate,
      status: "CONFIRMED",
    });
    await createTestStockMovement(prisma, {
      itemId: product.id,
      itemType: "product",
      movementType: "PLANNED_SHIPMENT_OUT",
      quantity: -30,
      movementDate: shipmentDate,
      status: "PLANNED",
      sourceType: "product_demand",
      sourceId: "demand-001",
    });

    const inventory = (await getInventoryFor("product" as any, [product.id], shipmentDate)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[product.id].onHand).toBe(100);
    expect(inventory[product.id].plannedOut).toBe(30);
    expect(inventory[product.id].theoreticalStock).toBe(70);
  });

  it("INBOUND_UNCONFIRMED is excluded from confirmed stock", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const material = await createTestMaterial(prisma);

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    const purchaseOrder = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 40,
      status: "ordered_unconfirmed",
      expectedArrivalDate: asOf,
    });
    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "INBOUND_UNCONFIRMED",
      quantity: 40,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "purchase_order",
      sourceId: purchaseOrder.id,
    });

    const inventory = (await getInventoryFor("raw_material", [material.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[material.id].onHand).toBe(100);
    expect(inventory[material.id].confirmedInbound).toBe(0);
    expect(inventory[material.id].unconfirmedInbound).toBe(40);
  });
});
