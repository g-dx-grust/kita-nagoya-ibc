import { HttpError } from "./http";
import { INVENTORY_LEDGER_STATUS } from "./inventory-types";
import { audit } from "./audit";
import {
  buildMaterialForecast,
  itemKey,
  type MaterialForecastInbound,
  type MaterialForecastLine,
  type MaterialForecastRequirement,
  type MaterialItemType,
  type MaterialShortageType,
} from "./material-forecast";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "./plan-status";
import { prisma } from "./prisma";

export type PlanBackingBlockingRequirement = {
  requirementId: string;
  itemType: MaterialItemType;
  itemId: string;
  itemName: string;
  shortageType: MaterialShortageType;
  reason: string;
};

export type PlanBackingResult = {
  planId: string;
  canTentativeConfirm: boolean;
  canConfirm: boolean;
  blockingRequirements: PlanBackingBlockingRequirement[];
  backingPurchaseOrderIds: string[];
};

export type PlanBackingStatusSyncResult = {
  promoted: Array<{ planId: string; backingPurchaseOrderIds: string[] }>;
  demoted: Array<{ planId: string; blockingRequirements: PlanBackingBlockingRequirement[] }>;
  unchanged: Array<{ planId: string; status: string; canTentativeConfirm: boolean }>;
};

type BackingLine = Pick<
  MaterialForecastLine,
  | "requirementId"
  | "productionPlanId"
  | "itemType"
  | "itemId"
  | "itemName"
  | "plannedQuantity"
  | "onHandBefore"
  | "shortageType"
>;

export function evaluatePlanBackingFromLines({
  planId,
  lines,
  backingPurchaseOrderIds = [],
}: {
  planId: string;
  lines: BackingLine[];
  backingPurchaseOrderIds?: string[];
}): PlanBackingResult {
  const planLines = lines.filter((line) => line.productionPlanId === planId);
  if (planLines.length === 0) {
    return {
      planId,
      canTentativeConfirm: false,
      canConfirm: false,
      blockingRequirements: [
        {
          requirementId: "",
          itemType: "raw_material",
          itemId: "",
          itemName: "BOM未登録または所要量未計算",
          shortageType: "hard_shortage",
          reason: "BOM未登録または所要量未計算です。",
        },
      ],
      backingPurchaseOrderIds: [...new Set(backingPurchaseOrderIds)].sort(),
    };
  }

  const blockingRequirements: PlanBackingBlockingRequirement[] = [];

  for (const line of planLines) {
    if (line.shortageType === "hard_shortage") {
      blockingRequirements.push({
        requirementId: line.requirementId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        shortageType: line.shortageType,
        reason: "製造日までに確定在庫・入荷予定で所要量を賄えません。",
      });
      continue;
    }
    if (
      line.shortageType === "unconfirmed_dependency" ||
      line.onHandBefore < line.plannedQuantity
    ) {
      blockingRequirements.push({
        requirementId: line.requirementId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        shortageType: line.shortageType,
        reason: "未確定入荷への依存が残っているため、確定には進めません。",
      });
    }
  }

  return {
    planId,
    canTentativeConfirm: planLines.every((line) => line.shortageType !== "hard_shortage"),
    canConfirm: planLines.every(
      (line) =>
        (line.shortageType === "none" || line.shortageType === "below_safety") &&
        line.onHandBefore >= line.plannedQuantity,
    ),
    blockingRequirements,
    backingPurchaseOrderIds: [...new Set(backingPurchaseOrderIds)].sort(),
  };
}

