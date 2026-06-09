export const PRODUCT_CLASSIFICATION_SOURCE_SYSTEM = "product_classification_xlsx";
export const PRODUCT_CLASSIFICATION_CODE_PREFIX = "KCL";

export type ProductClassificationCell = string | number | boolean | Date | null | undefined;

export type ProductClassificationRow = {
  sheetName: string;
  rowNumber: number;
  category: string;
  productName: string;
  specification: string | null;
  packSizeG: number | null;
  packCountExpression: string | null;
  packCountQuantity: number | null;
  bundleCount: string | null;
  brandName: string | null;
  bagTrayName: string | null;
  cartonName: string | null;
  accessoryName: string | null;
  sealCount: number | null;
  classificationNote: string | null;
  rawMaterialNote: string | null;
  sourceProductKey: string;
};

export type ProductClassificationProduct = ProductClassificationRow & {
  productCode: string;
  officialName: string;
  duplicateSources: { sheetName: string; rowNumber: number }[];
};

export function isProductClassificationSheet(sheetName: string): boolean {
  return sheetName.startsWith("商品分類 (") && !sheetName.includes("原本");
}

export function parseProductClassificationSheet(
  sheetName: string,
  rows: ProductClassificationCell[][],
): ProductClassificationRow[] {
  if (!isProductClassificationSheet(sheetName)) return [];
  const category = parseCategoryFromSheetName(sheetName);
  const parsed: ProductClassificationRow[] = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const productName = textCell(row[1]);
    if (!productName) continue;

    const specification = textCell(row[2]);
    const packCountExpression = textCell(row[3]);
    const brandName = textCell(row[5]);
    const item: Omit<ProductClassificationRow, "sourceProductKey"> = {
      sheetName,
      rowNumber: index + 1,
      category,
      productName,
      specification,
      packSizeG: parseSpecGrams(specification),
      packCountExpression,
      packCountQuantity: parsePackCountQuantity(packCountExpression),
      bundleCount: textCell(row[4]),
      brandName,
      bagTrayName: textCell(row[6]),
      cartonName: textCell(row[8]),
      accessoryName: textCell(row[9]),
      sealCount: numberCell(row[10]),
      classificationNote: textCell(row[11]),
      rawMaterialNote: textCell(row[12]),
    };
    parsed.push({ ...item, sourceProductKey: buildSourceProductKey(item) });
  }

  return parsed;
}

export function buildProductClassificationProducts(
  rows: ProductClassificationRow[],
): ProductClassificationProduct[] {
  const byKey = new Map<string, ProductClassificationProduct>();
  const usedCodes = new Map<string, string>();

  for (const row of rows) {
    const existing = byKey.get(row.sourceProductKey);
    if (existing) {
      existing.duplicateSources.push({ sheetName: row.sheetName, rowNumber: row.rowNumber });
      continue;
    }

    const baseCode = `${PRODUCT_CLASSIFICATION_CODE_PREFIX}-${hashText(row.sourceProductKey).slice(0, 8)}`;
    let productCode = baseCode;
    let suffix = 2;
    while (usedCodes.has(productCode) && usedCodes.get(productCode) !== row.sourceProductKey) {
      productCode = `${baseCode}-${suffix++}`;
    }
    usedCodes.set(productCode, row.sourceProductKey);

    byKey.set(row.sourceProductKey, {
      ...row,
      productCode,
      officialName: buildOfficialName(row),
      duplicateSources: [],
    });
  }

  return [...byKey.values()].sort((a, b) => a.productCode.localeCompare(b.productCode, "ja"));
}

export function buildOfficialName(row: {
  productName: string;
  specification?: string | null;
  brandName?: string | null;
}): string {
  return [row.productName, row.specification, row.brandName].filter((part) => textCell(part)).join(" / ");
}

export function parseSpecGrams(value: string | null | undefined): number | null {
  const normalized = normalizeUnitText(value);
  if (!normalized) return null;
  const grams = normalized.match(/^(\d+(?:\.\d+)?)g$/i);
  if (grams) return Number(grams[1]);
  const kilograms = normalized.match(/^(\d+(?:\.\d+)?)kg$/i);
  if (kilograms) return Number(kilograms[1]) * 1000;
  return null;
}

export function parsePackCountQuantity(value: string | null | undefined): number | null {
  const normalized = normalizeUnitText(value);
  if (!normalized || normalized === "無") return null;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);

  const multiplied = normalized.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/i);
  if (multiplied) return Number(multiplied[1]) * Number(multiplied[2]);
  return null;
}

export function buildSourceProductKey(row: {
  productName: string;
  specification?: string | null;
  brandName?: string | null;
}): string {
  return [
    normalizeIdentityText(row.productName),
    normalizeIdentityText(row.specification),
    normalizeIdentityText(row.brandName),
  ].join("|");
}

export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[№]/g, "no")
    .replace(/[\s　]+/g, "")
    .replace(/[（）()［］\[\]【】・,，、。\.．\-ー‐‑–—~〜:：;；/／\\]/g, "")
    .trim();
}

function parseCategoryFromSheetName(sheetName: string): string {
  const match = sheetName.match(/商品分類\s*\((.+?)[）)]/);
  return match?.[1]?.trim() || "未分類";
}

function textCell(value: ProductClassificationCell): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === "-" || text === "－" || text.toLowerCase() === "null") return null;
  return text;
}

function numberCell(value: ProductClassificationCell): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeUnitText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s/g, "").trim();
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0");
}
