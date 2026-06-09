import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeForSearch, normalizedIncludes } from "./search";

describe("normalizeForSearch", () => {
  it("folds half-width katakana, full-width katakana and hiragana to the same form", () => {
    const a = normalizeForSearch("するめ");
    expect(normalizeForSearch("ｽﾙﾒ")).toBe(a);
    expect(normalizeForSearch("スルメ")).toBe(a);
  });

  it("normalizes full-width ascii/digits and lowercases", () => {
    expect(normalizeForSearch("ＡＢＣ１２３")).toBe("abc123");
    expect(normalizeForSearch("Lab-001")).toBe("lab-001");
  });

  it("normalizes half-width kana words inside a product name", () => {
    // 「ﾃﾄﾗ」(半角) は 「てとら」(NFKCで全角カナ→ひらがな畳み込み)に一致する
    expect(normalizeForSearch("揚げ塩ぎんなんﾃﾄﾗ42ｇ")).toContain("てとら");
    expect(normalizeForSearch("揚げ塩ぎんなんﾃﾄﾗ42ｇ")).toContain("42g");
  });

  it("handles null/undefined/empty", () => {
    expect(normalizeForSearch(null)).toBe("");
    expect(normalizeForSearch(undefined)).toBe("");
    expect(normalizeForSearch("  ")).toBe("");
  });
});

describe("matchesQuery", () => {
  it("empty query matches everything", () => {
    expect(matchesQuery("", ["LAB-001", "おくらスナック"])).toBe(true);
  });

  it("matches across fields regardless of kana width", () => {
    expect(matchesQuery("するめ", ["XLR-002", "するめｿｰﾒﾝ 13CM"])).toBe(true);
    expect(matchesQuery("ｿｰﾒﾝ", ["XLR-002", "するめソーメン 13CM"])).toBe(true);
  });

  it("AND-matches space separated terms", () => {
    expect(matchesQuery("するめ 13", ["XLR-002", "するめｿｰﾒﾝ 13CM"])).toBe(true);
    expect(matchesQuery("するめ 99", ["XLR-002", "するめｿｰﾒﾝ 13CM"])).toBe(false);
  });

  it("matches code case-insensitively", () => {
    expect(matchesQuery("lab-001", ["LAB-001", "商品"])).toBe(true);
  });
});

describe("normalizedIncludes", () => {
  it("partial match with normalization", () => {
    expect(normalizedIncludes("揚げにんにく(裸)80g", "にんにく")).toBe(true);
    expect(normalizedIncludes("揚げにんにく(裸)80g", "80G")).toBe(true);
    expect(normalizedIncludes("揚げにんにく(裸)80g", "たこ")).toBe(false);
  });
});
