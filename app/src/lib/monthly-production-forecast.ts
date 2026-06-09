export type ProductForecastMethod = "MANUAL" | "YEAR_RATIO" | "SALES_INPUT" | "NONE";

export type MonthlyProductionForecastProduct = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order" | "both";
  unit: string;
  standardProductionLotSize: number;
  /**
   * 商品マスタの予測方式。NONE は自動予測対象外。
   * MANUAL / YEAR_RATIO / SALES_INPUT は当面いずれも前年比(YoY)予測で扱う。
   * 省略時は YEAR_RATIO 相当の従来挙動。
   */
  forecastMethod?: ProductForecastMethod | null;
};

export type MonthlyProductionActualQuantity = {
  productId: string;
  yearMonth: string;
  actualQuantity: number;
};

export type HistoricalForecastReferenceMonths = {
  targetMonth: string;
  previousYearTargetMonth: string;
  currentPreviousMonth: string;
  previousYearPreviousMonth: string;
  currentTwoMonthsAgo: string;
  previousYearTwoMonthsAgo: string;
};

export type MonthlyProductionForecastRow = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: MonthlyProductionForecastProduct["productionType"];
  unit: string;
  targetMonth: string;
  status: "forecasted" | "insufficient_data";
  previousYearTargetQuantity: number | null;
  currentPreviousMonthQuantity: number | null;
  previousYearPreviousMonthQuantity: number | null;
  currentTwoMonthsAgoQuantity: number | null;
  previousYearTwoMonthsAgoQuantity: number | null;
  twoMonthsAgoYoYRate: number | null;
  previousMonthYoYRate: number | null;
  /**
   * 予測に採用した根拠(優先度順のフォールバック):
   * two_months_ago_yoy(標準) > previous_month_yoy > previous_year_same_month(季節) > trailing_average(直近) > none
   */
  forecastBasis:
    | "previous_month_yoy"
    | "two_months_ago_yoy"
    | "previous_year_same_month"
    | "trailing_average"
    | "none";
  /** trailing_average のとき平均に使った月 */
  trailingMonthsUsed?: string[];
  rawForecastQuantity: number;
  forecastQuantity: number;
  missingRequiredMonths: string[];
  reason: string;
};

export function computeHistoricalMonthlyProductionForecasts(input: {
  targetMonth: string;
  products: MonthlyProductionForecastProduct[];
  actuals: MonthlyProductionActualQuantity[];
}): {
  referenceMonths: HistoricalForecastReferenceMonths;
  forecasts: MonthlyProductionForecastRow[];
} {
  const referenceMonths = getHistoricalForecastReferenceMonths(input.targetMonth);
  const actualMap = new Map<string, number>();
  for (const actual of input.actuals) {
    if (actual.actualQuantity < 0) continue;
    actualMap.set(actualKey(actual.productId, actual.yearMonth), actual.actualQuantity);
  }

  const forecasts = [...input.products]
    .sort((a, b) => a.productCode.localeCompare(b.productCode, "ja"))
    .map((product) => buildProductForecast(product, referenceMonths, actualMap));

  return { referenceMonths, forecasts };
}

export function getHistoricalForecastReferenceMonths(targetMonth: string): HistoricalForecastReferenceMonths {
  assertYearMonth(targetMonth);
  return {
    targetMonth,
    previousYearTargetMonth: addMonths(targetMonth, -12),
    currentPreviousMonth: addMonths(targetMonth, -1),
    previousYearPreviousMonth: addMonths(targetMonth, -13),
    currentTwoMonthsAgo: addMonths(targetMonth, -2),
    previousYearTwoMonthsAgo: addMonths(targetMonth, -14),
  };
}

export function yearMonthFromDateInput(date: string) {
  return date.slice(0, 7);
}

