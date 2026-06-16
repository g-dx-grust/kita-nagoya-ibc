export type ProductDailyReportDashboardEntry = {
  id: string;
  reportDate: Date | string;
  productId?: string | null;
  productCode?: string | null;
  productName: string;
  productionQty: number;
  materialUsedKg: number;
  operatingMinutes: number;
  totalOperatingMinutes: number;
  perHourQty: number;
  perUnitTimeMinutes: number;
  laborFeePerUnit: number;
  lossRate: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  sales: number;
  profitRate: number;
  inventoryReflected: boolean;
  productMatchStatus?: string | null;
  calculationWarnings?: string[];
  capacityGSnapshot?: number | null;
  unitPriceSnapshot?: number | null;
  note?: string | null;
};

export type ProductDailyReportDashboardThresholds = {
  lowProfitRate: number;
  highLossRate: number;
};

export type ProductDailyReportDashboardTotals = {
  entryCount: number;
  productCount: number;
  productionQty: number;
  materialUsedKg: number;
  operatingMinutes: number;
  totalOperatingMinutes: number;
  workerHours: number;
  sales: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  estimatedLaborCost: number;
  grossProfit: number;
  profitRate: number;
  averageLossRate: number;
  averagePerHourQty: number;
  averagePerUnitTimeMinutes: number;
  inventoryReflectedCount: number;
  historyOnlyCount: number;
  alertRowCount: number;
  alertIssueCount: number;
  unmatchedProductCount: number;
};

export type ProductDailyReportDashboardComparison = {
  entryCountDelta: number;
  productionQtyDeltaRate: number | null;
  salesDeltaRate: number | null;
  profitRateDelta: number;
};

export type ProductDailyReportProductDashboardRow = {
  productKey: string;
  productName: string;
  productCode: string | null;
  entryCount: number;
  productionQty: number;
  materialUsedKg: number;
  sales: number;
  totalCost: number;
  estimatedLaborCost: number;
  grossProfit: number;
  profitRate: number;
  averageLossRate: number;
  averagePerHourQty: number;
  productionShare: number;
  salesShare: number;
  alertRowCount: number;
};

export type ProductDailyReportDailyDashboardRow = {
  date: string;
  entryCount: number;
  productionQty: number;
  materialUsedKg: number;
  sales: number;
  totalCost: number;
  estimatedLaborCost: number;
  grossProfit: number;
  profitRate: number;
  averageLossRate: number;
  averagePerHourQty: number;
  alertRowCount: number;
};

export type ProductDailyReportDashboardAlertRow = {
  id: string;
  date: string;
  productName: string;
  productCode: string | null;
  reasonLabels: string[];
  productionQty: number;
  perHourQty: number;
  lossRate: number;
  profitRate: number;
  sales: number;
  inventoryReflected: boolean;
};

export type ProductDailyReportDashboard = {
  totals: ProductDailyReportDashboardTotals;
  previousTotals: ProductDailyReportDashboardTotals;
  comparison: ProductDailyReportDashboardComparison;
  productRows: ProductDailyReportProductDashboardRow[];
  dailyRows: ProductDailyReportDailyDashboardRow[];
  alertRows: ProductDailyReportDashboardAlertRow[];
};

export const DEFAULT_DAILY_REPORT_DASHBOARD_THRESHOLDS: ProductDailyReportDashboardThresholds = {
  lowProfitRate: 0.15,
  highLossRate: 0.08,
};

const WARNING_LABELS: Record<string, string> = {
  invalid_time_range: "時間確認",
  non_positive_worker_count: "作業人数確認",
  non_positive_production_qty: "生産数確認",
  missing_capacity_g: "入り数未設定",
  missing_unit_price: "売値未設定",
  missing_material_unit_cost: "原料単価未設定",
  missing_package_cost: "資材単価未設定",
};

type NormalizedEntry = ProductDailyReportDashboardEntry & {
  dateKey: string;
  productKey: string;
  workerHours: number;
  estimatedLaborCost: number;
};

export function buildProductDailyReportDashboard(
  entries: ProductDailyReportDashboardEntry[],
  previousEntries: ProductDailyReportDashboardEntry[] = [],
  thresholds: ProductDailyReportDashboardThresholds = DEFAULT_DAILY_REPORT_DASHBOARD_THRESHOLDS,
): ProductDailyReportDashboard {
  const rows = entries.map(normalizeEntry);
  const previousRows = previousEntries.map(normalizeEntry);
  const alertRows = buildAlertRows(rows, thresholds);
  const alertIdSet = new Set(alertRows.map((row) => row.id));
  const totals = {
    ...summarizeRows(rows),
    alertRowCount: alertRows.length,
    alertIssueCount: sum(alertRows.map((row) => row.reasonLabels.length)),
    unmatchedProductCount: rows.filter((row) => row.productMatchStatus === "unmatched").length,
  };
  const previousTotals = {
    ...summarizeRows(previousRows),
    alertRowCount: 0,
    alertIssueCount: 0,
    unmatchedProductCount: previousRows.filter((row) => row.productMatchStatus === "unmatched").length,
  };

  return {
    totals,
    previousTotals,
    comparison: {
      entryCountDelta: totals.entryCount - previousTotals.entryCount,
      productionQtyDeltaRate: percentDelta(totals.productionQty, previousTotals.productionQty),
      salesDeltaRate: percentDelta(totals.sales, previousTotals.sales),
      profitRateDelta: round4(totals.profitRate - previousTotals.profitRate),
    },
    productRows: buildProductRows(rows, totals, alertIdSet),
    dailyRows: buildDailyRows(rows, alertIdSet),
    alertRows,
  };
}

