export type MonthlyPlanningProduct = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order" | "both";
  unit: string;
  safetyStockQuantity: number;
  standardProductionLotSize: number;
  /** 生産スケジュール並び順(小さいほど先)。null=従来順。 */
  schedulePriority?: number | null;
};

/** schedulePriority のソート用キー。null/未指定は最後尾。 */
export function schedulePriorityKey(priority: number | null | undefined): number {
  return priority == null ? Number.MAX_SAFE_INTEGER : priority;
}

export type MonthlyPlanningDemand = {
  productId: string;
  dueDate: string;
  quantity: number;
  demandType: "order" | "shipment" | "forecast";
};

export type MonthlyPlanningExistingProduction = {
  productId: string;
  date: string;
  quantity: number;
};

export type MonthlyProductionSuggestion = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: MonthlyPlanningProduct["productionType"];
  unit: string;
  dueDate: string;
  scheduleDate: string;
  demandQuantity: number;
  existingProductionQuantity: number;
  safetyStockQuantity: number;
  startingOnHandQuantity: number;
  projectedOnHandBeforeDemand: number;
  projectedOnHandBeforeSuggestion: number;
  projectedOnHandAfterSuggestion: number;
  shortageQuantity: number;
  suggestedQuantity: number;
  schedulePriority: number | null;
  reason: string;
};

export type MonthlyProductionHistoricalDailyActual = {
  productId: string;
  date: string;
  quantity: number;
};

export type MonthlyProductionProductSummary = {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  schedulePriority: number | null;
  startingOnHandQuantity: number;
  openDemandQuantity: number;
  existingProductionQuantity: number;
  suggestedQuantity: number;
  endingProjectedOnHandQuantity: number;
  minProjectedOnHandQuantity: number;
};

export type MonthlyProductionScheduleResult = {
  dateFrom: string;
  dateTo: string;
  productionLeadDays: number;
  suggestions: MonthlyProductionSuggestion[];
  productSummaries: MonthlyProductionProductSummary[];
};

