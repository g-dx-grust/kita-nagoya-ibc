import { describe, expect, it } from "vitest";
import { computeMonthlyVariance } from "./monthly-reconciliation";
import type { MonthlyProductionForecastRow } from "./monthly-production-forecast";

function forecastRow(overrides: Partial<MonthlyProductionForecastRow>): MonthlyProductionForecastRow {
  return {
    productId: "p1",
    productCode: "P-001",
    productName: "商品1",
    productionType: "stock",
    unit: "袋",
    targetMonth: "2026-06",
    status: "forecasted",
    previousYearTargetQuantity: 100,
    currentPreviousMonthQuantity: 100,
    previousYearPreviousMonthQuantity: 100,
    currentTwoMonthsAgoQuantity: 100,
    previousYearTwoMonthsAgoQuantity: 100,
    twoMonthsAgoYoYRate: 1,
    previousMonthYoYRate: 1,
    forecastBasis: "previous_month_yoy",
    rawForecastQuantity: 100,
    forecastQuantity: 100,
    missingRequiredMonths: [],
    reason: "",
    ...overrides,
  };
}

describe("computeMonthlyVariance", () => {
  it("flags over when cumulativeActual exceeds the monthly target", () => {
    const [row] = computeMonthlyVariance({
      forecasts: [forecastRow({ forecastQuantity: 100 })],
      cumulativeActualByProductId: { p1: 120 },
      openPlannedByProductId: {},
    });
    expect(row.status).toBe("over");
    expect(row.variance).toBe(20);
    expect(row.remainingTarget).toBe(0); // 100 - 120 - 0 clamped to 0
  });

  it("flags under when cumulativeActual is below the target", () => {
    const [row] = computeMonthlyVariance({
      forecasts: [forecastRow({ forecastQuantity: 100 })],
      cumulativeActualByProductId: { p1: 40 },
      openPlannedByProductId: {},
    });
    expect(row.status).toBe("under");
    expect(row.variance).toBe(-60);
  });

  it("flags on_track when actual exactly meets the target", () => {
    const [row] = computeMonthlyVariance({
      forecasts: [forecastRow({ forecastQuantity: 100 })],
      cumulativeActualByProductId: { p1: 100 },
      openPlannedByProductId: {},
    });
    expect(row.status).toBe("on_track");
    expect(row.variance).toBe(0);
  });

  it("subtracts both cumulativeActual and openPlanned from remainingTarget and clamps at 0", () => {
    const [row] = computeMonthlyVariance({
      forecasts: [forecastRow({ forecastQuantity: 100 })],
      cumulativeActualByProductId: { p1: 30 },
      openPlannedByProductId: { p1: 40 },
    });
    // remaining = max(0, 100 - 30 - 40) = 30
    expect(row.remainingTarget).toBe(30);
    // variance still measures actual vs target only, ignoring open planned
    expect(row.variance).toBe(-70);
    expect(row.status).toBe("under");
  });

  it("clamps remainingTarget at 0 when actual+planned exceed target", () => {
    const [row] = computeMonthlyVariance({
      forecasts: [forecastRow({ forecastQuantity: 100 })],
      cumulativeActualByProductId: { p1: 70 },
      openPlannedByProductId: { p1: 50 },
    });
    expect(row.remainingTarget).toBe(0);
  });

  it("treats insufficient_data forecasts as zero target (over only if actual produced)", () => {
    const [withActual] = computeMonthlyVariance({
      forecasts: [forecastRow({ status: "insufficient_data", forecastQuantity: 0 })],
      cumulativeActualByProductId: { p1: 25 },
      openPlannedByProductId: {},
    });
    expect(withActual.monthlyTarget).toBe(0);
    expect(withActual.status).toBe("over");

    const [noActual] = computeMonthlyVariance({
      forecasts: [forecastRow({ status: "insufficient_data", forecastQuantity: 0 })],
      cumulativeActualByProductId: {},
      openPlannedByProductId: {},
    });
    expect(noActual.status).toBe("on_track");
  });
});