function normalizeEntry(entry: ProductDailyReportDashboardEntry): NormalizedEntry {
  const productionQty = safeNumber(entry.productionQty);
  const totalOperatingMinutes = safeNumber(entry.totalOperatingMinutes);
  return {
    ...entry,
    productCode: entry.productCode ?? null,
    calculationWarnings: entry.calculationWarnings ?? [],
    capacityGSnapshot: entry.capacityGSnapshot ?? null,
    unitPriceSnapshot: entry.unitPriceSnapshot ?? null,
    productionQty,
    materialUsedKg: safeNumber(entry.materialUsedKg),
    operatingMinutes: safeNumber(entry.operatingMinutes),
    totalOperatingMinutes,
    perHourQty: safeNumber(entry.perHourQty),
    perUnitTimeMinutes: safeNumber(entry.perUnitTimeMinutes),
    laborFeePerUnit: safeNumber(entry.laborFeePerUnit),
    lossRate: safeNumber(entry.lossRate),
    materialCost: safeNumber(entry.materialCost),
    packageCost: safeNumber(entry.packageCost),
    totalCost: safeNumber(entry.totalCost),
    sales: safeNumber(entry.sales),
    profitRate: safeNumber(entry.profitRate),
    dateKey: toDateKey(entry.reportDate),
    productKey: entry.productId || entry.productName,
    workerHours: totalOperatingMinutes / 60,
    estimatedLaborCost: safeNumber(entry.laborFeePerUnit) * productionQty,
  };
}

function summarizeRows(rows: NormalizedEntry[]): Omit<
  ProductDailyReportDashboardTotals,
  "alertRowCount" | "alertIssueCount" | "unmatchedProductCount"
> {
  const productKeys = new Set(rows.map((row) => row.productKey));
  const productionQty = sum(rows.map((row) => row.productionQty));
  const materialUsedKg = sum(rows.map((row) => row.materialUsedKg));
  const operatingMinutes = sum(rows.map((row) => row.operatingMinutes));
  const totalOperatingMinutes = sum(rows.map((row) => row.totalOperatingMinutes));
  const workerHours = totalOperatingMinutes / 60;
  const sales = sum(rows.map((row) => row.sales));
  const materialCost = sum(rows.map((row) => row.materialCost));
  const packageCost = sum(rows.map((row) => row.packageCost));
  const totalCost = sum(rows.map((row) => row.totalCost));
  const estimatedLaborCost = sum(rows.map((row) => row.estimatedLaborCost));
  const grossProfit = sales - totalCost;
  const averagePerHourQty = workerHours > 0 ? productionQty / workerHours : average(rows.map((row) => row.perHourQty));

  return {
    entryCount: rows.length,
    productCount: productKeys.size,
    productionQty: round2(productionQty),
    materialUsedKg: round4(materialUsedKg),
    operatingMinutes: round2(operatingMinutes),
    totalOperatingMinutes: round2(totalOperatingMinutes),
    workerHours: round2(workerHours),
    sales: round2(sales),
    materialCost: round2(materialCost),
    packageCost: round2(packageCost),
    totalCost: round2(totalCost),
    estimatedLaborCost: round2(estimatedLaborCost),
    grossProfit: round2(grossProfit),
    profitRate: sales > 0 ? round4(grossProfit / sales) : 0,
    averageLossRate: weightedAverage(rows.map((row) => ({ value: row.lossRate, weight: row.productionQty }))),
    averagePerHourQty: round4(averagePerHourQty),
    averagePerUnitTimeMinutes: averagePerHourQty > 0 ? round4(60 / averagePerHourQty) : 0,
    inventoryReflectedCount: rows.filter((row) => row.inventoryReflected).length,
    historyOnlyCount: rows.filter((row) => !row.inventoryReflected).length,
  };
}

