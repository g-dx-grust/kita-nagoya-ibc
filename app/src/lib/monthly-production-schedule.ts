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

function subDays(date: string, days: number) {
  return addDays(date, -days);
}

function compareDate(a: string, b: string) {
  return a.localeCompare(b);
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
