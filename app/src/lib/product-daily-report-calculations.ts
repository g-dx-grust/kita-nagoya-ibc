import { diffMinutes } from "./time";

export type ProductDailyReportWarning =
  | "invalid_time_range"
  | "non_positive_worker_count"
  | "non_positive_production_qty"
  | "missing_capacity_g"
  | "missing_unit_price"
  | "missing_material_unit_cost"
  | "missing_package_cost";

// 1製造で使用した原料1種類分。複数原料は配列で渡す。
export type ProductDailyReportMaterialInput = {
  usedKg: number;
  unitCostPerKg: number;
};

export type ProductDailyReportCalculationInput = {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workerCount: number;
  productionQty: number;
  // 複数原料(2種類以上)対応。未指定なら下の単一フィールドから1要素を合成する(後方互換)。
  materials?: ProductDailyReportMaterialInput[];
  materialUsedKg?: number;
  materialUnitCostPerKg?: number | null;
  capacityG: number | null | undefined;
  packageCostPerUnit: number | null | undefined;
  unitPrice: number | null | undefined;
  laborHourlyRate: number | null | undefined;
};

export type ProductDailyReportCalculationResult = {
  operatingMinutes: number;
  totalOperatingMinutes: number;
  perHourQty: number;
  perUnitTimeMinutes: number;
  laborFeePerUnit: number;
  bagWeightG: number;
  lossRate: number;
  totalMaterialKg: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  sales: number;
  profitRate: number;
  warnings: ProductDailyReportWarning[];
};

export type ProductDailyReportSummaryRow = {
  productKey: string;
  productName: string;
  manufacturingCount: number;
  totalProductionQty: number;
  totalMaterialUsedKg: number;
  totalSales: number;
  averageProfitRate: number;
  averageLossRate: number;
};

export type ProductDailyReportSummaryInput = {
  productId?: string | null;
  productName: string;
  productionQty: number;
  materialUsedKg: number;
  sales: number;
  profitRate: number;
  lossRate: number;
};

export const DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE = 1200;

export function computeProductDailyReportMetrics(
  input: ProductDailyReportCalculationInput,
): ProductDailyReportCalculationResult {
  const warnings: ProductDailyReportWarning[] = [];
  const timeDiff = safeDiffMinutes(input.startTime, input.endTime);
  const operatingMinutes =
    timeDiff > 0 ? Math.max(0, timeDiff - Math.max(0, input.breakMinutes)) : 0;
  if (timeDiff <= 0 || operatingMinutes <= 0) warnings.push("invalid_time_range");
  if (input.workerCount <= 0) warnings.push("non_positive_worker_count");
  if (input.productionQty <= 0) warnings.push("non_positive_production_qty");

  const capacityG = input.capacityG ?? 0;
  const packageCostPerUnit = input.packageCostPerUnit ?? 0;
  const unitPrice = input.unitPrice ?? 0;
  const laborHourlyRate = input.laborHourlyRate ?? DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE;

  // 複数原料を正規化する。materials 未指定時は単一フィールドから1要素を合成(後方互換)。
  const materials = (
    input.materials ?? [
      { usedKg: input.materialUsedKg ?? 0, unitCostPerKg: input.materialUnitCostPerKg ?? 0 },
    ]
  ).map((m) => ({ usedKg: Math.max(0, safeNumber(m.usedKg)), unitCostPerKg: safeNumber(m.unitCostPerKg) }));
  const totalMaterialKg = sum(materials.map((m) => m.usedKg));
  const materialCost = materials.reduce((acc, m) => acc + m.usedKg * m.unitCostPerKg, 0);
  // 原料単価未設定の判定: 使用量>0の原料のみ対象。使用原料が皆無なら未設定扱い。
  const usedMaterials = materials.filter((m) => m.usedKg > 0);
  const missingMaterialPrice =
    usedMaterials.length === 0 ? true : usedMaterials.some((m) => m.unitCostPerKg <= 0);

  if (capacityG <= 0) warnings.push("missing_capacity_g");
  if (unitPrice <= 0) warnings.push("missing_unit_price");
  if (missingMaterialPrice) warnings.push("missing_material_unit_cost");
  if (packageCostPerUnit <= 0) warnings.push("missing_package_cost");

  const totalOperatingMinutes = operatingMinutes * Math.max(0, input.workerCount);
  const totalOperatingHours = totalOperatingMinutes / 60;
  const perHourQty =
    input.productionQty > 0 && totalOperatingHours > 0 ? input.productionQty / totalOperatingHours : 0;
  const perUnitTimeMinutes = perHourQty > 0 ? 60 / perHourQty : 0;

  // TODO: Excel Z列相当の 1100/1200 区分条件は未確定。現時点は手間賃マスタの hourlyRate を使う。
  const laborFeePerUnit = perHourQty > 0 ? laborHourlyRate / perHourQty : 0;
  const bagWeightG =
    input.productionQty > 0 ? (totalMaterialKg * 1000) / input.productionQty : 0;
  const lossRate = capacityG > 0 ? bagWeightG / capacityG - 1 : 0;
  const packageCost = Math.max(0, input.productionQty) * packageCostPerUnit;
  const totalCost = materialCost + packageCost;
  const sales = Math.max(0, input.productionQty) * unitPrice;
  const profitRate = sales > 0 ? (sales - totalCost) / sales : 0;

  return {
    operatingMinutes: round2(operatingMinutes),
    totalOperatingMinutes: round2(totalOperatingMinutes),
    perHourQty: round4(perHourQty),
    perUnitTimeMinutes: round4(perUnitTimeMinutes),
    laborFeePerUnit: round4(laborFeePerUnit),
    bagWeightG: round4(bagWeightG),
    lossRate: round4(lossRate),
    totalMaterialKg: round4(totalMaterialKg),
    materialCost: round2(materialCost),
    packageCost: round2(packageCost),
    totalCost: round2(totalCost),
    sales: round2(sales),
    profitRate: round4(profitRate),
    warnings: uniqueWarnings(warnings),
  };
}

