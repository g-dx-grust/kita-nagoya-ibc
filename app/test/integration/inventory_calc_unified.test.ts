// Phase 2-4 完了時に getInventoryFor が product/raw_material/packaging 共通になるため、以下のテストの skip を解除すること。
// 2-4 prompt: prompts/v2/phase_2_subtasks/2_4_unified_inventory_calc.md

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getInventoryFor } from "@/lib/inventory";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestPackagingMaterial,
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

describe("Unified inventory calculation", () => {
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

  it("getInventoryFor returns onHand/confirmedInbound/unconfirmedInbound for products", async () => {
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
      quantity: 30,
      movementDate: asOf,
      status: "PLANNED",
      sourceType: "production_plan",
      sourceId: "plan-product-001",
    });

    const inventory = (await getInventoryFor("product" as any, [product.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[product.id]).toMatchObject({
      onHand: 100,
      confirmedInbound: 0,
      unconfirmedInbound: 0,
      plannedIn: 30,
      theoreticalStock: 130,
    });
  });

  it("getInventoryFor returns same for materials and packaging", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const material = await createTestMaterial(prisma);
    const packaging = await createTestPackagingMaterial(prisma);

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "opening",
      quantity: 20,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    await createTestStockMovement(prisma, {
      itemId: packaging.id,
      itemType: "packaging",
      movementType: "opening",
      quantity: 500,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
      confirmedQuantity: 8,
      status: "confirmed",
      expectedArrivalDate: asOf,
    });
    await createTestPurchaseOrder(prisma, {
      itemId: packaging.id,
      itemType: "packaging",
      quantity: 300,
      status: "ordered_unconfirmed",
      expectedArrivalDate: asOf,
    });

    const materialInventory = (await getInventoryFor("raw_material", [material.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;
    const packagingInventory = (await getInventoryFor("packaging", [packaging.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(materialInventory[material.id]).toMatchObject({
      onHand: 20,
      confirmedInbound: 8,
      unconfirmedInbound: 0,
    });
    expect(packagingInventory[packaging.id]).toMatchObject({
      onHand: 500,
      confirmedInbound: 0,
      unconfirmedInbound: 300,
    });
  });

  it("Asof date excludes future movements", async () => {
    const asOf = new Date("2026-05-10T00:00:00.000Z");
    const future = new Date("2026-05-11T00:00:00.000Z");
    const material = await createTestMaterial(prisma);

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "opening",
      quantity: 100,
      movementDate: asOf,
      status: "CONFIRMED",
    });
    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "adjustment",
      quantity: -25,
      movementDate: future,
      status: "CONFIRMED",
    });

    const inventory = (await getInventoryFor("raw_material", [material.id], asOf)) as Record<
      string,
      FutureInventoryRow
    >;

    expect(inventory[material.id].onHand).toBe(100);
    expect(inventory[material.id].theoreticalStock).toBe(100);
  });
});
