import { describe, expect, it } from "vitest";

import {
  buildOfficialName,
  buildProductClassificationProducts,
  buildSourceProductKey,
  parsePackCountQuantity,
  parseProductClassificationSheet,
  parseSpecGrams,
} from "./product-classification";

describe("product classification parser", () => {
  it("parses the latest classification sheet columns", () => {
    const rows = [
      ["改正版", "商品名", "規格", "入数", "結束", "ブランド", "袋、トレー", null, "ダンボール", "備品", "シール", "備考", "原料"],
      ["ア行", "揚げにんにく（裸）", "80g", 10, 6, null, "200×310 三方・KT-52-2", null, "KS-6小", "バイタロン 100", 2, "SAWA専用", null],
    ];

    const parsed = parseProductClassificationSheet("商品分類 (ア行）①", rows);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      category: "ア行",
      productName: "揚げにんにく（裸）",
      specification: "80g",
      packSizeG: 80,
      packCountExpression: "10",
      packCountQuantity: 10,
      bundleCount: "6",
      bagTrayName: "200×310 三方・KT-52-2",
      cartonName: "KS-6小",
      accessoryName: "バイタロン 100",
      sealCount: 2,
      classificationNote: "SAWA専用",
    });
  });

  it("keeps product identity stable across spacing and full-width variants", () => {
    expect(buildSourceProductKey({ productName: "GIANTS柿の種＆ピーナッツ", specification: "230ｇ", brandName: "長登屋" })).toBe(
      buildSourceProductKey({ productName: "ＧＩＡＮＴＳ 柿の種＆ピーナッツ", specification: "230g", brandName: "長登屋" }),
    );
  });

  it("deduplicates the same product across sheets but keeps duplicate sources", () => {
    const first = parseProductClassificationSheet("商品分類 (カ行）①", [
      ["header"],
      ["カ行", "GIANTS柿の種＆ピーナッツ", "230ｇ", 20, 2, "長登屋"],
    ]);
    const second = parseProductClassificationSheet("商品分類 (サ行）①", [
      ["header"],
      ["サ行", "ＧＩＡＮＴＳ柿の種＆ピーナッツ", "230g", 20, 2, "長登屋"],
    ]);

    const products = buildProductClassificationProducts([...first, ...second]);

    expect(products).toHaveLength(1);
    expect(products[0].duplicateSources).toEqual([{ sheetName: "商品分類 (サ行）①", rowNumber: 2 }]);
  });

  it("parses grams, kilograms, and multiplied pack counts", () => {
    expect(parseSpecGrams("2㎏")).toBe(2000);
    expect(parseSpecGrams("25g×6")).toBeNull();
    expect(parsePackCountQuantity("12×20")).toBe(240);
    expect(parsePackCountQuantity("無")).toBeNull();
  });

  it("builds a precise display name from product name, spec, and brand", () => {
    expect(buildOfficialName({ productName: "木の実ミックス　無塩", specification: "106ｇ", brandName: "リカーB" })).toBe(
      "木の実ミックス　無塩 / 106ｇ / リカーB",
    );
  });
});