export async function evaluatePlanBacking(planIds: string[]): Promise<PlanBackingResult[]> {
  const uniquePlanIds = [...new Set(planIds)].filter(Boolean);
  if (uniquePlanIds.length === 0) return [];

  const targetPlans = await prisma.productionPlan.findMany({
    where: { id: { in: uniquePlanIds } },
    include: { requirements: true },
    orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }, { id: "asc" }],
  });
  if (targetPlans.length === 0) return [];

  const targetPlanIds = new Set(targetPlans.map((plan) => plan.id));
  const dateFrom = startOfMonth(minDate(targetPlans.map((plan) => plan.date)));
  const dateTo = maxDate(targetPlans.map((plan) => plan.date));
  const relevantItems = uniqueItems(
    targetPlans.flatMap((plan) =>
      plan.requirements.map((requirement) => ({
        itemType: requirement.itemType as MaterialItemType,
        itemId: requirement.itemId,
      })),
    ),
  );

  if (relevantItems.length === 0) {
    return targetPlans.map((plan) =>
      evaluatePlanBackingFromLines({ planId: plan.id, lines: [], backingPurchaseOrderIds: [] }),
    );
  }

  const itemWhere = itemWhereClause(relevantItems);
  const [openings, confirmedMovements, purchaseOrders, requirements, materials, packaging] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ["itemType", "itemId"],
      where: {
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: dateFrom },
        OR: itemWhere,
      },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { gt: dateFrom, lte: dateTo },
        OR: itemWhere,
      },
      select: {
        itemType: true,
        itemId: true,
        quantity: true,
        effectiveDate: true,
        id: true,
      },
      orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["confirmed", "ordered_unconfirmed"] },
        expectedArrivalDate: { not: null, lte: dateTo },
        OR: itemWhere,
      },
      orderBy: [{ expectedArrivalDate: "asc" }, { id: "asc" }],
    }),
    prisma.productionPlanRequirement.findMany({
      where: {
        OR: itemWhere,
        productionPlan: {
          date: { gte: dateFrom, lte: dateTo },
          status: { in: [...PLANNED_PRODUCTION_PLAN_STATUSES] },
        },
      },
      include: { productionPlan: true },
    }),
    prisma.material.findMany({
      where: { id: { in: relevantItems.filter((item) => item.itemType === "raw_material").map((item) => item.itemId) } },
      select: { id: true, safetyStockQuantity: true },
    }),
    prisma.packagingMaterial.findMany({
      where: { id: { in: relevantItems.filter((item) => item.itemType === "packaging").map((item) => item.itemId) } },
      select: { id: true, safetyStockQuantity: true },
    }),
  ]);

  const openingByItemKey: Record<string, number> = {};
  for (const row of openings) {
    openingByItemKey[itemKey(row.itemType as MaterialItemType, row.itemId)] = row._sum.quantity ?? 0;
  }

  const safetyByItemKey: Record<string, number> = {};
  for (const material of materials) {
    safetyByItemKey[itemKey("raw_material", material.id)] = material.safetyStockQuantity;
  }
  for (const material of packaging) {
    safetyByItemKey[itemKey("packaging", material.id)] = material.safetyStockQuantity;
  }

  const requirementInputs: MaterialForecastRequirement[] = requirements.map((requirement) => ({
    requirementId: requirement.id,
    productionPlanId: requirement.productionPlanId,
    date: toDateKey(requirement.productionPlan.date),
    sortKey: `${requirement.productionPlan.plannedStartTime}#${requirement.productionPlanId}#${requirement.id}`,
    itemType: requirement.itemType as MaterialItemType,
    itemId: requirement.itemId,
    itemName: requirement.itemName,
    unit: requirement.unit,
    plannedQuantity: requirement.plannedQuantity,
  }));
  const confirmedMovementInbounds: MaterialForecastInbound[] = confirmedMovements.map((movement) => ({
    date: toDateKey(movement.effectiveDate),
    itemType: movement.itemType as MaterialItemType,
    itemId: movement.itemId,
    quantity: movement.quantity,
    status: "confirmed",
  }));
  const purchaseOrderInbounds: MaterialForecastInbound[] = purchaseOrders.map((purchaseOrder) => ({
    date: toDateKey(purchaseOrder.expectedArrivalDate!),
    itemType: purchaseOrder.itemType as MaterialItemType,
    itemId: purchaseOrder.itemId,
    quantity: purchaseOrder.confirmedQuantity ?? purchaseOrder.orderedQuantity,
    status: purchaseOrder.status as MaterialForecastInbound["status"],
  }));
  const inbounds: MaterialForecastInbound[] = [...confirmedMovementInbounds, ...purchaseOrderInbounds];
  const lines = buildMaterialForecast({
    requirements: requirementInputs,
    openingByItemKey,
    inbounds,
    safetyByItemKey,
  });
  const backingPurchaseOrderIdsByPlanId = allocateBackingPurchaseOrders({
    requirements: requirementInputs,
    purchaseOrders: purchaseOrders.map((purchaseOrder) => ({
      id: purchaseOrder.id,
      itemType: purchaseOrder.itemType as MaterialItemType,
      itemId: purchaseOrder.itemId,
      date: toDateKey(purchaseOrder.expectedArrivalDate!),
      quantity: purchaseOrder.confirmedQuantity ?? purchaseOrder.orderedQuantity,
      status: purchaseOrder.status as "confirmed" | "ordered_unconfirmed",
    })),
    confirmedMovements: confirmedMovements.map((movement) => ({
      itemType: movement.itemType as MaterialItemType,
      itemId: movement.itemId,
      date: toDateKey(movement.effectiveDate),
      quantity: movement.quantity,
    })),
    openingByItemKey,
    targetPlanIds,
  });

  return targetPlans.map((plan) =>
    evaluatePlanBackingFromLines({
      planId: plan.id,
      lines,
      backingPurchaseOrderIds: backingPurchaseOrderIdsByPlanId.get(plan.id) ?? [],
    }),
  );
}