export function aggregateProductDailyReports(
  entries: ProductDailyReportSummaryInput[],
): ProductDailyReportSummaryRow[] {
  const groups = new Map<string, ProductDailyReportSummaryInput[]>();
  for (const entry of entries) {
    const key = entry.productId || entry.productName;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return Array.from(groups, ([productKey, rows]) => {
    const first = rows[0];
    return {
      productKey,
      productName: first.productName,
      manufacturingCount: rows.length,
      totalProductionQty: round2(sum(rows.map((r) => r.productionQty))),
      totalMaterialUsedKg: round4(sum(rows.map((r) => r.materialUsedKg))),
      totalSales: round2(sum(rows.map((r) => safeNumber(r.sales)))),
      averageProfitRate: round4(average(rows.map((r) => r.profitRate))),
      averageLossRate: round4(average(rows.map((r) => r.lossRate))),
    };
  }).sort((a, b) => a.productName.localeCompare(b.productName, "ja"));
}

export function summarizeProductDailyReportTotals(
  summaries: ProductDailyReportSummaryRow[],
): ProductDailyReportSummaryRow {
  const manufacturingCount = sum(summaries.map((s) => s.manufacturingCount));
  return {
    productKey: "__total__",
    productName: "合計",
    manufacturingCount,
    totalProductionQty: round2(sum(summaries.map((s) => s.totalProductionQty))),
    totalMaterialUsedKg: round4(sum(summaries.map((s) => s.totalMaterialUsedKg))),
    totalSales: round2(sum(summaries.map((s) => s.totalSales))),
    averageProfitRate: weightedAverage(
      summaries.map((s) => ({ value: s.averageProfitRate, weight: s.manufacturingCount })),
    ),
    averageLossRate: weightedAverage(
      summaries.map((s) => ({ value: s.averageLossRate, weight: s.manufacturingCount })),
    ),
  };
}

function safeDiffMinutes(startTime: string, endTime: string) {
  try {
    return diffMinutes(startTime, endTime);
  } catch {
    return 0;
  }
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
  const totalWeight = sum(values.map((v) => v.weight));
  if (totalWeight <= 0) return 0;
  return round4(values.reduce((acc, v) => acc + safeNumber(v.value) * safeNumber(v.weight), 0) / totalWeight);
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function uniqueWarnings(warnings: ProductDailyReportWarning[]) {
  return Array.from(new Set(warnings));
}

function round2(n: number) {
  return Math.round(safeNumber(n) * 100) / 100;
}

function round4(n: number) {
  return Math.round(safeNumber(n) * 10000) / 10000;
}
