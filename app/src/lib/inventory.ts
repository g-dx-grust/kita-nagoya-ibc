import { prisma } from "./prisma";
import { INVENTORY_LEDGER_STATUS, MOVEMENT_TYPE } from "./inventory-types";

export type InventoryItemType = "product" | "raw_material" | "packaging";

export type InventorySnapshot = {
  itemId: string;
  onHand: number;
  plannedIn: number;
  plannedOut: number;
  confirmedInbound: number;
  unconfirmedInbound: number;
  theoreticalStock: number;
};

export type InventoryRow = InventorySnapshot;

export type InventoryMovementInput = {
  itemId: string;
  movementType: string;
  quantity: number;
  status: string;
  sourceType?: string | null;
  sourceId?: string | null;
};

export type InventoryPurchaseOrderInput = {
  id: string;
  itemId: string;
  orderedQuantity: number;
  confirmedQuantity?: number | null;
  status: string;
};

export async function getInventoryFor(
  itemType: InventoryItemType,
  itemIds: string[],
  asOfDate: Date,
): Promise<Record<string, InventorySnapshot>> {
  if (itemIds.length === 0) return {};

  const [movements, pos] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        itemType,
        itemId: { in: itemIds },
        status: { in: [INVENTORY_LEDGER_STATUS.CONFIRMED, INVENTORY_LEDGER_STATUS.PLANNED] },
        effectiveDate: { lte: asOfDate },
      },
      select: {
        itemId: true,
        movementType: true,
        quantity: true,
        status: true,
        sourceType: true,
        sourceId: true,
      },
    }),
    itemType === "product"
      ? Promise.resolve([])
      : prisma.purchaseOrder.findMany({
          where: {
            itemType,
            itemId: { in: itemIds },
            status: { in: ["confirmed", "ordered_unconfirmed"] },
            OR: [{ expectedArrivalDate: null }, { expectedArrivalDate: { lte: asOfDate } }],
          },
          select: {
            id: true,
            itemId: true,
            orderedQuantity: true,
            confirmedQuantity: true,
            status: true,
          },
        }),
  ]);

  // A confirmed daily report supersedes its production plan's PLANNED rows with
  // CONFIRMED ACTUAL rows, but the PLANNED rows intentionally remain in the ledger.
  // Without skipping them the theoretical stock would double-count (planned +
  // actual). Collect the candidate base plan ids referenced by PLANNED
  // production_plan movements and keep only the ones whose plan is completed.
  const candidatePlanIds = new Set<string>();
  for (const movement of movements) {
    if (
      movement.status === INVENTORY_LEDGER_STATUS.PLANNED &&
      movement.sourceType === "production_plan" &&
      movement.sourceId
    ) {
      candidatePlanIds.add(basePlanId(movement.sourceId));
    }
  }
  const supersededPlanIds = new Set<string>();
  if (candidatePlanIds.size > 0) {
    const completed = await prisma.productionPlan.findMany({
      where: { id: { in: [...candidatePlanIds] }, status: "completed" },
      select: { id: true },
    });
    for (const plan of completed) supersededPlanIds.add(plan.id);
  }

  return summarizeInventorySnapshots(itemIds, movements, pos, supersededPlanIds);
}

// PLANNED production_plan material rows carry a sourceId of the form
// `${planId}:${itemType}:${itemId}:${index}`, while the product row uses the
// bare planId. The base plan id is always the first ':'-separated segment.
function basePlanId(sourceId: string): string {
  return String(sourceId).split(":")[0];
}

export function summarizeInventorySnapshots(
  itemIds: string[],
  movements: InventoryMovementInput[],
  purchaseOrders: InventoryPurchaseOrderInput[] = [],
  supersededPlanIds: Set<string> = new Set(),
): Record<string, InventorySnapshot> {
  const result: Record<string, InventorySnapshot> = Object.fromEntries(
    itemIds.map((id) => [
      id,
      {
        itemId: id,
        onHand: 0,
        plannedIn: 0,
        plannedOut: 0,
        confirmedInbound: 0,
        unconfirmedInbound: 0,
        theoreticalStock: 0,
      },
    ]),
  );
  const movementBackedPurchaseOrderIds = new Set<string>();

  for (const movement of movements) {
    const row = result[movement.itemId];
    if (!row || movement.status === INVENTORY_LEDGER_STATUS.CANCELLED) continue;
    // A completed plan's PLANNED rows are superseded by the daily report's
    // CONFIRMED ACTUAL rows; skip them so theoretical stock is not double-counted.
    if (
      movement.status === INVENTORY_LEDGER_STATUS.PLANNED &&
      movement.sourceType === "production_plan" &&
      movement.sourceId &&
      supersededPlanIds.has(String(movement.sourceId).split(":")[0])
    ) {
      continue;
    }
    if (movement.sourceType === "purchase_order" && movement.sourceId) {
      movementBackedPurchaseOrderIds.add(movement.sourceId);
    }
    if (movement.status === INVENTORY_LEDGER_STATUS.CONFIRMED) {
      row.onHand += movement.quantity;
      continue;
    }
    if (movement.status !== INVENTORY_LEDGER_STATUS.PLANNED) continue;

    if (movement.quantity >= 0) row.plannedIn += movement.quantity;
    else row.plannedOut += Math.abs(movement.quantity);

    if (movement.movementType === MOVEMENT_TYPE.INBOUND_CONFIRMED) {
      row.confirmedInbound += Math.max(0, movement.quantity);
    } else if (movement.movementType === MOVEMENT_TYPE.INBOUND_UNCONFIRMED) {
      row.unconfirmedInbound += Math.max(0, movement.quantity);
    }
  }

  for (const po of purchaseOrders) {
    if (movementBackedPurchaseOrderIds.has(po.id)) continue;
    const row = result[po.itemId];
    if (!row) continue;
    const qty = po.confirmedQuantity ?? po.orderedQuantity;
    row.plannedIn += qty;
    if (po.status === "confirmed") row.confirmedInbound += qty;
    else if (po.status === "ordered_unconfirmed") row.unconfirmedInbound += qty;
  }

  for (const row of Object.values(result)) {
    row.onHand = round4(row.onHand);
    row.plannedIn = round4(row.plannedIn);
    row.plannedOut = round4(row.plannedOut);
    row.confirmedInbound = round4(row.confirmedInbound);
    row.unconfirmedInbound = round4(row.unconfirmedInbound);
    row.theoreticalStock = round4(row.onHand + row.plannedIn - row.plannedOut);
  }

  return result;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
