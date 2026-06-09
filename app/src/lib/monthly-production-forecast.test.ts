import { describe, expect, it } from "vitest";
import {
  computeHistoricalMonthlyProductionForecasts,
  getHistoricalForecastReferenceMonths,
  type MonthlyProductionForecastProduct,
} from "./monthly-production-forecast";

const stockProduct: MonthlyProductionForecastProduct = {
  productId: "p1",
  productCode: "P001",
  productName: "在庫商品",
  productionType: "stock",
  unit: "袋",
  standardProductionLotSize: 500,
};

describe("getHistoricalForecastReferenceMonths", () => {
  it("対象月から前年対象月、前月、前々月を求める", () => {
    expect(getHistoricalForecastReferenceMonths("2026-05")).toEqual({
      targetMonth: "2026-05",
      previousYearTargetMonth: "2025-05",
      currentPreviousMonth: "2026-04",
      previousYearPreviousMonth: "2025-04",
      currentTwoMonthsAgo: "2026-03",
      previousYearTwoMonthsAgo: "2025-03",
    });
  });
});

describe("computeHistoricalMonthlyProductionForecasts", () => {
  it("前々月前年比を前年対象月に掛けて当月予測を作る", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 },
        { productId: "p1", yearMonth: "2025-03", actualQuantity: 800 },
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 1000 },
      ],
    });

    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "two_months_ago_yoy",
      twoMonthsAgoYoYRate: 1.25,
      rawForecastQuantity: 1250,
      forecastQuantity: 1500,
    });
  });

  it("前月実績が揃っていても前々月前年比を基準にする(リードタイム対応)", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 }, // 前年同月
        { productId: "p1", yearMonth: "2026-04", actualQuantity: 1200 }, // 今年前月
        { productId: "p1", yearMonth: "2025-04", actualQuantity: 1000 }, // 前年前月
        { productId: "p1", yearMonth: "2025-03", actualQuantity: 800 }, // 前年前々月
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 700 }, // 今年前々月
      ],
    });

    // 前々月前年比 700/800 = 0.875 を前年同月 1000 に掛ける → 875 → ロット500丸めで1000。
    // 前月前年比(1.2)は参考として計算・保持はするが、予測には採用しない。
    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "two_months_ago_yoy",
      twoMonthsAgoYoYRate: 0.875,
      previousMonthYoYRate: 1.2,
      rawForecastQuantity: 875,
      forecastQuantity: 1000,
    });
  });

  it("forecastMethod=NONE の商品は自動予測対象外にする", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [{ ...stockProduct, forecastMethod: "NONE" }],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 },
        { productId: "p1", yearMonth: "2025-03", actualQuantity: 800 },
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 1000 },
      ],
    });

    expect(forecasts[0].status).toBe("insufficient_data");
    expect(forecasts[0].forecastQuantity).toBe(0);
    expect(forecasts[0].forecastBasis).toBe("none");
    expect(forecasts[0].reason).toContain("forecastMethod=NONE");
    // 実績は参考として行に残す。
    expect(forecasts[0].previousYearTargetQuantity).toBe(1000);
  });

  it("forecastMethod=YEAR_RATIO は前々月前年比予測を行う", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [{ ...stockProduct, forecastMethod: "YEAR_RATIO" }],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 },
        { productId: "p1", yearMonth: "2025-03", actualQuantity: 800 },
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 1000 },
      ],
    });

    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "two_months_ago_yoy",
      forecastQuantity: 1500,
    });
  });

  it("前月が未確定でも前々月だけで予測できる", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-06",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-06", actualQuantity: 1200 },
        { productId: "p1", yearMonth: "2025-04", actualQuantity: 1000 },
        { productId: "p1", yearMonth: "2026-04", actualQuantity: 900 },
      ],
    });

    expect(forecasts[0].status).toBe("forecasted");
    expect(forecasts[0].previousMonthYoYRate).toBeNull();
    expect(forecasts[0].forecastQuantity).toBe(1500);
  });

  it("受注生産は標準ロットに丸めず予測数量を出す", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [{ ...stockProduct, productionType: "make_to_order", standardProductionLotSize: 500 }],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 240 },
        { productId: "p1", yearMonth: "2025-03", actualQuantity: 120 },
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 150 },
      ],
    });

    expect(forecasts[0].rawForecastQuantity).toBe(300);
    expect(forecasts[0].forecastQuantity).toBe(300);
  });

  it("前々月前年比が使えず前月前年比が使えるなら前月前年比で予測する", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 }, // 前年同月
        { productId: "p1", yearMonth: "2026-04", actualQuantity: 1200 }, // 今年前月
        { productId: "p1", yearMonth: "2025-04", actualQuantity: 1000 }, // 前年前月
        // 前々月(2026-03)・前年前々月(2025-03)は欠落
      ],
    });

    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "previous_month_yoy",
      previousMonthYoYRate: 1.2,
      rawForecastQuantity: 1200,
      forecastQuantity: 1500,
    });
  });

  it("前年比が出せなくても前年同月実績があれば季節ベースで予測する", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-05", actualQuantity: 1000 }, // 前年同月のみ
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 1000 }, // 直近の片側のみ(前年前々月なし→YoY不可)
      ],
    });

    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "previous_year_same_month",
      rawForecastQuantity: 1000,
      forecastQuantity: 1000,
    });
  });

  it("前年実績が無い新商品は直近実績の平均(trailing_average)で予測する", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [{ ...stockProduct, productionType: "make_to_order" }],
      actuals: [
        { productId: "p1", yearMonth: "2026-04", actualQuantity: 300 }, // 前月
        { productId: "p1", yearMonth: "2026-03", actualQuantity: 500 }, // 前々月
      ],
    });

    expect(forecasts[0]).toMatchObject({
      status: "forecasted",
      forecastBasis: "trailing_average",
      rawForecastQuantity: 400,
      forecastQuantity: 400,
    });
    expect(forecasts[0].trailingMonthsUsed).toEqual(["2026-04", "2026-03"]);
  });

  it("前年同月も直近実績も無い商品だけ予測対象外にする", () => {
    const { forecasts } = computeHistoricalMonthlyProductionForecasts({
      targetMonth: "2026-05",
      products: [stockProduct],
      actuals: [
        { productId: "p1", yearMonth: "2025-08", actualQuantity: 1000 }, // 参照窓外のみ
      ],
    });

    expect(forecasts[0].status).toBe("insufficient_data");
    expect(forecasts[0].forecastBasis).toBe("none");
    expect(forecasts[0].forecastQuantity).toBe(0);
  });
});
