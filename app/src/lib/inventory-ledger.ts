import type { DailyReportConsumption, Prisma, ProductionPlan } from "@prisma/client";
import type { RequirementLine } from "./calculations";
import { INVENTORY_LEDGER_STATUS, MOVEMENT_TYPE, PRODUCTION_DAILY_REPORT_SOURCE } from "./inventory-types";
export { syncPurchaseOrderMovement } from "./purchase-order-stock-sync";

type LedgerClient = Prisma.TransactionClient;

export async function replaceProductionPlanPlannedMovements(
  tx: LedgerClient,
  plan: ProductionPlan,
  requirements: RequirementLine[],
) {
  await tx.stockMovement.deleteMany({
    where: productionPlanMovementWhere(plan.id, INVENTORY_LEDGER_STATUS.PLANNED),
  });

  const requirementRows = requirements.map((line, index) => ({
    itemType: line.itemType,
    itemId: line.itemId,
    movementType: MOVEMENT_TYPE.PLANNED_MATERIAL_USE,
    quantity: -Math.abs(line.plannedQuantity),
    effectiveDate: plan.date,
    sourceType: "production_plan",
    sourceId: sourceIdForRepeatedMovement(plan.id, requirements.length, line.itemType, line.itemId, index),
    status: INVENTORY_LEDGER_STATUS.PLANNED,
    unitPrice: line.unitPrice,
    note: line.itemName,
  }));

  await tx.stockMovement.createMany({
    data: [
      {
        itemType: "product",
        itemId: plan.productId,
        movementType: MOVEMENT_TYPE.PLANNED_PRODUCTION_IN,
        quantity: plan.plannedQuantity,
        effectiveDate: plan.date,
        sourceType: "production_plan",
        sourceId: plan.id,
        status: INVENTORY_LEDGER_STATUS.PLANNED,
      },
      ...requirementRows,
    ],
  });
}

export async function cancelProductionPlanPlannedMovements(
  tx: LedgerClient,
  productionPlanId: string,
) {
  await tx.stockMovement.updateMany({
    where: productionPlanMovementWhere(productionPlanId, INVENTORY_LEDGER_STATUS.PLANNED),
    data: { status: INVENTORY_LEDGER_STATUS.CANCELLED },
  });
}

export async function replaceDailyReportActualMovements(
  tx: LedgerClient,
  report: {
    id: string;
    actualQuantity: number | null;
    consumptions: DailyReportConsumption[];
  },
  plan: ProductionPlan,
) {
  await tx.stockMovement.deleteMany({
    where: dailyReportMovementWhere(report.id),
  });

  const consumptionRows = report.consumptions.map((consumption, index) => ({
    itemType: consumption.itemType,
    itemId: consumption.itemId,
    movementType: MOVEMENT_TYPE.ACTUAL_MATERIAL_USE,
    quantity: -Math.abs(consumption.actualQuantity),
    effectiveDate: plan.date,
    sourceType: "daily_report",
    sourceId: sourceIdForRepeatedMovement(
      report.id,
      report.consumptions.length,
      consumption.itemType,
      consumption.itemId,
      index,
    ),
    status: INVENTORY_LEDGER_STATUS.CONFIRMED,
    unitPrice: consumption.unitPriceSnapshot,
  }));

  const productRows =
    report.actualQuantity != null && report.actualQuantity > 0
      ? [
          {
            itemType: "product",
            itemId: plan.productId,
            movementType: MOVEMENT_TYPE.ACTUAL_PRODUCTION_IN,
            quantity: report.actualQuantity,
            effectiveDate: plan.date,
            sourceType: "daily_report",
            sourceId: report.id,
            status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          },
        ]
      : [];

  const data = [...consumptionRows, ...productRows];
  if (data.length > 0) await tx.stockMovement.createMany({ data });
}

// 日報蓄積(ProductionDailyReportEntry)の保存時に、実績の在庫差引を冪等に反映する。
// itemId を持つ消費(原料=実測kg / 資材=BOM標準量)は ACTUAL_MATERIAL_USE(負)、
// productId があれば ACTUAL_PRODUCTION_IN(正)。編集時は prefix 一致で既存を全削除して作り直す(冪等)。
export type ProductionDailyReportConsumption = {
  itemType: "raw_material" | "packaging";
  itemId: string | null;
  quantity: number;
  unitPrice: number;
};

