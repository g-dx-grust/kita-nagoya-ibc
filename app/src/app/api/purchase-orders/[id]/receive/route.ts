import { audit } from "@/lib/audit";
import { handleError, HttpError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { refreshAroundPurchaseOrder } from "@/lib/purchase-order-refresh";
import { syncPurchaseOrderMovement } from "@/lib/purchase-order-stock-sync";
import { PurchaseOrderReceiveSchema } from "@/lib/schemas";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, PurchaseOrderReceiveSchema);
    const before = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!before) return notFound();
    if (before.status !== "confirmed") {
      throw new HttpError(400, "invalid_status", {
        expected: "confirmed",
        actual: before.status,
      });
    }

    const receivedDate = body.receivedDate ? new Date(body.receivedDate) : new Date();
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "received",
          receivedQuantity: body.receivedQuantity,
          receivedDate,
        },
      });
      await syncPurchaseOrderMovement(tx, updated);
      return updated;
    });

    await audit({
      action: "receive_purchase_order",
      entityType: "PurchaseOrder",
      entityId: id,
      before,
      after,
    });
    await refreshAroundPurchaseOrder(before, after);

    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