export async function assertTentativeConfirmEligible(planId: string) {
  const result = await singleBackingResult(planId);
  if (!result.canTentativeConfirm) {
    throw new HttpError(400, "plan_not_tentative_confirmable", result);
  }
  return result;
}

export async function assertConfirmEligible(planId: string) {
  const result = await singleBackingResult(planId);
  if (!result.canConfirm) {
    throw new HttpError(400, "plan_not_confirmable", result);
  }
  return result;
}

export async function syncPlanBackingStatuses(planIds: string[]): Promise<PlanBackingStatusSyncResult> {
  const uniquePlanIds = [...new Set(planIds)].filter(Boolean);
  if (uniquePlanIds.length === 0) return { promoted: [], demoted: [], unchanged: [] };

  const plans = await prisma.productionPlan.findMany({
    where: {
      id: { in: uniquePlanIds },
      status: { in: ["draft", "tentative_confirmed"] },
    },
    select: { id: true, status: true },
  });
  if (plans.length === 0) return { promoted: [], demoted: [], unchanged: [] };

  const results = await evaluatePlanBacking(plans.map((plan) => plan.id));
  const resultByPlanId = new Map(results.map((result) => [result.planId, result]));
  const syncResult: PlanBackingStatusSyncResult = { promoted: [], demoted: [], unchanged: [] };

  for (const plan of plans) {
    const backing = resultByPlanId.get(plan.id);
    if (!backing) continue;

    if (plan.status === "draft" && backing.canTentativeConfirm) {
      const claimed = await prisma.productionPlan.updateMany({
        where: { id: plan.id, status: "draft" },
        data: { status: "tentative_confirmed" },
      });
      if (claimed.count === 1) {
        const after = await prisma.productionPlan.findUnique({ where: { id: plan.id } });
        await audit({
          action: "auto_tentative_confirm",
          entityType: "ProductionPlan",
          entityId: plan.id,
          before: plan,
          after: { status: after?.status, backing },
        });
        syncResult.promoted.push({
          planId: plan.id,
          backingPurchaseOrderIds: backing.backingPurchaseOrderIds,
        });
      }
      continue;
    }

    if (plan.status === "tentative_confirmed" && !backing.canTentativeConfirm) {
      const claimed = await prisma.productionPlan.updateMany({
        where: { id: plan.id, status: "tentative_confirmed" },
        data: { status: "draft" },
      });
      if (claimed.count === 1) {
        const after = await prisma.productionPlan.findUnique({ where: { id: plan.id } });
        await audit({
          action: "auto_demote_to_draft",
          entityType: "ProductionPlan",
          entityId: plan.id,
          before: plan,
          after: {
            status: after?.status,
            reason: "tentative_confirm_gate_failed",
            backing,
          },
        });
        syncResult.demoted.push({
          planId: plan.id,
          blockingRequirements: backing.blockingRequirements,
        });
      }
      continue;
    }

    syncResult.unchanged.push({
      planId: plan.id,
      status: plan.status,
      canTentativeConfirm: backing.canTentativeConfirm,
    });
  }

  return syncResult;
}

async function singleBackingResult(planId: string) {
  const [result] = await evaluatePlanBacking([planId]);
  if (!result) throw new HttpError(404, "production_plan_not_found");
  return result;
}

