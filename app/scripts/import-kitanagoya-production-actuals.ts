/* eslint-disable no-console */

import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient, type Product } from "@prisma/client";

import { normalizeIdentityText } from "../src/lib/product-classification";
import { normalizeForSearch } from "../src/lib/search";

const prisma = new PrismaClient();

const DEFAULT_SHEETS = ["2026.4", "2026.5", "2026.6"];
const IMPORT_NOTE = "北名古屋製造報告 .xlsx 取込(2026-04〜2026-06)";
const IMPORT_VALID_FROM = new Date("2026-06-16T00:00:00.000Z");

type CliOptions = {
  apply: boolean;
  replaceMonths: boolean;
  filePath: string;
  sheets: string[];
};

type ProductListInfo = {
  rowNumber: number;
  name: string;
  packSizeG: number | null;
  packCount: number | null;
  casePackQty: number | null;
  material1: string | null;
  material2: string | null;
  material3: string | null;
  materialTotal: number | null;
  price: number | null;
};

type ActualRow = {
  sheet: string;
  rowNumber: number;
  productName: string;
  yearMonth: string;
  quantity: number;
};

type Resolution =
  | { kind: "verified" | "exact" | "existingSource"; product: Product }
  | { kind: "newFromProductList" | "newFromActualName"; sourceProductKey: string; productName: string };

type AggregateRow = {
  productId: string;
  yearMonth: string;
  quantity: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workbook = XLSX.readFile(options.filePath, { cellDates: false });
  const productList = extractProductList(workbook);
  const actualRows = extractActualRows(workbook, options.sheets);

  const products = await prisma.product.findMany({ include: { aliases: true } });
  const activeProducts = products.filter((product) => product.active);
  const verifiedMerges = loadVerifiedMerges();

  const context = {
    byCode: new Map(activeProducts.map((product) => [product.productCode, product])),
    bySourceKey: new Map(
      products
        .filter((product) => product.sourceProductKey)
        .map((product) => [product.sourceProductKey!, product]),
    ),
    exactIndex: buildExactIndex(activeProducts),
    verifiedMerges,
    productList,
  };

  const resolved = resolveRows(actualRows, context);
  const targetMonths = [...new Set(actualRows.map((row) => row.yearMonth))].sort();

  console.log("=== 北名古屋製造報告 取込 ===");
  console.log(`mode: ${options.apply ? "APPLY" : "dry-run"}`);
  console.log(`file: ${options.filePath}`);
  console.log(`sheets: ${options.sheets.join(", ")}`);
  console.log(`daily rows: ${actualRows.length}`);
  console.log(`product-month rows: ${resolved.aggregateRows.length}`);
  console.log(`new products: ${resolved.newProducts.size}`);
  console.log("resolution:", resolved.resolutionCounts);
  console.log("months:", summarizeByMonth(resolved.aggregateRows));

  if (resolved.newProducts.size > 0) {
    console.log("\nnew product preview:");
    for (const product of [...resolved.newProducts.values()].slice(0, 20)) {
      console.log(`  ${product.productCode}\t${product.productName}`);
    }
  }

  if (!options.apply) {
    console.log("\nDry-run only. Re-run with --apply to write to DB.");
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const sourceKeyToId = new Map<string, string>();
      let createdProducts = 0;
      let updatedProducts = 0;

      for (const product of resolved.newProducts.values()) {
        const existing = await tx.product.findUnique({
          where: { sourceProductKey: product.sourceProductKey },
          select: { id: true },
        });
        const info = productList.get(product.sourceProductKey) ?? null;
        const note = buildProductNote(info);
        const data = {
          officialName: product.productName,
          displayName: product.productName,
          productionType: "stock",
          forecastMethod: "MANUAL",
          unit: "袋",
          packSizeG: info?.packSizeG ?? null,
          packCount: info?.packCount ?? null,
          casePackQty: info?.casePackQty ?? null,
          sourceSystem: "production_list_xlsx",
          sourceProductKey: product.sourceProductKey,
          sourceSheetName: "商品リスト",
          sourceRowNumber: info?.rowNumber ?? null,
          billingEnabled: true,
          usedAtKitagoya: true,
          active: true,
          validFrom: IMPORT_VALID_FROM,
          note,
        };

        if (existing) {
          const updated = await tx.product.update({
            where: { id: existing.id },
            data,
          });
          sourceKeyToId.set(product.sourceProductKey, updated.id);
          updatedProducts++;
        } else {
          const created = await tx.product.create({
            data: { id: product.productId, productCode: product.productCode, ...data },
          });
          sourceKeyToId.set(product.sourceProductKey, created.id);
          createdProducts++;
        }
      }

      let monthlyActualsUpserted = 0;
      for (const row of resolved.aggregateRows) {
        const productId = row.productId.startsWith("new:")
          ? sourceKeyToId.get(row.productId.slice(4))
          : row.productId;
        if (!productId) throw new Error(`missing product id for ${row.productId}`);

        await tx.productMonthlyActual.upsert({
          where: { productId_yearMonth: { productId, yearMonth: row.yearMonth } },
          update: {
            actualQuantity: row.quantity,
            sourceType: "import",
            note: IMPORT_NOTE,
          },
          create: {
            productId,
            yearMonth: row.yearMonth,
            actualQuantity: row.quantity,
            sourceType: "import",
            note: IMPORT_NOTE,
          },
        });
        monthlyActualsUpserted++;
      }

      let removedStaleRows = 0;
      if (options.replaceMonths) {
        const deleted = await tx.productMonthlyActual.deleteMany({
          where: {
            yearMonth: { in: targetMonths },
            OR: [{ note: null }, { note: { not: IMPORT_NOTE } }],
          },
        });
        removedStaleRows = deleted.count;
      }

      await tx.auditLog.create({
        data: {
          action: "import_kitanagoya_production_actuals_xlsx",
          entityType: "ProductMonthlyActual",
          afterJson: JSON.stringify({
            filePath: options.filePath,
            sheets: options.sheets,
            dailyRows: actualRows.length,
            createdProducts,
            updatedProducts,
            monthlyActualsUpserted,
            removedStaleRows,
            resolutionCounts: resolved.resolutionCounts,
          }),
        },
      });

      return { createdProducts, updatedProducts, monthlyActualsUpserted, removedStaleRows };
    },
    { timeout: 120000 },
  );

  console.log("\nApplied:");
  console.log(result);
}