function buildProductRows(
  rows: NormalizedEntry[],
  totals: ProductDailyReportDashboardTotals,
  alertIdSet: Set<string>,
): ProductDailyReportProductDashboardRow[] {
  const groups = groupBy(rows, (row) => row.productKey);
  return Array.from(groups, ([productKey, groupRows]) => {
    const summary = summarizeRows(groupRows);
    const first = groupRows[0];
    return {
      productKey,
      productName: first.productName,
      productCode: first.productCode ?? null,
      entryCount: summary.entryCount,
      productionQty: summary.productionQty,
      materialUsedKg: summary.materialUsedKg,
      sales: summary.sales,
      totalCost: summary.totalCost,
      estimatedLaborCost: summary.estimatedLaborCost,
      grossProfit: summary.grossProfit,
      profitRate: summary.profitRate,
      averageLossRate: summary.averageLossRate,
      averagePerHourQty: summary.averagePerHourQty,
      productionShare: totals.productionQty > 0 ? round4(summary.productionQty / totals.productionQty) : 0,
      salesShare: totals.sales > 0 ? round4(summary.sales / totals.sales) : 0,
      alertRowCount: groupRows.filter((row) => alertIdSet.has(row.id)).length,
    };
  }).sort((a, b) => b.productionQty - a.productionQty || a.productName.localeCompare(b.productName, "ja"));
}

function buildDailyRows(
  rows: NormalizedEntry[],
  alertIdSet: Set<string>,
): ProductDailyReportDailyDashboardRow[] {
  const groups = groupBy(rows, (row) => row.dateKey);
  return Array.from(groups, ([date, groupRows]) => {
    const summary = summarizeRows(groupRows);
    return {
      date,
      entryCount: summary.entryCount,
      productionQty: summary.productionQty,
      materialUsedKg: summary.materialUsedKg,
      sales: summary.sales,
      totalCost: summary.totalCost,
      estimatedLaborCost: summary.estimatedLaborCost,
      grossProfit: summary.grossProfit,
      profitRate: summary.profitRate,
      averageLossRate: summary.averageLossRate,
      averagePerHourQty: summary.averagePerHourQty,
      alertRowCount: groupRows.filter((row) => alertIdSet.has(row.id)).length,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function buildAlertRows(
  rows: NormalizedEntry[],
  thresholds: ProductDailyReportDashboardThresholds,
): ProductDailyReportDashboardAlertRow[] {
  return rows
    .map((row) => {
      const reasonLabels = alertReasons(row, thresholds);
      return {
        id: row.id,
        date: row.dateKey,
        productName: row.productName,
        productCode: row.productCode ?? null,
        reasonLabels,
        productionQty: row.productionQty,
        perHourQty: row.perHourQty,
        lossRate: row.lossRate,
        profitRate: row.profitRate,
        sales: row.sales,
        inventoryReflected: row.inventoryReflected,
      };
    })
    .filter((row) => row.reasonLabels.length > 0)
    .sort(
      (a, b) =>
        alertPriority(b.reasonLabels) - alertPriority(a.reasonLabels) ||
        b.lossRate - a.lossRate ||
        a.date.localeCompare(b.date),
    );
}

function alertReasons(row: NormalizedEntry, thresholds: ProductDailyReportDashboardThresholds) {
  const labels: string[] = [];
  if (row.productMatchStatus === "unmatched") labels.push("商品未照合");
  if (row.productMatchStatus === "fuzzy") labels.push("商品候補確認");
  if ((row.unitPriceSnapshot ?? 0) <= 0) labels.push("売値未設定");
  if ((row.capacityGSnapshot ?? 0) <= 0) labels.push("入り数未設定");
  for (const warning of row.calculationWarnings ?? []) {
    labels.push(WARNING_LABELS[warning] ?? warning);
  }
  if (row.lossRate >= thresholds.highLossRate) labels.push("ロス率高め");
  if (row.sales > 0 && row.profitRate <= thresholds.lowProfitRate) labels.push("利率低め");
  return Array.from(new Set(labels));
}

function alertPriority(labels: string[]) {
  if (labels.some((label) => label.includes("未設定") || label.includes("未照合"))) return 3;
  if (labels.some((label) => label.includes("確認"))) return 2;
  return 1;
}

function percentDelta(current: number, previous: number) {
  if (previous <= 0) return null;
  return round4((current - previous) / previous);
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const list = groups.get(key);
    if (list) {
      list.push(value);
    } else {
      groups.set(key, [value]);
    }
  }
  return groups;
}

function toDateKey(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + safeNumber(value), 0);
}

function average(values: number[]) {
  const usable = values.map(safeNumber);
  if (usable.length === 0) return 0;
  return sum(usable) / usable.length;
}

function weightedAverage(values: { value: number; weight: number }[]) {
  const totalWeight = sum(values.map((value) => value.weight));
  if (totalWeight <= 0) return round4(average(values.map((value) => value.value)));
  return round4(values.reduce((acc, value) => acc + safeNumber(value.value) * safeNumber(value.weight), 0) / totalWeight);
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round2(value: number) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function round4(value: number) {
  return Math.round(safeNumber(value) * 10000) / 10000;
}