export async function replaceProductionDailyReportMovements(
  tx: LedgerClient,
  entry: {
    id: string;
    productId: string | null;
    productionQty: number;
    reportDate: Date;
  },
  consumptions: ProductionDailyReportConsumption[],
) {
  await tx.stockMovement.deleteMany({ where: productionDailyReportMovementWhere(entry.id) });

  const deductible = consumptions.filter((c) => c.itemId && Math.abs(c.quantity) > 0);
  const consumptionRows = deductible.map((c, index) => ({
    itemType: c.itemType,
    itemId: c.itemId as string,
    movementType: MOVEMENT_TYPE.ACTUAL_MATERIAL_USE,
    quantity: -Math.abs(c.quantity),
    effectiveDate: entry.reportDate,
    sourceType: PRODUCTION_DAILY_REPORT_SOURCE,
    // 単一消費でも常に suffix を付与し、製品IN(bare id)との衝突や delete-by-prefix を単純化する。
    sourceId: `${entry.id}:${c.itemType}:${c.itemId}:${index}`,
    status: INVENTORY_LEDGER_STATUS.CONFIRMED,
    unitPrice: c.unitPrice,
  }));

  const productRows =
    entry.productId && entry.productionQty > 0
      ? [
          {
            itemType: "product",
            itemId: entry.productId,
            movementType: MOVEMENT_TYPE.ACTUAL_PRODUCTION_IN,
            quantity: Math.abs(entry.productionQty),
            effectiveDate: entry.reportDate,
            sourceType: PRODUCTION_DAILY_REPORT_SOURCE,
            sourceId: entry.id,
            status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          },
        ]
      : [];

  const data = [...consumptionRows, ...productRows];
  if (data.length > 0) await tx.stockMovement.createMany({ data });
}

export async function removeProductionDailyReportMovements(tx: LedgerClient, entryId: string) {
  await tx.stockMovement.deleteMany({ where: productionDailyReportMovementWhere(entryId) });
}

export async function cancelDailyReportActualMovementsForPlans(
  tx: LedgerClient,
  productionPlanIds: string[],
) {
  const uniquePlanIds = [...new Set(productionPlanIds)].filter(Boolean);
  if (uniquePlanIds.length === 0) return;

  const reports = await tx.dailyReport.findMany({
    where: { productionPlanId: { in: uniquePlanIds }, status: "confirmed" },
    select: { id: true },
  });
  if (reports.length === 0) return;

  await tx.stockMovement.updateMany({
    where: {
      sourceType: "daily_report",
      status: INVENTORY_LEDGER_STATUS.CONFIRMED,
      OR: reports.flatMap((report) => [
        { sourceId: report.id },
        { sourceId: { startsWith: `${report.id}:` } },
      ]),
    },
    data: { status: INVENTORY_LEDGER_STATUS.CANCELLED },
  });
}

function productionDailyReportMovementWhere(entryId: string): Prisma.StockMovementWhereInput {
  return {
    sourceType: PRODUCTION_DAILY_REPORT_SOURCE,
    OR: [{ sourceId: entryId }, { sourceId: { startsWith: `${entryId}:` } }],
  };
}

function productionPlanMovementWhere(productionPlanId: string, status?: string): Prisma.StockMovementWhereInput {
  return {
    sourceType: "production_plan",
    ...(status ? { status } : {}),
    OR: [{ sourceId: productionPlanId }, { sourceId: { startsWith: `${productionPlanId}:` } }],
  };
}

function dailyReportMovementWhere(dailyReportId: string): Prisma.StockMovementWhereInput {
  return {
    sourceType: "daily_report",
    OR: [{ sourceId: dailyReportId }, { sourceId: { startsWith: `${dailyReportId}:` } }],
  };
}

function sourceIdForRepeatedMovement(
  baseSourceId: string,
  rowCount: number,
  itemType: string,
  itemId: string,
  index: number,
) {
  if (rowCount <= 1) return baseSourceId;
  return `${baseSourceId}:${itemType}:${itemId}:${index}`;
}
