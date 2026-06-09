import { audit } from "@/lib/audit";
import { handleError, HttpError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { refreshAroundPurchaseOrder } from "@/lib/purchase-order-refresh";
import { syncPurchaseOrderMovement } from "@/lib/purchase-order-stock-sync";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { PurchaseOrderUpdateSchema } from "@/lib/schemas";

// 発注ステータスの遷移ガード。前進または隣接遷移のみ許可し、
// 段階飛ばし(例: candidate→received)を禁止する。同一ステータスへの変更は no-op として許可。
const ALLOWED_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  candidate: ["draft", "ordered_unconfirmed", "cancelled"],
  draft: ["ordered_unconfirmed", "cancelled"],
  ordered_unconfirmed: ["confirmed", "cancelled"],
  confirmed: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

function assertStatusTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new HttpError(400, "そのステータスへは変更できません。", { from, to, allowed });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.purchaseOrder.findUnique({ where: { id } });
  return row ? ok(row) : notFound();
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, PurchaseOrderUpdateSchema);
    if (body.status !== undefined) {
      assertStatusTransition(before.status, body.status);
    }
    const after = await prisma.$transaction(async (tx) => {
      const recommendedOrderDate = dateOrNull(body.recommendedOrderDate);
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: body.supplierId,
          orderedQuantity: body.orderedQuantity,
          confirmedQuantity: body.confirmedQuantity,
          expectedArrivalDate: dateOrNull(body.expectedArrivalDate),
          shortageDate: dateOrNull(body.shortageDate),
          recommendedOrderDate,
          urgency:
            body.urgency ??
            (body.recommendedOrderDate !== undefined
              ? computeUrgency({ requiredOrderDate: recommendedOrderDate ?? null, asOfDate: new Date() })
              : undefined),
          status: body.status,
          receivedQuantity: body.receivedQuantity,
          receivedDate: dateOrNull(body.receivedDate),
          note: body.note,
        },
      });
      await syncPurchaseOrderMovement(tx, updated);
      return updated;
    });
    await audit({ action: "update", entityType: "PurchaseOrder", entityId: id, before, after });
    await refreshAroundPurchaseOrder(before, after);
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!before) return notFound();
    if (before.status === "candidate" || before.status === "draft" || before.status === "cancelled") {
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.deleteMany({ where: { sourceType: "purchase_order", sourceId: id } });
        await tx.purchaseOrder.delete({ where: { id } });
      });
      await audit({ action: "delete", entityType: "PurchaseOrder", entityId: id, before });
      await refreshAroundPurchaseOrder(before);
      return ok({ id });
    }

    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
      await syncPurchaseOrderMovement(tx, updated);
      return updated;
    });
    await audit({ action: "cancel", entityType: "PurchaseOrder", entityId: id, before, after });
    await refreshAroundPurchaseOrder(before, after);
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

function dateOrNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}