export function computeMonthlyProductionSchedule(input: {
  products: MonthlyPlanningProduct[];
  dateFrom: string;
  dateTo: string;
  productionLeadDays?: number;
  onHandByProductId: Record<string, number>;
  demands: MonthlyPlanningDemand[];
  existingProductions: MonthlyPlanningExistingProduction[];
}): MonthlyProductionScheduleResult {
  const dateFrom = input.dateFrom;
  const dateTo = input.dateTo;
  const days = eachDay(dateFrom, dateTo);
  const productionLeadDays = Math.max(0, Math.floor(input.productionLeadDays ?? 1));
  const demandByProductDate = aggregateByProductDate(
    input.demands
      .filter((demand) => demand.quantity > 0 && compareDate(demand.dueDate, dateTo) <= 0)
      .map((demand) => ({
        productId: demand.productId,
        date: clampDate(demand.dueDate, dateFrom, dateTo),
        quantity: demand.quantity,
      })),
  );
  const existingByProductDate = aggregateByProductDate(
    input.existingProductions
      .filter(
        (production) =>
          production.quantity > 0 &&
          compareDate(production.date, dateFrom) >= 0 &&
          compareDate(production.date, dateTo) <= 0,
      )
      .map((production) => ({
        productId: production.productId,
        date: production.date,
        quantity: production.quantity,
      })),
  );

  const suggestions: MonthlyProductionSuggestion[] = [];
  const productSummaries: MonthlyProductionProductSummary[] = [];

  for (const product of [...input.products].sort((a, b) => a.productCode.localeCompare(b.productCode, "ja"))) {
    let projected = input.onHandByProductId[product.productId] ?? 0;
    const startingOnHand = projected;
    const generatedByDate = new Map<string, number>();
    let openDemandQuantity = 0;
    let existingProductionQuantity = 0;
    let suggestedQuantity = 0;
    let minProjected = projected;

    for (const date of days) {
      const existingToday = getNestedQuantity(existingByProductDate, product.productId, date);
      const generatedToday = generatedByDate.get(date) ?? 0;
      const demandToday = getNestedQuantity(demandByProductDate, product.productId, date);
      const targetStock = product.productionType === "make_to_order" ? 0 : product.safetyStockQuantity;

      existingProductionQuantity += existingToday;
      openDemandQuantity += demandToday;
      projected += existingToday + generatedToday;

      const beforeDemand = projected;
      projected -= demandToday;
      const beforeSuggestion = projected;
      minProjected = Math.min(minProjected, projected);

      if (projected < targetStock) {
        const shortage = targetStock - projected;
        const suggestion = roundSuggestedQuantity(product, shortage);
        const scheduleDate = clampDate(subDays(date, productionLeadDays), dateFrom, dateTo);
        generatedByDate.set(scheduleDate, (generatedByDate.get(scheduleDate) ?? 0) + suggestion);
        projected += suggestion;
        suggestedQuantity += suggestion;

        suggestions.push({
          productId: product.productId,
          productCode: product.productCode,
          productName: product.productName,
          productionType: product.productionType,
          unit: product.unit,
          dueDate: date,
          scheduleDate,
          demandQuantity: round4(demandToday),
          existingProductionQuantity: round4(existingToday),
          safetyStockQuantity: round4(targetStock),
          startingOnHandQuantity: round4(startingOnHand),
          projectedOnHandBeforeDemand: round4(beforeDemand),
          projectedOnHandBeforeSuggestion: round4(beforeSuggestion),
          projectedOnHandAfterSuggestion: round4(projected),
          shortageQuantity: round4(shortage),
          suggestedQuantity: round4(suggestion),
          schedulePriority: product.schedulePriority ?? null,
          reason: buildReason(product, {
            dueDate: date,
            demandQuantity: demandToday,
            targetStock,
            shortage,
            suggestion,
          }),
        });
      }

      minProjected = Math.min(minProjected, projected);
    }

    productSummaries.push({
      productId: product.productId,
      productCode: product.productCode,
      productName: product.productName,
      unit: product.unit,
      schedulePriority: product.schedulePriority ?? null,
      startingOnHandQuantity: round4(startingOnHand),
      openDemandQuantity: round4(openDemandQuantity),
      existingProductionQuantity: round4(existingProductionQuantity),
      suggestedQuantity: round4(suggestedQuantity),
      endingProjectedOnHandQuantity: round4(projected),
      minProjectedOnHandQuantity: round4(minProjected),
    });
  }

  return {
    dateFrom,
    dateTo,
    productionLeadDays,
    suggestions: suggestions.sort(
      (a, b) =>
        compareDate(a.scheduleDate, b.scheduleDate) ||
        schedulePriorityKey(a.schedulePriority) - schedulePriorityKey(b.schedulePriority) ||
        a.productCode.localeCompare(b.productCode, "ja") ||
        compareDate(a.dueDate, b.dueDate),
    ),
    productSummaries: productSummaries.sort(
      (a, b) =>
        schedulePriorityKey(a.schedulePriority) - schedulePriorityKey(b.schedulePriority) ||
        a.productCode.localeCompare(b.productCode, "ja"),
    ),
  };
}

export function aggregateMonthlySuggestions(suggestions: MonthlyProductionSuggestion[]) {
  const grouped = new Map<
    string,
    {
      productId: string;
      productCode: string;
      productName: string;
      productionType: MonthlyPlanningProduct["productionType"];
      unit: string;
      scheduleDate: string;
      suggestedQuantity: number;
      schedulePriority: number | null;
      dueDates: string[];
      reasons: string[];
    }
  >();

  for (const suggestion of suggestions) {
    const key = `${suggestion.scheduleDate}:${suggestion.productId}`;
    const row =
      grouped.get(key) ??
      {
        productId: suggestion.productId,
        productCode: suggestion.productCode,
        productName: suggestion.productName,
        productionType: suggestion.productionType,
        unit: suggestion.unit,
        scheduleDate: suggestion.scheduleDate,
        suggestedQuantity: 0,
        schedulePriority: suggestion.schedulePriority,
        dueDates: [],
        reasons: [],
      };
    row.suggestedQuantity = round4(row.suggestedQuantity + suggestion.suggestedQuantity);
    if (!row.dueDates.includes(suggestion.dueDate)) row.dueDates.push(suggestion.dueDate);
    row.reasons.push(suggestion.reason);
    grouped.set(key, row);
  }

  return [...grouped.values()].sort(
    (a, b) =>
      compareDate(a.scheduleDate, b.scheduleDate) ||
      schedulePriorityKey(a.schedulePriority) - schedulePriorityKey(b.schedulePriority) ||
      a.productCode.localeCompare(b.productCode, "ja"),
  );
}

