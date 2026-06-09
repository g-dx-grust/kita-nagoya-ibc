// Wires the pure calculation library against the DB so it can be reused by
// API routes that need plan-level estimates with persisted requirement rows.

import { prisma } from "./prisma";
import { loadActiveBreakWindows } from "./break-windows";
import { getInventoryFor } from "./inventory";
import {
  cancelProductionPlanPlannedMovements,
  replaceProductionPlanPlannedMovements,
} from "./inventory-ledger";
import { refreshCumulativeMaterialRequirements } from "./material-forecast";
import {
  computeCostEstimate,
  computeMaterialRequirements,
  computeProductionDuration,
  type BomItem,
} from "./calculations";

export async function loadProductBom(
  productId: string,
  effectiveDate: Date = new Date(),
): Promise<BomItem[]> {
  const rows = await prisma.productBomItem.findMany({
    where: {
      productId,
      active: true,
      OR: [{ validFrom: null }, { validFrom: { lte: effectiveDate } }],
      AND: [{ OR: [{ validTo: null }, { validTo: { gt: effectiveDate } }] }],
    },
  });
  if (rows.length === 0) return [];

  const rmIds = rows.filter((r) => r.itemType === "raw_material").map((r) => r.itemId);
  const pkIds = rows.filter((r) => r.itemType === "packaging").map((r) => r.itemId);

  const [rms, pks] = await Promise.all([
    rmIds.length ? prisma.material.findMany({ where: { id: { in: rmIds } } }) : Promise.resolve([]),
    pkIds.length
      ? prisma.packagingMaterial.findMany({ where: { id: { in: pkIds } } })
      : Promise.resolve([]),
  ]);
  const rmMap = new Map(rms.map((r) => [r.id, r]));
  const pkMap = new Map(pks.map((r) => [r.id, r]));

  return rows.map((r) => {
    const ref =
      r.itemType === "raw_material" ? rmMap.get(r.itemId) : pkMap.get(r.itemId);
    return {
      itemType: r.itemType as BomItem["itemType"],
      itemId: r.itemId,
      itemName: ref?.name ?? "(削除済み)",
      unit: r.unit,
      quantityPerUnit: r.quantityPerUnit,
      lossRate: r.lossRate,
      unitPrice: ref?.standardUnitPrice ?? 0,
    };
  });
}

export async function getCurrentBillingUnitPrice(productId: string, onDate: Date): Promise<number> {
  const row = await prisma.billingPrice.findFirst({
    where: {
      productId,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return row?.unitPrice ?? 0;
}

export async function getCapacity(productId: string, workAreaId: string) {
  return prisma.productionCapacity.findUnique({
    where: { productId_workAreaId: { productId, workAreaId } },
  });
}

export async function recalculateProductionPlan(
  planId: string,
  options: { refreshMaterialForecast?: boolean } = {},
) {
  const plan = await prisma.productionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("plan_not_found");

  const capacity = await getCapacity(plan.productId, plan.workAreaId);
  const upph = capacity?.unitsPerPersonHour ?? 0;

  // Duration
  const breakWindows = await loadActiveBreakWindows(plan.date);
  const duration = computeProductionDuration({
    quantity: plan.plannedQuantity,
    unitsPerPersonHour: upph,
    peopleCount: plan.plannedPeopleCount,
    startTime: plan.plannedStartTime,
    breakWindows,
    baselineEndTime: plan.baselineEndTime,
  });

  // Material requirements
  const bom = await loadProductBom(plan.productId, plan.date);
  const itemIds = bom.map((b) => b.itemId);
  const rmInv = await getInventoryFor(
    "raw_material",
    bom.filter((b) => b.itemType === "raw_material").map((b) => b.itemId),
    plan.date,
  );
  const pkInv = await getInventoryFor(
    "packaging",
    bom.filter((b) => b.itemType === "packaging").map((b) => b.itemId),
    plan.date,
  );
  const inventory: Record<
    string,
    { onHand: number; confirmedInbound: number; unconfirmedInbound: number }
  > = {};
  for (const id of itemIds) inventory[id] = rmInv[id] ?? pkInv[id] ?? {
    onHand: 0,
    confirmedInbound: 0,
    unconfirmedInbound: 0,
  };

  const lines = computeMaterialRequirements({ quantity: plan.plannedQuantity, bom, inventory });
  const materialCost = lines
    .filter((l) => l.itemType === "raw_material")
    .reduce((a, b) => a + b.cost, 0);
  const packagingCost = lines
    .filter((l) => l.itemType === "packaging")
    .reduce((a, b) => a + b.cost, 0);

  const billingUnitPrice = await getCurrentBillingUnitPrice(plan.productId, plan.date);
  const cost = computeCostEstimate({
    quantity: plan.plannedQuantity,
    billingUnitPrice,
    materialCost,
    packagingCost,
  });

  // Persist requirement snapshots and cached estimates.
  await prisma.$transaction(async (tx) => {
    await tx.productionPlanRequirement.deleteMany({ where: { productionPlanId: planId } });
    if (lines.length > 0) {
      await tx.productionPlanRequirement.createMany({
        data: lines.map((l) => ({
          productionPlanId: planId,
          itemType: l.itemType,
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.unit,
          plannedQuantity: l.plannedQuantity,
          onHandQuantity: l.onHand,
          confirmedInbound: l.confirmedInbound,
          unconfirmedInbound: l.unconfirmedInbound,
          shortageQuantity: l.shortageQuantity,
          shortageType: l.shortageType,
          unitPriceSnapshot: l.unitPrice,
        })),
      });
    }
    if (plan.status === "cancelled") {
      await cancelProductionPlanPlannedMovements(tx, planId);
    } else {
      await replaceProductionPlanPlannedMovements(tx, plan, lines);
    }
    await tx.productionPlan.update({
      where: { id: planId },
      data: {
        plannedEndTime: duration.endTime,
        overtimeMinutes: duration.overtimeMinutes,
        estUnitsPerPersonHour: upph,
        estLaborCost: cost.laborCost,
        estMaterialCost: cost.materialCost,
        estPackagingCost: cost.packagingCost,
        estTotalCost: cost.totalCost,
      },
    });
  });

  if (options.refreshMaterialForecast ?? true) {
    const horizonEnd = new Date(plan.date);
    horizonEnd.setDate(horizonEnd.getDate() + 90);
    const today = startOfDay(new Date());
    const planDay = startOfDay(plan.date);
    await refreshCumulativeMaterialRequirements({
      dateFrom: planDay < today ? planDay : today,
      dateTo: horizonEnd,
    });
  }

  return {
    duration,
    requirements: lines,
    cost,
    capacityFound: !!capacity,
    billingUnitPrice,
  };
}

function startOfDay(date: Date) {
  return new Date(date.toISOString().slice(0, 10));
}
