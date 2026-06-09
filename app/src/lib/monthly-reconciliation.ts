import type { MonthlyProductionForecastRow } from "./monthly-production-forecast";

// 当月の予実・過不足 (read-model)。
//
// 方針: 予定 (planned_*) と実績 (actual_*) を厳密に分ける。
// monthlyTarget / openPlanned / remainingTarget は「予測 + 未完了予定」側の値、
// cumulativeActual は確定実績 (ProductMonthlyActual / 確定日報集計) 側の値のみで構成する。

export type MonthlyVarianceStatus = "over" | "under" | "on_track";

export type MonthlyVarianceRow = {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  /** 月次予測数量 (forecast.forecastQuantity)。未予測の商品は 0。 */
  monthlyTarget: number;
  /** 確定実績の累計 (確定日報 / ProductMonthlyActual)。 */
  cumulativeActual: number;
  /** 未完了 (draft/confirmed) の生産予定数量。完了分は cumulativeActual に含む想定。 */
  openPlanned: number;
  /** 残目標 = max(0, 予測 - 実績累計 - 未完了予定)。これ以上の追加予定が必要な量。 */
  remainingTarget: number;
  /** 過不足 = 実績累計 - 予測。正=作りすぎ、負=不足。 */
  variance: number;
  status: MonthlyVarianceStatus;
};

/**
 * 当月の商品別 予実・過不足を計算する純関数。
 * forecasts は対象月の computeHistoricalMonthlyProductionForecasts(...).forecasts。
 */
export function computeMonthlyVariance(input: {
  forecasts: MonthlyProductionForecastRow[];
  cumulativeActualByProductId: Record<string, number>;
  openPlannedByProductId: Record<string, number>;
}): MonthlyVarianceRow[] {
  return input.forecasts.map((forecast) => {
    const monthlyTarget = forecast.status === "forecasted" ? round4(forecast.forecastQuantity) : 0;
    const cumulativeActual = round4(input.cumulativeActualByProductId[forecast.productId] ?? 0);
    const openPlanned = round4(input.openPlannedByProductId[forecast.productId] ?? 0);
    const remainingTarget = round4(Math.max(0, monthlyTarget - cumulativeActual - openPlanned));
    const variance = round4(cumulativeActual - monthlyTarget);

    return {
      productId: forecast.productId,
      productCode: forecast.productCode,
      productName: forecast.productName,
      unit: forecast.unit,
      monthlyTarget,
      cumulativeActual,
      openPlanned,
      remainingTarget,
      variance,
      status: classify(monthlyTarget, cumulativeActual, variance),
    };
  });
}

function classify(monthlyTarget: number, cumulativeActual: number, variance: number): MonthlyVarianceStatus {
  // 予測が無い (=0) 商品で実績だけある場合は作りすぎ扱い。
  if (monthlyTarget <= 0) return cumulativeActual > 0 ? "over" : "on_track";
  if (variance > 0) return "over";
  if (variance < 0) return "under";
  return "on_track";
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
