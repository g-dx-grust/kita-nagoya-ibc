import { describe, expect, it } from "vitest";

import { computeMonthlyLaborFees, median } from "./product-monthly-labor-fee";

describe("product monthly labor fee", () => {
  it("computes median for odd and even length and empty arrays", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([10])).toBe(10);
  });

  it("groups by product and uses median labor fee, excluding non-positive samples", () => {
    const rows = computeMonthlyLaborFees([
      { productId: "p1", laborFeePerUnit: 10, perHourQty: 120 },
      { productId: "p1", laborFeePerUnit: 20, perHourQty: 60 },
      { productId: "p1", laborFeePerUnit: 30, perHourQty: 40 },
      { productId: "p1", laborFeePerUnit: 0, perHourQty: 0 }, // 除外
      { productId: "p2", laborFeePerUnit: 8, perHourQty: 150 },
      { productId: null, laborFeePerUnit: 99, perHourQty: 10 }, // 除外
    ]);

    const p1 = rows.find((r) => r.productId === "p1");
    expect(p1).toMatchObject({ perBagLaborFee: 20, sampleCount: 3 });
    expect(p1?.avgPerHourQty).toBeCloseTo((120 + 60 + 40) / 3, 4);

    const p2 = rows.find((r) => r.productId === "p2");
    expect(p2).toMatchObject({ perBagLaborFee: 8, sampleCount: 1 });

    expect(rows.find((r) => r.productId === null)).toBeUndefined();
  });
});