export function spreadMonthlyStockSuggestions(
  suggestions: MonthlyProductionSuggestion[],
  input: {
    dateFrom: string;
    dateTo: string;
    chunkQuantityByProductId?: Record<string, number>;
    historicalDailyActuals?: MonthlyProductionHistoricalDailyActual[];
  },
): MonthlyProductionSuggestion[] {
  const targetMonth = input.dateFrom.slice(0, 7);
  const historicalByProductDate = aggregateHistoricalDailyActuals(
    input.historicalDailyActuals ?? [],
    targetMonth,
  );

  return suggestions.flatMap((suggestion) => {
    if (
      suggestion.suggestedQuantity <= 0 ||
      suggestion.productionType === "make_to_order" ||
      compareDate(suggestion.scheduleDate, input.dateTo) > 0
    ) {
      return [suggestion];
    }

    const startDate = clampDate(suggestion.scheduleDate, input.dateFrom, input.dateTo);
    const historicalParts = buildHistoricalSpreadParts({
      productId: suggestion.productId,
      startDate,
      dateTo: input.dateTo,
      totalQuantity: suggestion.suggestedQuantity,
      historicalByProductDate,
    });
    const parts =
      historicalParts.length > 0
        ? historicalParts
        : buildEvenSpreadParts({
            startDate,
            dateTo: input.dateTo,
            totalQuantity: suggestion.suggestedQuantity,
            chunkQuantity: input.chunkQuantityByProductId?.[suggestion.productId] ?? 0,
          });

    if (parts.length <= 1) return [suggestion];

    const basis =
      historicalParts.length > 0
        ? "前年同月の日別実績比率"
        : "標準ロットと対象期間";

    let projectedBeforePart = suggestion.projectedOnHandBeforeSuggestion;
    return parts.map((part) => {
      const projectedAfterPart = round4(projectedBeforePart + part.quantity);
      const row = {
        ...suggestion,
        dueDate: part.date,
        scheduleDate: part.date,
        projectedOnHandBeforeSuggestion: round4(projectedBeforePart),
        projectedOnHandAfterSuggestion: projectedAfterPart,
        shortageQuantity: part.quantity,
        suggestedQuantity: part.quantity,
        reason: `${suggestion.reason} ${basis}で月内 ${parts.length} 回に分散します。`,
      };
      projectedBeforePart = projectedAfterPart;
      return row;
    });
  });
}

function aggregateHistoricalDailyActuals(
  rows: MonthlyProductionHistoricalDailyActual[],
  targetMonth: string,
) {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    const date = mapHistoricalDateToTargetMonth(row.date, targetMonth);
    const byDate = map.get(row.productId) ?? new Map<string, number>();
    byDate.set(date, round4((byDate.get(date) ?? 0) + row.quantity));
    map.set(row.productId, byDate);
  }
  return map;
}

function buildHistoricalSpreadParts(input: {
  productId: string;
  startDate: string;
  dateTo: string;
  totalQuantity: number;
  historicalByProductDate: Map<string, Map<string, number>>;
}) {
  const byDate = input.historicalByProductDate.get(input.productId);
  if (!byDate) return [];
  const weights = [...byDate.entries()]
    .filter(([date, quantity]) => compareDate(date, input.startDate) >= 0 && compareDate(date, input.dateTo) <= 0 && quantity > 0)
    .sort(([a], [b]) => compareDate(a, b))
    .map(([date, quantity]) => ({ date, weight: quantity }));
  return spreadQuantityByWeights(input.totalQuantity, weights);
}

