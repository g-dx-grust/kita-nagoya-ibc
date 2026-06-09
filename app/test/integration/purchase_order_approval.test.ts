import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial, createTestPurchaseOrder } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("PurchaseOrder approval pipeline", () => {
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

  it("candidate → draft 遷移は StockMovement を発行しない", async () => {
    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");
    const material = await createTestMaterial(prisma);
    const order = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
      status: "candidate",
    });

    await PUT(request(order.id, { status: "draft" }), { params: Promise.resolve({ id: order.id }) });

    await expect(movementCount(order.id)).resolves.toBe(0);
  });

  it("draft → ordered_unconfirmed で INBOUND_UNCONFIRMED 行が PLANNED で発行される", async () => {
    const order = await createOrder("draft");
    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await PUT(request(order.id, { status: "ordered_unconfirmed" }), {
      params: Promise.resolve({ id: order.id }),
    });
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { sourceType: "purchase_order", sourceId: order.id },
    });

    expect(response.status).toBe(200);
    expect(movement).toMatchObject({
      movementType: "INBOUND_UNCONFIRMED",
      status: "PLANNED",
      quantity: 10,
    });
  });

  it("ordered_unconfirmed → confirmed で対応行が INBOUND_CONFIRMED + status=PLANNED に更新", async () => {
    const order = await createSyncedOrder("ordered_unconfirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/confirm/route");

    const response = await POST(new Request(`http://localhost/api/purchase-orders/${order.id}/confirm`), {
      params: Promise.resolve({ id: order.id }),
    });
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { sourceType: "purchase_order", sourceId: order.id },
    });

    expect(response.status).toBe(200);
    expect(movement).toMatchObject({
      movementType: "INBOUND_CONFIRMED",
      status: "PLANNED",
    });
  });

  it("confirmed → received で対応行が status=CONFIRMED に更新（実在庫に反映）", async () => {
    const order = await createSyncedOrder("confirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");

    const response = await POST(
      new Request(`http://localhost/api/purchase-orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receivedQuantity: 8, receivedDate: "2026-06-01" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    const json = await response.json();
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { sourceType: "purchase_order", sourceId: order.id },
    });

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ status: "received", receivedQuantity: 8 });
    expect(movement).toMatchObject({
      movementType: "INBOUND_CONFIRMED",
      status: "CONFIRMED",
      quantity: 8,
    });
  });

  it("確定済みを cancel すると StockMovement が status=CANCELLED に", async () => {
    const order = await createSyncedOrder("confirmed");
    const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await DELETE(new Request(`http://localhost/api/purchase-orders/${order.id}`), {
      params: Promise.resolve({ id: order.id }),
    });
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { sourceType: "purchase_order", sourceId: order.id },
    });

    expect(response.status).toBe(200);
    expect(movement.status).toBe("CANCELLED");
  });

  it("/confirm エンドポイントが二重実行で副作用無し（冪等）", async () => {
    const order = await createSyncedOrder("ordered_unconfirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/confirm/route");

    await POST(new Request(`http://localhost/api/purchase-orders/${order.id}/confirm`), {
      params: Promise.resolve({ id: order.id }),
    });
    const second = await POST(new Request(`http://localhost/api/purchase-orders/${order.id}/confirm`), {
      params: Promise.resolve({ id: order.id }),
    });

    expect(second.status).toBe(400);
    await expect(movementCount(order.id)).resolves.toBe(1);
  });

  it("/receive エンドポイントが受領数量を引数で受ける", async () => {
    const order = await createSyncedOrder("confirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");

    await POST(
      new Request(`http://localhost/api/purchase-orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receivedQuantity: 6 }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    const saved = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });

    expect(saved.receivedQuantity).toBe(6);
    expect(saved.receivedDate).toBeInstanceOf(Date);
  });

  it("/receive で audit_log に receive_purchase_order が 1 件追加される", async () => {
    const order = await createSyncedOrder("confirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");

    await POST(
      new Request(`http://localhost/api/purchase-orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ receivedQuantity: 6 }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    await expect(auditCount("receive_purchase_order", order.id)).resolves.toBe(1);
  });

  it("/confirm で audit_log に confirm_purchase_order が 1 件追加される", async () => {
    const order = await createSyncedOrder("ordered_unconfirmed");
    const { POST } = await import("@/app/api/purchase-orders/[id]/confirm/route");

    await POST(new Request(`http://localhost/api/purchase-orders/${order.id}/confirm`), {
      params: Promise.resolve({ id: order.id }),
    });

    await expect(auditCount("confirm_purchase_order", order.id)).resolves.toBe(1);
  });

  async function createOrder(status: "draft" | "ordered_unconfirmed" | "confirmed") {
    const material = await createTestMaterial(prisma);
    return createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
      status,
      expectedArrivalDate: new Date("2026-06-01T00:00:00.000Z"),
    });
  }

  async function createSyncedOrder(status: "ordered_unconfirmed" | "confirmed") {
    const order = await createOrder(status);
    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");
    await PUT(request(order.id, { status }), { params: Promise.resolve({ id: order.id }) });
    return order;
  }

  function request(id: string, body: Record<string, unknown>) {
    return new Request(`http://localhost/api/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  function movementCount(id: string) {
    return prisma.stockMovement.count({ where: { sourceType: "purchase_order", sourceId: id } });
  }

  function auditCount(action: string, entityId: string) {
    return prisma.auditLog.count({ where: { action, entityId } });
  }
});