function parseArgs(args: string[]): CliOptions {
  const apply = args.includes("--apply");
  const replaceMonths = args.includes("--replace-months");
  const sheetsArg = args.find((arg) => arg.startsWith("--sheets="));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  if (!fileArg) {
    console.error(
      "Usage: npm run import:kitanagoya-actuals -- /path/to/北名古屋製造報告.xlsx [--sheets=2026.4,2026.5,2026.6] [--apply] [--replace-months]",
    );
    process.exit(1);
  }
  return {
    apply,
    replaceMonths,
    filePath: path.resolve(process.cwd(), fileArg),
    sheets: sheetsArg ? sheetsArg.slice("--sheets=".length).split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_SHEETS,
  };
}

function loadVerifiedMerges(): Record<string, string> {
  const filePath = path.resolve(__dirname, "../../docs/production_actuals_verified_merges_2026-06-08.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
}

function buildExactIndex(products: Array<Product & { aliases: { aliasName: string }[] }>): Map<string, Product> {
  const index = new Map<string, Product>();
  for (const product of products) {
    const names = [product.officialName, product.displayName, ...product.aliases.map((alias) => alias.aliasName)].filter(
      (value): value is string => Boolean(value),
    );
    for (const name of names) {
      const key = normalizeForSearch(name);
      if (!index.has(key)) index.set(key, product);
    }
  }
  return index;
}

function extractProductList(workbook: XLSX.WorkBook): Map<string, ProductListInfo> {
  const sheet = workbook.Sheets["商品リスト"];
  if (!sheet) throw new Error("商品リスト sheet not found");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null, raw: false });
  const result = new Map<string, ProductListInfo>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = textCell(row[0]);
    if (!name) continue;
    result.set(`prl|${normalizeIdentityText(name)}`, {
      rowNumber: i + 1,
      name,
      packSizeG: numberCell(row[1]),
      packCount: intCell(row[2]),
      casePackQty: numberCell(row[3]) ?? numberCell(row[2]),
      material1: textCell(row[5]),
      material2: textCell(row[7]),
      material3: textCell(row[9]),
      materialTotal: numberCell(row[22]),
      price: numberCell(row[23]),
    });
  }
  return result;
}