function buildProductForecast(
  product: MonthlyProductionForecastProduct,
  referenceMonths: HistoricalForecastReferenceMonths,
  actualMap: Map<string, number>,
): MonthlyProductionForecastRow {
  // forecastMethod=NONE は自動予測対象外。実績は参考表示のみとし、予測数量は0にする。
  if (product.forecastMethod === "NONE") {
    return {
      productId: product.productId,
      productCode: product.productCode,
      productName: product.productName,
      productionType: product.productionType,
      unit: product.unit,
      targetMonth: referenceMonths.targetMonth,
      status: "insufficient_data",
      previousYearTargetQuantity: getActual(actualMap, product.productId, referenceMonths.previousYearTargetMonth),
      currentPreviousMonthQuantity: getActual(actualMap, product.productId, referenceMonths.currentPreviousMonth),
      previousYearPreviousMonthQuantity: getActual(
        actualMap,
        product.productId,
        referenceMonths.previousYearPreviousMonth,
      ),
      currentTwoMonthsAgoQuantity: getActual(actualMap, product.productId, referenceMonths.currentTwoMonthsAgo),
      previousYearTwoMonthsAgoQuantity: getActual(
        actualMap,
        product.productId,
        referenceMonths.previousYearTwoMonthsAgo,
      ),
      twoMonthsAgoYoYRate: null,
      previousMonthYoYRate: null,
      forecastBasis: "none",
      rawForecastQuantity: 0,
      forecastQuantity: 0,
      missingRequiredMonths: [],
      reason: "自動予測対象外(forecastMethod=NONE)。営業入力/手動登録の数量で計画してください。",
    };
  }

  const previousYearTargetQuantity = getActual(actualMap, product.productId, referenceMonths.previousYearTargetMonth);
  const currentPreviousMonthQuantity = getActual(actualMap, product.productId, referenceMonths.currentPreviousMonth);
  const previousYearPreviousMonthQuantity = getActual(
    actualMap,
    product.productId,
    referenceMonths.previousYearPreviousMonth,
  );
  const currentTwoMonthsAgoQuantity = getActual(actualMap, product.productId, referenceMonths.currentTwoMonthsAgo);
  const previousYearTwoMonthsAgoQuantity = getActual(
    actualMap,
    product.productId,
    referenceMonths.previousYearTwoMonthsAgo,
  );

  // 主要(前々月前年比)予測に必要な月のうち欠けているものを表示用に残す。
  const missingRequiredMonths = [
    previousYearTargetQuantity == null ? referenceMonths.previousYearTargetMonth : null,
    currentTwoMonthsAgoQuantity == null ? referenceMonths.currentTwoMonthsAgo : null,
    previousYearTwoMonthsAgoQuantity == null ? referenceMonths.previousYearTwoMonthsAgo : null,
  ].filter((month): month is string => month != null);

  const previousMonthYoYRate =
    currentPreviousMonthQuantity != null &&
    previousYearPreviousMonthQuantity != null &&
    previousYearPreviousMonthQuantity > 0
      ? round4(currentPreviousMonthQuantity / previousYearPreviousMonthQuantity)
      : null;
  const twoMonthsAgoYoYRate =
    currentTwoMonthsAgoQuantity != null &&
    previousYearTwoMonthsAgoQuantity != null &&
    previousYearTwoMonthsAgoQuantity > 0
      ? round4(currentTwoMonthsAgoQuantity / previousYearTwoMonthsAgoQuantity)
      : null;

  // 予測根拠を優先度順に選ぶ(段階的フォールバック)。
  // 1) 前々月前年比(原料リードタイム対応の標準) 2) 前月前年比
  // 3) 前年同月(季節ベース, 比率1.0) 4) 直近平均(新商品/不定期。日報蓄積でいずれ1)へ昇格)
  let forecastBasis: MonthlyProductionForecastRow["forecastBasis"] = "none";
  let rawForecastQuantity = 0;
  let appliedRate: number | null = null;
  let trailingMonthsUsed: string[] = [];

  if (previousYearTargetQuantity != null && twoMonthsAgoYoYRate != null) {
    forecastBasis = "two_months_ago_yoy";
    appliedRate = twoMonthsAgoYoYRate;
    rawForecastQuantity = round4(previousYearTargetQuantity * twoMonthsAgoYoYRate);
  } else if (previousYearTargetQuantity != null && previousMonthYoYRate != null) {
    forecastBasis = "previous_month_yoy";
    appliedRate = previousMonthYoYRate;
    rawForecastQuantity = round4(previousYearTargetQuantity * previousMonthYoYRate);
  } else if (previousYearTargetQuantity != null && previousYearTargetQuantity > 0) {
    // 前年比を出せる直近実績が無い。前年同月をそのまま季節ベースラインに採用。
    forecastBasis = "previous_year_same_month";
    appliedRate = 1;
    rawForecastQuantity = round4(previousYearTargetQuantity);
  } else {
    // 前年実績が無い(新商品/開始1年未満など)。在庫窓内の直近実績(前月・前々月)の平均で立てる。
    const recent: { month: string; qty: number }[] = [];
    if (currentPreviousMonthQuantity != null && currentPreviousMonthQuantity > 0)
      recent.push({ month: referenceMonths.currentPreviousMonth, qty: currentPreviousMonthQuantity });
    if (currentTwoMonthsAgoQuantity != null && currentTwoMonthsAgoQuantity > 0)
      recent.push({ month: referenceMonths.currentTwoMonthsAgo, qty: currentTwoMonthsAgoQuantity });
    if (recent.length > 0) {
      forecastBasis = "trailing_average";
      trailingMonthsUsed = recent.map((r) => r.month);
      rawForecastQuantity = round4(recent.reduce((sum, r) => sum + r.qty, 0) / recent.length);
    }
  }

  const baseRow = {
    productId: product.productId,
    productCode: product.productCode,
    productName: product.productName,
    productionType: product.productionType,
    unit: product.unit,
    targetMonth: referenceMonths.targetMonth,
    previousYearTargetQuantity,
    currentPreviousMonthQuantity,
    previousYearPreviousMonthQuantity,
    currentTwoMonthsAgoQuantity,
    previousYearTwoMonthsAgoQuantity,
    twoMonthsAgoYoYRate,
    previousMonthYoYRate,
  };

  if (forecastBasis === "none") {
    const noHistory =
      previousYearTargetQuantity == null &&
      currentPreviousMonthQuantity == null &&
      currentTwoMonthsAgoQuantity == null;
    return {
      ...baseRow,
      status: "insufficient_data",
      forecastBasis: "none",
      trailingMonthsUsed: [],
      rawForecastQuantity: 0,
      forecastQuantity: 0,
      missingRequiredMonths,
      reason: noHistory
        ? "予測に使える月次実績がありません(前年同月・直近実績ともに無し)。手動登録で計画してください。"
        : `予測に使える実績が不足しています(前年同月実績および直近実績が0/欠落)。`,
    };
  }

  const forecastQuantity = roundForecastQuantity(product, rawForecastQuantity);
  return {
    ...baseRow,
    status: "forecasted",
    forecastBasis,
    trailingMonthsUsed,
    rawForecastQuantity,
    forecastQuantity,
    missingRequiredMonths: forecastBasis === "two_months_ago_yoy" ? [] : missingRequiredMonths,
    reason: buildForecastReason({
      product,
      referenceMonths,
      forecastBasis,
      appliedRate,
      trailingMonthsUsed,
      previousYearTargetQuantity,
      currentPreviousMonthQuantity,
      previousYearPreviousMonthQuantity,
      currentTwoMonthsAgoQuantity,
      previousYearTwoMonthsAgoQuantity,
      forecastQuantity,
    }),
  };
}

