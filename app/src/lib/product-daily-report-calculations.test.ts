import { describe, expect, it } from "vitest";

import {
  aggregateProductDailyReports,
  computeProductDailyReportMetrics,
  summarizeProductDailyReportTotals,
} from "./product-daily-report-calculations";

describe("product daily report calculations", () => {
  it("computes daily report metrics from time, workers, production, and snapshots", () => {
    const result = computeProductDailyReportMetrics({
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 4,
      productionQty: 800,
      materialUsedKg: 40,
      capacityG: 50,
      materialUnitCostPerKg: 200,
      packageCostPerUnit: 5,
      unitPrice: 20,
      laborHourlyRate: 1200,
    });

    expect(result.operatingMinutes).toBe(120);
    expect(result.totalOperatingMinutes).toBe(480);
    expect(result.perHourQty).toBe(100);
    expect(result.perUnitTimeMinutes).toBe(0.6);
    expect(result.laborFeePerUnit).toBe(12);
    expect(result.bagWeightG).toBe(50);
    expect(result.lossRate).toBe(0);
    expect(result.materialCost).toBe(8000);
    expect(result.packageCost).toBe(4000);
    expect(result.totalCost).toBe(12000);
    expect(result.sales).toBe(16000);
    expect(result.profitRate).toBe(0.25);
    expect(result.warnings).toEqual([]);
  });

  it("sums material cost and weight across multiple raw materials", () => {
    const result = computeProductDailyReportMetrics({
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 4,
      productionQty: 800,
      materials: [
        { usedKg: 30, unitCostPerKg: 200 },
        { usedKg: 10, unitCostPerKg: 500 },
      ],
      capacityG: 50,
      packageCostPerUnit: 5,
      unitPrice: 20,
      laborHourlyRate: 1200,
    });

    expect(result.totalMaterialKg).toBe(40);
    expect(result.materialCost).toBe(11000); // 30*200 + 10*500
    expect(result.bagWeightG).toBe(50); // (40kg*1000)/800
    expect(result.lossRate).toBe(0);
    expect(result.packageCost).toBe(4000);
    expect(result.totalCost).toBe(15000);
    expect(result.sales).toBe(16000);
    expect(result.profitRate).toBe(0.0625);
    expect(result.warnings).toEqual([]);
  });

  it("warns when any used raw material is missing a unit price", () => {
    const result = computeProductDailyReportMetrics({
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 4,
      productionQty: 800,
      materials: [
        { usedKg: 30, unitCostPerKg: 0 },
        { usedKg: 10, unitCostPerKg: 500 },
      ],
      capacityG: 50,
      packageCostPerUnit: 5,
      unitPrice: 20,
      laborHourlyRate: 1200,
    });

    expect(result.materialCost).toBe(5000); // 30*0 + 10*500
    expect(result.warnings).toContain("missing_material_unit_cost");
  });

  it("returns zero-safe metrics and warnings for invalid inputs", () => {
    const result = computeProductDailyReportMetrics({
      startTime: "11:00",
      endTime: "09:00",
      breakMinutes: 0,
      workerCount: 0,
      productionQty: 0,
      materialUsedKg: 10,
      capacityG: null,
      materialUnitCostPerKg: 0,
      packageCostPerUnit: 0,
      unitPrice: 0,
      laborHourlyRate: 1200,
    });

    expect(result.operatingMinutes).toBe(0);
    expect(result.perHourQty).toBe(0);
    expect(result.laborFeePerUnit).toBe(0);
    expect(result.sales).toBe(0);
    expect(result.profitRate).toBe(0);
    expect(result.warnings).toEqual([
      "invalid_time_range",
      "non_positive_worker_count",
      "non_positive_production_qty",
      "missing_capacity_g",
      "missing_unit_price",
      "missing_material_unit_cost",
      "missing_package_cost",
    ]);
  });

  it("aggregates monthly summaries by product and treats non-numeric sales as zero", () => {
    const summaries = aggregateProductDailyReports([
      {
        productId: "p1",
        productName: "商品A",
        productionQty: 100,
        materialUsedKg: 5,
        sales: 1000,
        profitRate: 0.2,
        lossRate: 0.01,
      },
      {
        productId: "p1",
        productName: "商品A",
        productionQty: 150,
        materialUsedKg: 7,
        sales: Number.NaN,
        profitRate: 0.3,
        lossRate: 0.03,
      },
      {
        productId: null,
        productName: "未照合商品",
        productionQty: 10,
        materialUsedKg: 1,
        sales: 200,
        profitRate: 0.1,
        lossRate: -0.02,
      },
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.find((row) => row.productName === "商品A")).toMatchObject({
      manufacturingCount: 2,
      totalProductionQty: 250,
      totalMaterialUsedKg: 12,
      totalSales: 1000,
      averageProfitRate: 0.25,
      averageLossRate: 0.02,
    });

    const total = summarizeProductDailyReportTotals(summaries);
    expect(total.manufacturingCount).toBe(3);
    expect(total.totalProductionQty).toBe(260);
    expect(total.totalMaterialUsedKg).toBe(13);
    expect(total.totalSales).toBe(1200);
  });
});