function extractActualRows(workbook: XLSX.WorkBook, sheetNames: string[]): ActualRow[] {
  const result: ActualRow[] = [];
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`sheet not found: ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null, raw: false });
    const header = rows[0] ?? [];
    const dateCol = findColumn(header, ["日付"]);
    const productCol = findColumn(header, ["商品名"]);
    const quantityCol = findColumn(header, ["生産数"]);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const productName = textCell(row[productCol]);
      const quantity = numberCell(row[quantityCol]);
      const reportDate = parseDateCell(row[dateCol]);
      if (!productName && quantity == null) continue;
      if (!productName || !quantity || !reportDate) continue;
      result.push({
        sheet: sheetName,
        rowNumber: i + 1,
        productName,
        quantity,
        yearMonth: reportDate.slice(0, 7),
      });
    }
  }
  return result;
}

function resolveRows(
  rows: ActualRow[],
  context: {
    byCode: Map<string, Product>;
    bySourceKey: Map<string, Product>;
    exactIndex: Map<string, Product>;
    verifiedMerges: Record<string, string>;
    productList: Map<string, ProductListInfo>;
  },
) {
  const productCodes = new Set([...context.byCode.keys()]);
  const newProducts = new Map<string, { productId: string; productCode: string; sourceProductKey: string; productName: string }>();
  const aggregate = new Map<string, AggregateRow>();
  const resolutionCounts: Record<string, number> = {};

  for (const row of rows) {
    const resolution = resolveProduct(row.productName, context);
    resolutionCounts[resolution.kind] = (resolutionCounts[resolution.kind] ?? 0) + 1;

    let productId: string;
    if ("product" in resolution) {
      productId = resolution.product.id;
    } else {
      const sourceProductKey = resolution.sourceProductKey;
      if (!newProducts.has(sourceProductKey)) {
        let productCode = `KRL-${fnv1aHex(sourceProductKey)}`;
        let suffix = 2;
        while (productCodes.has(productCode)) {
          productCode = `KRL-${fnv1aHex(sourceProductKey)}-${suffix++}`;
        }
        productCodes.add(productCode);
        newProducts.set(sourceProductKey, {
          productId: `krl_${fnv1aHex(sourceProductKey)}`,
          productCode,
          sourceProductKey,
          productName: resolution.productName,
        });
      }
      productId = `new:${sourceProductKey}`;
    }

    const key = `${productId}|${row.yearMonth}`;
    const existing = aggregate.get(key) ?? { productId, yearMonth: row.yearMonth, quantity: 0 };
    existing.quantity = round4(existing.quantity + row.quantity);
    aggregate.set(key, existing);
  }

  return { aggregateRows: [...aggregate.values()], newProducts, resolutionCounts };
}

function resolveProduct(
  productName: string,
  context: {
    byCode: Map<string, Product>;
    bySourceKey: Map<string, Product>;
    exactIndex: Map<string, Product>;
    verifiedMerges: Record<string, string>;
    productList: Map<string, ProductListInfo>;
  },
): Resolution {
  const verifiedCode = context.verifiedMerges[productName];
  if (verifiedCode) {
    const product = context.byCode.get(verifiedCode);
    if (!product) throw new Error(`verified merge target not found: ${productName} -> ${verifiedCode}`);
    return { kind: "verified", product };
  }

  const exact = context.exactIndex.get(normalizeForSearch(productName));
  if (exact) return { kind: "exact", product: exact };

  const sourceProductKey = `prl|${normalizeIdentityText(productName)}`;
  const existing = context.bySourceKey.get(sourceProductKey);
  if (existing) return { kind: "existingSource", product: existing };

  return {
    kind: context.productList.has(sourceProductKey) ? "newFromProductList" : "newFromActualName",
    sourceProductKey,
    productName,
  };
}

function summarizeByMonth(rows: AggregateRow[]) {
  return rows.reduce<Record<string, { rows: number; quantity: number }>>((summary, row) => {
    const current = summary[row.yearMonth] ?? { rows: 0, quantity: 0 };
    current.rows++;
    current.quantity = round4(current.quantity + row.quantity);
    summary[row.yearMonth] = current;
    return summary;
  }, {});
}

function buildProductNote(info: ProductListInfo | null): string {
  const lines = [
    "北名古屋製造報告 商品リスト/実績名から作成",
    info ? `原料: ${[info.material1, info.material2, info.material3].filter(Boolean).join(" / ") || "-"}` : null,
    info?.materialTotal != null ? `材料費(原表): ${info.materialTotal}` : null,
    info?.price != null ? `売価(原表): ${info.price}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function textCell(value: unknown): string | null {
  const text = value == null ? "" : String(value).replace(/\u00a0/g, " ").trim();
  return text ? text : null;
}

function numberCell(value: unknown): number | null {
  const text = textCell(value)?.replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function intCell(value: unknown): number | null {
  const n = numberCell(value);
  return n == null ? null : Math.trunc(n);
}

function headerKey(value: unknown): string {
  return (textCell(value) ?? "").normalize("NFKC").replace(/\s+/g, "");
}

function findColumn(header: unknown[], candidates: string[]): number {
  const keys = header.map(headerKey);
  for (const candidate of candidates) {
    const normalized = headerKey(candidate);
    const index = keys.findIndex((key) => key === normalized || key.includes(normalized));
    if (index >= 0) return index;
  }
  throw new Error(`column not found: ${candidates.join("/")}`);
}

function parseDateCell(value: unknown): string | null {
  const text = textCell(value);
  const match = text?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
