import { audit } from "@/lib/audit";
import { handleError, HttpError, notFound, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { refreshAroundPurchaseOrder } from "@/lib/purchase-order-refresh";
import { syncPurchaseOrderMovement } from "@/lib/purchase-order-stock-sync";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!before) return notFound();
    if (before.status !== "ordered_unconfirmed") {
      throw new HttpError(400, "invalid_status", {
        expected: "ordered_unconfirmed",
        actual: before.status,
      });
    }

    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: "confirmed" },
      });
      await syncPurchaseOrderMovement(tx, updated);
      return updated;
    });

    await audit({
      action: "confirm_purchase_order",
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
