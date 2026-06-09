import { describe, expect, it } from "vitest";
import { sumConfirmedActuals } from "./monthly-actual-aggregation";

describe("sumConfirmedActuals", () => {
  it("sums actualQuantity across confirmed reports", () => {
    expect(
      sumConfirmedActuals([{ actualQuantity: 100 }, { actualQuantity: 50 }, { actualQuantity: 12 }]),
    ).toBe(162);
  });

  it("treats null/undefined actualQuantity as zero", () => {
    expect(
      sumConfirmedActuals([{ actualQuantity: 80 }, { actualQuantity: null }, { actualQuantity: 20 }]),
    ).toBe(100);
  });

  it("returns 0 for no reports", () => {
    expect(sumConfirmedActuals([])).toBe(0);
  });

  it("rounds to 4 decimals to avoid float drift", () => {
    expect(sumConfirmedActuals([{ actualQuantity: 0.1 }, { actualQuantity: 0.2 }])).toBe(0.3);
  });
});
