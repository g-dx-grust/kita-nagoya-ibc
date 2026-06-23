import { normalizeForSearch } from "./search";

export type ProductMasterProductionType = "stock" | "make_to_order";

export type ProductProductionTypeInput = {
  productCode?: string | null;
  officialName?: string | null;
  displayName?: string | null;
  productName?: string | null;
  specification?: string | null;
  brandName?: string | null;
  packCountExpression?: string | null;
  aliases?: Array<string | { aliasName?: string | null }> | null;
};

type StockProductionProductRule = {
  label: string;
  matches: (text: string) => boolean;
};

const STOCK_PRODUCTION_PRODUCT_RULES: StockProductionProductRule[] = [
  {
    label: "30gMM焼かまぼこ",
    matches: (text) =>
      hasAll(text, ["30g"]) &&
      hasAny(text, ["焼かまぼこ", "焼きかまぼこ"]) &&
      hasAny(text, ["MM", "ミスターマックス", "MrMax"]),
  },
  {
    label: "デリシアするめソーメン35g",
    matches: (text) => hasAll(text, ["デリシア", "するめソーメン", "35g"]),
  },
  {
    label: "55g ドライ塩とまと夢クリエイト",
    matches: (text) => hasAll(text, ["55g", "ドライ塩とまと", "夢クリエイト"]),
  },
  {
    label: "おくら夢かつお53g KSB",
    matches: (text) =>
      hasAny(text, ["おくら夢かつお", "おくら梅かつお"]) && hasAll(text, ["53g", "KSB"]),
  },
  {
    label: "うめ玉",
    matches: (text) => hasAny(text, ["うめ玉"]),
  },
  {
    label: "焼かま（大黒天物産用）30g (12g×15)",
    matches: (text) =>
      hasAll(text, ["30g"]) &&
      hasAny(text, ["大黒天物産", "D-PRICE", "Dプライス", "デイプライス"]) &&
      hasAny(text, ["焼かま", "焼きかま"]) &&
      !hasAny(text, ["こんがり", "そーめん", "ソーメン"]),
  },
  {
    label: "NIDピリ辛 贅沢焼きかま18g (12×10)",
    matches: (text) => hasAll(text, ["NID", "ピリ辛", "贅沢焼きかま", "18g"]),
  },
  {
    label: "40g 素焼き マカダミアナッツ",
    matches: (text) => hasAll(text, ["40g", "素焼きマカダミアナッツ"]),
  },
  {
    label: "個食美学 28g たらっぺ",
    matches: (text) => hasAll(text, ["個食美学", "28g", "たらっぺ"]),
  },
  {
    label: "NID 65g 贅沢焼きかま (20入り)",
    matches: (text) => hasAll(text, ["NID", "65g", "贅沢焼きかま"]) && !hasAny(text, ["ピリ辛"]),
  },
  {
    label: "NTSするめそーめん 10g(12×10)",
    matches: (text) => hasAll(text, ["NTS", "するめそーめん", "10g"]),
  },
  {
    label: "NTS焼めざし14g",
    matches: (text) => hasAll(text, ["NTS", "焼めざし", "14g"]),
  },
  {
    label: "NTSたらっぺ 22g",
    matches: (text) => hasAll(text, ["NTS", "たらっぺ", "22g"]),
  },
  {
    label: "大黒天物産用 こんがり焼きかま 70g 20入り",
    matches: (text) =>
      hasAll(text, ["こんがり焼きかま", "70g"]) &&
      hasAny(text, ["大黒天物産", "D-PRICE", "Dプライス", "デイプライス"]),
  },
  {
    label: "NS無差別 するめソーメン95g（10×10）",
    matches: (text) =>
      hasAll(text, ["NS", "するめソーメン", "95g"]) && hasAny(text, ["無差別", "無選別", "単品"]),
  },
  {
    label: "個食プラス 30g くんさき",
    matches: (text) => hasAll(text, ["個食プラス", "30g", "くんさき"]),
  },
];

export const STOCK_PRODUCTION_PRODUCT_LABELS = STOCK_PRODUCTION_PRODUCT_RULES.map((rule) => rule.label);

export function resolveProductProductionType(input: ProductProductionTypeInput): ProductMasterProductionType {
  return matchedStockProductionProductLabels(input).length > 0 ? "stock" : "make_to_order";
}

export function defaultForecastMethodForProductionType(type: ProductMasterProductionType): "MANUAL" | "NONE" {
  return type === "stock" ? "MANUAL" : "NONE";
}

export function matchedStockProductionProductLabels(input: ProductProductionTypeInput): string[] {
  const text = productMatchText(input);
  return STOCK_PRODUCTION_PRODUCT_RULES.filter((rule) => rule.matches(text)).map((rule) => rule.label);
}

function productMatchText(input: ProductProductionTypeInput) {
  return compactStockProductionText(
    [
      input.productCode,
      input.officialName,
      input.displayName,
      input.productName,
      input.specification,
      input.brandName,
      input.packCountExpression,
      ...(input.aliases ?? []).map((alias) => (typeof alias === "string" ? alias : alias.aliasName)),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasAll(text: string, terms: string[]) {
  return terms.every((term) => text.includes(compactStockProductionText(term)));
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(compactStockProductionText(term)));
}

function compactStockProductionText(value: string) {
  return normalizeForSearch(value)
    .replace(/無差別/g, "無選別")
    .replace(/焼きかま/g, "焼かま")
    .replace(/そうめん/g, "そーめん")
    .replace(/d-price|dprice|dプライス|dぷらいす|デイプライス|でいぷらいす|でぃぷらいす/g, "dprice")
    .replace(/ミスターマックス|みすたーまっくす|mrmax/g, "mm")
    .replace(/個食美学ぷらす|個食ぷらす/g, "個食ぷらす")
    .replace(/[\s\u3000/()（）×✖︎✖️✕xX・,，.。\-_]/g, "");
}
