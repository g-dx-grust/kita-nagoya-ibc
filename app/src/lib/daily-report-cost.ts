// Pure computation of a daily report's ACTUAL cost, recalculated at confirm time
// from実績数量 × 単価. This is strictly separate from the planned estimate stored
// on ProductionPlan.est* — never conflate planned vs actual.

import { computeCostEstimate } from "./calculations";

export type DailyReportActualConsumption = {
  itemType: string;
  actualQuantity: number;
  unitPriceSnapshot: number;
};

export type DailyReportActualCostInput = {
  /** 実績生産数量。手間賃の基数になる。null/未入力なら 0 として扱う。 */
  actualQuantity: number | null;
  /** 手間賃単価 (BillingPrice)。確定日の単価をスナップショットする。 */
  billingUnitPrice: number;
  consumptions: DailyReportActualConsumption[];
};

export type DailyReportActualCost = {
  actualLaborCost: number;
  actualMaterialCost: number;
  actualPackagingCost: number;
  actualTotalCost: number;
};

export function computeDailyReportActualCost(
  input: DailyReportActualCostInput,
): DailyReportActualCost {
  const quantity = input.actualQuantity ?? 0;

  const materialCost = sumConsumption(input.consumptions, "raw_material");
  const packagingCost = sumConsumption(input.consumptions, "packaging");

  // Reuse the planned estimator so rounding (round2) and labor = quantity *
  // unit price stay consistent with computeCostEstimate.
  const cost = computeCostEstimate({
    quantity,
    billingUnitPrice: input.billingUnitPrice ?? 0,
    materialCost,
    packagingCost,
  });

  return {
    actualLaborCost: cost.laborCost,
    actualMaterialCost: cost.materialCost,
    actualPackagingCost: cost.packagingCost,
    actualTotalCost: cost.totalCost,
  };
}

function sumConsumption(
  consumptions: DailyReportActualConsumption[],
  itemType: string,
): number {
  return consumptions
    .filter((c) => c.itemType === itemType)
    .reduce((acc, c) => acc + (c.actualQuantity ?? 0) * (c.unitPriceSnapshot ?? 0), 0);
}