function buildEvenSpreadParts(input: {
  startDate: string;
  dateTo: string;
  totalQuantity: number;
  chunkQuantity: number;
}) {
  const days = eachDay(input.startDate, input.dateTo);
  if (days.length === 0 || input.totalQuantity <= 0) return [];

  const chunkQuantity = Math.max(0, input.chunkQuantity);
  const lotCount = chunkQuantity > 0 ? Math.ceil(input.totalQuantity / chunkQuantity) : 0;
  const fallbackCount = Math.min(days.length, Math.max(1, Math.ceil(days.length / 7)));
  const count = Math.max(1, Math.min(days.length, lotCount > 0 ? lotCount : fallbackCount));
  const dates = pickEvenlySpacedDates(days, count);
  const evenChunk = round4(input.totalQuantity / dates.length);
  const chunk =
    chunkQuantity > 0 && lotCount > 0 && lotCount <= days.length
      ? chunkQuantity
      : evenChunk;

  let remaining = input.totalQuantity;
  return dates
    .map((date, index) => {
      const quantity =
        index === dates.length - 1
          ? round4(remaining)
          : round4(Math.min(chunk, remaining));
      remaining = round4(remaining - quantity);
      return { date, quantity };
    })
    .filter((part) => part.quantity > 0);
}

function spreadQuantityByWeights(totalQuantity: number, weights: { date: string; weight: number }[]) {
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0);
  if (totalQuantity <= 0 || totalWeight <= 0) return [];

  let remaining = totalQuantity;
  return weights
    .map((row, index) => {
      const quantity =
        index === weights.length - 1
          ? round4(remaining)
          : round4((totalQuantity * row.weight) / totalWeight);
      remaining = round4(remaining - quantity);
      return { date: row.date, quantity };
    })
    .filter((part) => part.quantity > 0);
}

function pickEvenlySpacedDates(days: string[], count: number) {
  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.min(days.length - 1, Math.floor((i * days.length) / count));
    dates.push(days[index]);
  }
  return [...new Set(dates)];
}

function mapHistoricalDateToTargetMonth(date: string, targetMonth: string) {
  const day = Math.min(Number(date.slice(8, 10)), lastDayOfMonth(targetMonth));
  return `${targetMonth}-${String(day).padStart(2, "0")}`;
}

function aggregateByProductDate(rows: { productId: string; date: string; quantity: number }[]) {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const byDate = map.get(row.productId) ?? new Map<string, number>();
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.quantity);
    map.set(row.productId, byDate);
  }
  return map;
}

function getNestedQuantity(map: Map<string, Map<string, number>>, productId: string, date: string) {
  return map.get(productId)?.get(date) ?? 0;
}

function roundSuggestedQuantity(product: MonthlyPlanningProduct, shortage: number) {
  if (product.productionType === "make_to_order") return round4(shortage);
  if (product.standardProductionLotSize <= 0) return round4(shortage);
  return Math.ceil(shortage / product.standardProductionLotSize) * product.standardProductionLotSize;
}

function buildReason(
  product: MonthlyPlanningProduct,
  context: {
    dueDate: string;
    demandQuantity: number;
    targetStock: number;
    shortage: number;
    suggestion: number;
  },
) {
  const demandText =
    context.demandQuantity > 0
      ? `${context.dueDate} の受注/出荷予定 ${round4(context.demandQuantity)}${product.unit}`
      : `${context.dueDate} 時点の現在庫`;
  const targetText =
    product.productionType === "make_to_order"
      ? "受注生産のため不足分"
      : `安全在庫 ${round4(context.targetStock)}${product.unit}`;
  const lotText =
    product.productionType !== "make_to_order" && product.standardProductionLotSize > 0
      ? `、標準ロット ${round4(product.standardProductionLotSize)}${product.unit} に丸め`
      : "";
  return `${demandText} と ${targetText} を見て、不足 ${round4(context.shortage)}${product.unit} を ${round4(
    context.suggestion,
  )}${product.unit} として提案${lotText}`;
}

function eachDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  for (let date = dateFrom; compareDate(date, dateTo) <= 0; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function clampDate(date: string, min: string, max: string) {
  if (compareDate(date, min) < 0) return min;
  if (compareDate(date, max) > 0) return max;
  return date;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function subDays(date: string, days: number) {
  return addDays(date, -days);
}

function compareDate(a: string, b: string) {
  return a.localeCompare(b);
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
