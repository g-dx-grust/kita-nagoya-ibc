import type { Prisma, PurchaseOrder } from "@prisma/client";
import { INVENTORY_LEDGER_STATUS, MOVEMENT_TYPE } from "./inventory-types";

export type PurchaseOrderStockSyncClient = Prisma.TransactionClient;

export async function syncPurchaseOrderMovement(
  tx: PurchaseOrderStockSyncClient,
  purchaseOrder: PurchaseOrder,
) {
  if (purchaseOrder.status === "candidate" || purchaseOrder.status === "draft") {
    await tx.stockMovement.deleteMany({
      where: { sourceType: "purchase_order", sourceId: purchaseOrder.id },
    });
    return;
  }

  if (purchaseOrder.status === "cancelled") {
    await tx.stockMovement.updateMany({
      where: { sourceType: "purchase_order", sourceId: purchaseOrder.id },
      data: { status: INVENTORY_LEDGER_STATUS.CANCELLED },
    });
    return;
  }

  await tx.stockMovement.deleteMany({
    where: { sourceType: "purchase_order", sourceId: purchaseOrder.id },
  });

  const confirmedLike = purchaseOrder.status === "confirmed" || purchaseOrder.status === "received";
  await tx.stockMovement.create({
    data: {
      itemType: purchaseOrder.itemType,
      itemId: purchaseOrder.itemId,
      movementType: confirmedLike
        ? MOVEMENT_TYPE.INBOUND_CONFIRMED
        : MOVEMENT_TYPE.INBOUND_UNCONFIRMED,
      quantity: purchaseOrderQuantityForMovement(purchaseOrder),
      effectiveDate:
        purchaseOrder.receivedDate ??
        purchaseOrder.expectedArrivalDate ??
        purchaseOrder.shortageDate ??
        purchaseOrder.recommendedOrderDate ??
        new Date(),
      sourceType: "purchase_order",
      sourceId: purchaseOrder.id,
      status:
        purchaseOrder.status === "received"
          ? INVENTORY_LEDGER_STATUS.CONFIRMED
          : INVENTORY_LEDGER_STATUS.PLANNED,
    },
  });
}

function purchaseOrderQuantityForMovement(purchaseOrder: PurchaseOrder) {
  if (purchaseOrder.status === "received") {
    return purchaseOrder.receivedQuantity ?? purchaseOrder.confirmedQuantity ?? purchaseOrder.orderedQuantity;
  }
  return purchaseOrder.confirmedQuantity ?? purchaseOrder.orderedQuantity;
}
