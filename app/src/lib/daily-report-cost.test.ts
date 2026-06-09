import { describe, expect, it } from "vitest";
import { computeDailyReportActualCost } from "./daily-report-cost";

describe("computeDailyReportActualCost", () => {
  it("sums raw_material and packaging separately and bills labor on actual quantity", () => {
    const cost = computeDailyReportActualCost({
      actualQuantity: 10,
      billingUnitPrice: 5,
      consumptions: [
        { itemType: "raw_material", actualQuantity: 3, unitPriceSnapshot: 2 }, // 6
        { itemType: "raw_material", actualQuantity: 1, unitPriceSnapshot: 4 }, // 4
        { itemType: "packaging", actualQuantity: 10, unitPriceSnapshot: 1.5 }, // 15
      ],
    });

    expect(cost).toEqual({
      actualLaborCost: 50, // 10 * 5
      actualMaterialCost: 10, // 6 + 4
      actualPackagingCost: 15,
      actualTotalCost: 75, // 50 + 10 + 15
    });
  });

  it("treats null/zero actualQuantity as zero labor", () => {
    const cost = computeDailyReportActualCost({
      actualQuantity: null,
      billingUnitPrice: 5,
      consumptions: [{ itemType: "raw_material", actualQuantity: 2, unitPriceSnapshot: 3 }],
    });

    expect(cost.actualLaborCost).toBe(0);
    expect(cost.actualMaterialCost).toBe(6);
    expect(cost.actualPackagingCost).toBe(0);
    expect(cost.actualTotalCost).toBe(6);
  });

  it("handles missing prices (no consumptions, zero unit price) as zero cost", () => {
    const cost = computeDailyReportActualCost({
      actualQuantity: 4,
      billingUnitPrice: 0,
      consumptions: [],
    });

    expect(cost).toEqual({
      actualLaborCost: 0,
      actualMaterialCost: 0,
      actualPackagingCost: 0,
      actualTotalCost: 0,
    });
  });

  it("rounds to 2 decimals consistent with computeCostEstimate", () => {
    const cost = computeDailyReportActualCost({
      actualQuantity: 2,
      billingUnitPrice: 1.125,
      consumptions: [
        { itemType: "raw_material", actualQuantity: 1, unitPriceSnapshot: 0.125 }, // 0.125 -> 0.13
        { itemType: "packaging", actualQuantity: 1, unitPriceSnapshot: 0.044 }, // 0.044 -> 0.04
      ],
    });

    // labor = 2 * 1.125 = 2.25 ; material = 0.125 -> 0.13 ; packaging = 0.044 -> 0.04.
    // total rounds the UNROUNDED sum (2.25 + 0.125 + 0.044 = 2.419) -> 2.42,
    // matching computeCostEstimate's totalCost = round2(labor + material + packaging).
    expect(cost.actualLaborCost).toBe(2.25);
    expect(cost.actualMaterialCost).toBe(0.13);
    expect(cost.actualPackagingCost).toBe(0.04);
    expect(cost.actualTotalCost).toBe(2.42);
  });
});