function buildForecastReason(input: {
  product: MonthlyProductionForecastProduct;
  referenceMonths: HistoricalForecastReferenceMonths;
  forecastBasis: MonthlyProductionForecastRow["forecastBasis"];
  appliedRate: number | null;
  trailingMonthsUsed: string[];
  previousYearTargetQuantity: number | null;
  currentPreviousMonthQuantity: number | null;
  previousYearPreviousMonthQuantity: number | null;
  currentTwoMonthsAgoQuantity: number | null;
  previousYearTwoMonthsAgoQuantity: number | null;
  forecastQuantity: number;
}) {
  const { product, referenceMonths: m } = input;
  const u = product.unit;
  const q = (n: number | null) => round4(n ?? 0);
  switch (input.forecastBasis) {
    case "two_months_ago_yoy":
      return `${m.currentTwoMonthsAgo} 実績 ${q(input.currentTwoMonthsAgoQuantity)}${u} ÷ ${m.previousYearTwoMonthsAgo} 実績 ${q(
        input.previousYearTwoMonthsAgoQuantity,
      )}${u} = 前々月前年比 ${formatPercent(input.appliedRate ?? 0)}（原料リードタイムを見込み前々月を基準）。${m.previousYearTargetMonth} 実績 ${q(
        input.previousYearTargetQuantity,
      )}${u} に掛けて、${m.targetMonth} の予測生産数を ${q(input.forecastQuantity)}${u} とします。`;
    case "previous_month_yoy":
      return `${m.currentPreviousMonth} 実績 ${q(input.currentPreviousMonthQuantity)}${u} ÷ ${m.previousYearPreviousMonth} 実績 ${q(
        input.previousYearPreviousMonthQuantity,
      )}${u} = 前月前年比 ${formatPercent(input.appliedRate ?? 0)}（前々月前年比が使えないため前月で代替）。${m.previousYearTargetMonth} 実績 ${q(
        input.previousYearTargetQuantity,
      )}${u} に掛けて、${m.targetMonth} の予測生産数を ${q(input.forecastQuantity)}${u} とします。`;
    case "previous_year_same_month":
      return `前年比を計算できる直近実績が無いため、前年同月(${m.previousYearTargetMonth})実績 ${q(
        input.previousYearTargetQuantity,
      )}${u} を季節基準として ${m.targetMonth} の予測生産数を ${q(input.forecastQuantity)}${u} とします（前年同月ベース・要確認）。`;
    case "trailing_average":
      return `前年同月実績が無いため、直近実績(${input.trailingMonthsUsed.join(", ")})の平均から ${m.targetMonth} の予測生産数を ${q(
        input.forecastQuantity,
      )}${u} とします（直近平均ベース・データ蓄積で前年比へ移行）。`;
    default:
      return "";
  }
}

function roundForecastQuantity(product: MonthlyProductionForecastProduct, quantity: number) {
  if (product.productionType === "make_to_order") return round4(quantity);
  if (product.standardProductionLotSize <= 0) return round4(quantity);
  return round4(Math.ceil(quantity / product.standardProductionLotSize) * product.standardProductionLotSize);
}

function getActual(actualMap: Map<string, number>, productId: string, yearMonth: string) {
  return actualMap.get(actualKey(productId, yearMonth)) ?? null;
}

function actualKey(productId: string, yearMonth: string) {
  return `${productId}:${yearMonth}`;
}

function addMonths(yearMonth: string, offset: number) {
  const [year, month] = parseYearMonth(yearMonth);
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonth(yearMonth: string): [number, number] {
  assertYearMonth(yearMonth);
  return [Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7))];
}

function assertYearMonth(yearMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error(`invalid_year_month:${yearMonth}`);
  }
}

function formatPercent(rate: number) {
  return `${round2(rate * 100)}%`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
