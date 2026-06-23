import { describe, expect, it } from "vitest";

import {
  STOCK_PRODUCTION_PRODUCT_LABELS,
  defaultForecastMethodForProductionType,
  matchedStockProductionProductLabels,
  resolveProductProductionType,
} from "./product-production-type";

describe("product production type classification", () => {
  it("keeps the stock production allowlist to the 16 products specified by the business", () => {
    expect(STOCK_PRODUCTION_PRODUCT_LABELS).toHaveLength(16);
  });

  it.each([
    "焼きかまぼこ ミスターマックスB KS共配30g",
    "デリシアするめソーメン35g",
    "ドライ塩トマトピロ60gスタンドパック夢クリエイトB 55g",
    "おくら梅かつお53g KSB",
    "うめ玉 アステルファーム グリーンクロスB",
    "大黒天物産 Dプライス焼きかま 30g",
    "NIDピリ辛味 贅沢焼かま 18g",
    "素焼きマカダミアナッツ40g",
    "個食美学たらっぺ28g",
    "ＮＩＤ贅沢焼かま 65g",
    "NTSするめそーめん10ｇ",
    "NTS焼めざし14g",
    "NTSたらっぺ22g",
    "大黒天物産 こんがり焼きかま 70g",
    "NS 単品95gスルメソーメン",
    "くんさき(個食美学プラス) 30ｇ",
  ])("classifies %s as stock production", (officialName) => {
    expect(resolveProductProductionType({ officialName })).toBe("stock");
  });

  it("requires customer/brand signals when the stock list is specific", () => {
    expect(resolveProductProductionType({ officialName: "箱シール3面 するめソーメン(浜だより)35g リカーB" })).toBe(
      "make_to_order",
    );
    expect(resolveProductProductionType({ officialName: "贅沢焼かま 65g 別注" })).toBe("make_to_order");
    expect(resolveProductProductionType({ officialName: "こんがり焼きかま 70g 別注" })).toBe("make_to_order");
  });

  it("uses aliases and separated brand fields when resolving stock products", () => {
    const labels = matchedStockProductionProductLabels({
      officialName: "するめソーメン",
      specification: "35g",
      brandName: "デリシア",
      aliases: [{ aliasName: "旧名 デリシアするめソーメン35g" }],
    });

    expect(labels).toEqual(["デリシアするめソーメン35g"]);
  });

  it("sets forecast defaults from the resolved production type", () => {
    expect(defaultForecastMethodForProductionType("stock")).toBe("MANUAL");
    expect(defaultForecastMethodForProductionType("make_to_order")).toBe("NONE");
  });
});