function allocateBackingPurchaseOrders({
  requirements,
  purchaseOrders,
  confirmedMovements,
  openingByItemKey,
  targetPlanIds,
}: {
  requirements: MaterialForecastRequirement[];
  purchaseOrders: Array<{
    id: string | null;
    itemType: MaterialItemType;
    itemId: string;
    date: string;
    quantity: number;
    status: "confirmed" | "ordered_unconfirmed";
  }>;
  confirmedMovements?: Array<{
    itemType: MaterialItemType;
    itemId: string;
    date: string;
    quantity: number;
  }>;
  openingByItemKey: Record<string, number>;
  targetPlanIds: Set<string>;
}) {
  const ordersByKey = new Map<string, typeof purchaseOrders>();
  for (const movement of confirmedMovements ?? []) {
    const key = itemKey(movement.itemType, movement.itemId);
    const rows = ordersByKey.get(key) ?? [];
    rows.push({
      id: null,
      itemType: movement.itemType,
      itemId: movement.itemId,
      date: movement.date,
      quantity: movement.quantity,
      status: "confirmed",
    });
    ordersByKey.set(key, rows);
  }
  for (const order of purchaseOrders) {
    const key = itemKey(order.itemType, order.itemId);
    const rows = ordersByKey.get(key) ?? [];
    rows.push(order);
    ordersByKey.set(key, rows);
  }
  for (const rows of ordersByKey.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  }

  const requirementsByKey = new Map<string, MaterialForecastRequirement[]>();
  for (const requirement of requirements) {
    const key = itemKey(requirement.itemType, requirement.itemId);
    const rows = requirementsByKey.get(key) ?? [];
    rows.push(requirement);
    requirementsByKey.set(key, rows);
  }

  const backingIdsByPlanId = new Map<string, string[]>();
  for (const [key, rows] of requirementsByKey) {
    rows.sort(compareRequirement);
    const purchaseRows = ordersByKey.get(key) ?? [];
    let purchaseIndex = 0;
    const lots: Array<{ id: string | null; remaining: number; status: "confirmed" | "ordered_unconfirmed" }> = [
      { id: null, remaining: openingByItemKey[key] ?? 0, status: "confirmed" },
    ];

    for (const requirement of rows) {
      while (purchaseIndex < purchaseRows.length && purchaseRows[purchaseIndex].date <= requirement.date) {
        const order = purchaseRows[purchaseIndex];
        if (order.quantity >= 0) {
          lots.push({ id: order.id, remaining: order.quantity, status: order.status });
        } else {
          consumeLots(lots, Math.abs(order.quantity), order.status);
        }
        purchaseIndex += 1;
      }

      let remaining = requirement.plannedQuantity;
      for (const status of ["confirmed", "ordered_unconfirmed"] as const) {
        for (const lot of lots) {
          if (remaining <= 0) break;
          if (lot.status !== status || lot.remaining <= 0) continue;
          const used = Math.min(lot.remaining, remaining);
          lot.remaining = round4(lot.remaining - used);
          remaining = round4(remaining - used);
          if (lot.id && targetPlanIds.has(requirement.productionPlanId)) {
            const ids = backingIdsByPlanId.get(requirement.productionPlanId) ?? [];
            ids.push(lot.id);
            backingIdsByPlanId.set(requirement.productionPlanId, ids);
          }
        }
      }
    }
  }

  return backingIdsByPlanId;
}

function consumeLots(
  lots: Array<{ id: string | null; remaining: number; status: "confirmed" | "ordered_unconfirmed" }>,
  quantity: number,
  status: "confirmed" | "ordered_unconfirmed",
) {
  let remaining = quantity;
  for (const lot of lots) {
    if (remaining <= 0) break;
    if (lot.status !== status || lot.remaining <= 0) continue;
    const used = Math.min(lot.remaining, remaining);
    lot.remaining = round4(lot.remaining - used);
    remaining = round4(remaining - used);
  }
}

function itemWhereClause(items: Array<{ itemType: MaterialItemType; itemId: string }>) {
  return items.map((item) => ({ itemType: item.itemType, itemId: item.itemId }));
}

function uniqueItems(items: Array<{ itemType: MaterialItemType; itemId: string }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item.itemType, item.itemId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareRequirement(a: MaterialForecastRequirement, b: MaterialForecastRequirement) {
  return (
    a.itemType.localeCompare(b.itemType) ||
    a.itemId.localeCompare(b.itemId) ||
    a.date.localeCompare(b.date) ||
    a.sortKey.localeCompare(b.sortKey)
  );
}

function minDate(dates: Date[]) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function maxDate(dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
