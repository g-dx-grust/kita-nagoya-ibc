import { describe, expect, it } from "vitest";
import {
  CASE_UNIT,
  ceilDisplayQuantity,
  formatCases,
  formatCasesWithDetail,
  formatNumber,
  formatQuantity,
  isWholeCases,
  quantityToCases,
} from "./units";

describe("quantityToCases", () => {
  it("端数は切り上げる(memo: ケース数で繰り上げ発行)", () => {
    expect(quantityToCases(608, 24)).toBe(26); // 25.33 -> 26
    expect(quantityToCases(601, 24)).toBe(26);
  });

  it("ちょうど割り切れる場合はその整数", () => {
    expect(quantityToCases(600, 24)).toBe(25);
    expect(quantityToCases(24, 24)).toBe(1);
  });

  it("数量0は0ケース", () => {
    expect(quantityToCases(0, 24)).toBe(0);
  });

  it("負の数量(在庫不足)は不足を安全側に大きく見せる(絶対値切上げ)", () => {
    expect(quantityToCases(-30, 24)).toBe(-2); // -1.25 -> -2
    expect(quantityToCases(-24, 24)).toBe(-1);
    expect(quantityToCases(-601, 24)).toBe(-26); // -25.04 -> -26
  });

  it("-0 を生まず 0 に正規化する", () => {
    const r = quantityToCases(-1, 24); // floor(-0.04) = -1, ではなく境界確認
    expect(Object.is(r, -0)).toBe(false);
    // 0 ちょうどは +0
    expect(Object.is(quantityToCases(0, 24), -0)).toBe(false);
  });

  it("負の小さな端数も -0 表記を出さない(formatCases)", () => {
    // -1 袋 / 24 -> floor = -1 ケース（-0 にならない）
    expect(formatCases(-1, { casePackQty: 24, baseUnit: "袋" })).not.toContain("-0");
  });

  it("ケース入数が未設定/0以下なら null(ケース表記不可)", () => {
    expect(quantityToCases(100, null)).toBeNull();
    expect(quantityToCases(100, undefined)).toBeNull();
    expect(quantityToCases(100, 0)).toBeNull();
    expect(quantityToCases(100, -5)).toBeNull();
  });

  it("NaN/Infinity は null", () => {
    expect(quantityToCases(Number.NaN, 24)).toBeNull();
    expect(quantityToCases(Number.POSITIVE_INFINITY, 24)).toBeNull();
  });

  it("小数のケース入数(例 12.5)でも切り上げ", () => {
    expect(quantityToCases(100, 12.5)).toBe(8); // 8.0 -> 8
    expect(quantityToCases(101, 12.5)).toBe(9); // 8.08 -> 9
  });
});

describe("isWholeCases", () => {
  it("ちょうど割り切れる時のみ true", () => {
    expect(isWholeCases(600, 24)).toBe(true);
    expect(isWholeCases(608, 24)).toBe(false);
    expect(isWholeCases(100, null)).toBe(false);
  });
});

describe("formatCases", () => {
  it("ケース入数があれば基本単位とケース整数を併記", () => {
    expect(formatCases(608, { casePackQty: 24, baseUnit: "袋" })).toBe(`608 袋 / 26 ${CASE_UNIT}`);
    expect(formatCases(600, { casePackQty: 24, baseUnit: "袋" })).toBe(`600 袋 / 25 ${CASE_UNIT}`);
  });

  it("ケース入数が無ければ基本単位表示にフォールバック", () => {
    expect(formatCases(608, { baseUnit: "袋" })).toBe("608 袋");
    expect(formatCases(12.5, { baseUnit: "kg" })).toBe("13 kg");
  });

  it("基本単位も小数は切り上げる", () => {
    expect(formatCases(608.1, { casePackQty: 24, baseUnit: "袋" })).toBe(`609 袋 / 26 ${CASE_UNIT}`);
    expect(formatCases(-1.2, { baseUnit: "袋" })).toBe("-2 袋");
  });

  it("null/NaN は —", () => {
    expect(formatCases(null, { casePackQty: 24 })).toBe("—");
    expect(formatCases(Number.NaN, { casePackQty: 24 })).toBe("—");
  });
});

describe("formatCasesWithDetail", () => {
  it("ケース表示時は基本単位の内訳を detail に残す", () => {
    const r = formatCasesWithDetail(608, { casePackQty: 24, baseUnit: "袋" });
    expect(r.isCase).toBe(true);
    expect(r.text).toBe(`608 袋 / 26 ${CASE_UNIT}`);
    expect(r.detail).toContain("24");
  });

  it("フォールバック時は detail なし", () => {
    const r = formatCasesWithDetail(608, { baseUnit: "袋" });
    expect(r.isCase).toBe(false);
    expect(r.text).toBe("608 袋");
    expect(r.detail).toBeNull();
  });
});

describe("ceilDisplayQuantity / formatQuantity", () => {
  it("正数小数は切り上げる", () => {
    expect(ceilDisplayQuantity(12.01)).toBe(13);
    expect(formatQuantity(12.01, "袋")).toBe("13 袋");
  });

  it("負数小数も絶対値が大きくなる方向へ切り上げる", () => {
    expect(ceilDisplayQuantity(-12.01)).toBe(-13);
    expect(formatQuantity(-12.01, "袋")).toBe("-13 袋");
  });
});

describe("formatNumber", () => {
  it("桁区切り", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });
  it("null/NaN は —", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});
