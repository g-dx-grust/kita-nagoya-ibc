import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildMaterialForecast } from "@/lib/material-forecast";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial, createTestPurchaseOrder } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Phase 4 baseline", () => {
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

  it("PUT /api/purchase-orders/[id] が既存どおり動作する", async () => {
    const material = await createTestMaterial(prisma);
    const order = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
    });
    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await PUT(
      new Request(`http://localhost/api/purchase-orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify({ note: "確認済み" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.note).toBe("確認済み");
  });

  it("DELETE /api/purchase-orders/[id] が candidate を物理削除する", async () => {
    const material = await createTestMaterial(prisma);
    const order = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
      status: "candidate",
    });
    const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await DELETE(new Request(`http://localhost/api/purchase-orders/${order.id}`), {
      params: Promise.resolve({ id: order.id }),
    });
    const saved = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });

    expect(response.status).toBe(200);
    expect(saved).toBeNull();
  });

  it("既存 material-forecast.ts の hard_shortage 判定が変わらない", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "raw_material:m1": 5 },
      inbounds: [],
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-06-01",
          sortKey: "09:00#p1#r1",
          itemType: "raw_material",
          itemId: "m1",
          itemName: "原料",
          unit: "kg",
          plannedQuantity: 10,
        },
      ],
    });

    expect(lines[0]).toMatchObject({
      shortageQuantity: 5,
      shortageType: "hard_shortage",
    });
  });

  it("PurchaseOrder の既存フィールドに urgency だけ追加されても読める", async () => {
    const material = await createTestMaterial(prisma);
    const order = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
      urgency: "INFO",
    });
    const { GET } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await GET(new Request(`http://localhost/api/purchase-orders/${order.id}`), {
      params: Promise.resolve({ id: order.id }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      id: order.id,
      itemType: "raw_material",
      itemId: material.id,
      orderedQuantity: 10,
      urgency: "INFO",
    });
  });
});
