import { describe, expect, it } from "vitest";

import { buildProductDailyReportDashboard, type ProductDailyReportDashboardEntry } from "./product-daily-report-dashboard";

const baseEntry: ProductDailyReportDashboardEntry = {
  id: "entry-1",
  reportDate: "2026-06-01",
  productId: "product-1",
  productCode: "P001",
  productName: "商品A",
  productionQty: 100,
  materialUsedKg: 5,
  operatingMinutes: 60,
  totalOperatingMinutes: 120,
  perHourQty: 50,
  perUnitTimeMinutes: 1.2,
  laborFeePerUnit: 24,
  lossRate: 0.02,
  materialCost: 1000,
  packageCost: 300,
  totalCost: 1300,
  sales: 2000,
  profitRate: 0.35,
  inventoryReflected: true,
  productMatchStatus: "product_id",
  calculationWarnings: [],
  capacityGSnapshot: 50,
  unitPriceSnapshot: 20,
};

describe("product daily report dashboard", () => {
  it("summarizes approved actual entries by month, product, and date", () => {
    const dashboard = buildProductDailyReportDashboard([
      baseEntry,
      {
        ...baseEntry,
        id: "entry-2",
        reportDate: "2026-06-01",
        productionQty: 50,
        materialUsedKg: 2.8,
        totalOperatingMinutes: 60,
        laborFeePerUnit: 20,
        materialCost: 600,
        packageCost: 150,
        totalCost: 750,
        sales: 1000,
        profitRate: 0.25,
        inventoryReflected: false,
      },
      {
        ...baseEntry,
        id: "entry-3",
        reportDate: "2026-06-02",
        productId: "product-2",
        productCode: "P002",
        productName: "商品B",
        productionQty: 200,
        materialUsedKg: 12,
        totalOperatingMinutes: 240,
        laborFeePerUnit: 12,
        materialCost: 1800,
        packageCost: 500,
        totalCost: 2300,
        sales: 5000,
        profitRate: 0.54,
      },
    ]);

    expect(dashboard.totals).toMatchObject({
      entryCount: 3,
      productCount: 2,
      productionQty: 350,
      materialUsedKg: 19.8,
      sales: 8000,
      totalCost: 4350,
      estimatedLaborCost: 5800,
      grossProfit: 3650,
      profitRate: 0.4563,
      inventoryReflectedCount: 2,
      historyOnlyCount: 1,
    });
    expect(dashboard.totals.workerHours).toBe(7);
    expect(dashboard.totals.averagePerHourQty).toBe(50);
    expect(dashboard.productRows.map((row) => row.productName)).toEqual(["商品B", "商品A"]);
    expect(dashboard.productRows[0]).toMatchObject({
      productName: "商品B",
      productionQty: 200,
      productionShare: 0.5714,
    });
    expect(dashboard.dailyRows).toHaveLength(2);
    expect(dashboard.dailyRows[0]).toMatchObject({ date: "2026-06-01", entryCount: 2, productionQty: 150 });
  });

  it("computes previous month comparison without mixing planned values", () => {
    const dashboard = buildProductDailyReportDashboard(
      [baseEntry],
      [
        {
          ...baseEntry,
          id: "previous-1",
          reportDate: "2026-05-01",
          productionQty: 80,
          sales: 1600,
          totalCost: 1200,
          profitRate: 0.25,
        },
      ],
    );

    expect(dashboard.previousTotals.productionQty).toBe(80);
    expect(dashboard.comparison).toMatchObject({
      entryCountDelta: 0,
      productionQtyDeltaRate: 0.25,
      salesDeltaRate: 0.25,
      profitRateDelta: 0.1,
    });
  });

  it("flags rows that need business review", () => {
    const dashboard = buildProductDailyReportDashboard([
      {
        ...baseEntry,
        id: "entry-alert",
        productId: null,
        productCode: null,
        productName: "未照合商品",
        productMatchStatus: "unmatched",
        unitPriceSnapshot: 0,
        capacityGSnapshot: null,
        lossRate: 0.12,
        profitRate: 0.03,
        calculationWarnings: ["missing_material_unit_cost", "invalid_time_range"],
      },
    ]);

    expect(dashboard.totals.alertRowCount).toBe(1);
    expect(dashboard.totals.alertIssueCount).toBeGreaterThan(4);
    expect(dashboard.totals.unmatchedProductCount).toBe(1);
    expect(dashboard.alertRows[0].reasonLabels).toEqual([
      "商品未照合",
      "売値未設定",
      "入り数未設定",
      "原料単価未設定",
      "時間確認",
      "ロス率高め",
      "利率低め",
    ]);
  });

  it("returns null comparison rates when previous month has no base value", () => {
    const dashboard = buildProductDailyReportDashboard([baseEntry]);

    expect(dashboard.previousTotals.entryCount).toBe(0);
    expect(dashboard.comparison.productionQtyDeltaRate).toBeNull();
    expect(dashboard.comparison.salesDeltaRate).toBeNull();
  });
});
