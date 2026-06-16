/* eslint-disable no-console */

import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient, type Product } from "@prisma/client";

import { normalizeIdentityText } from "../src/lib/product-classification";
import { normalizeForSearch } from "../src/lib/search";

const prisma = new PrismaClient();

const DEFAULT_FILE_PATH = "/Users/shojiyuya/Downloads/北名古屋製造報告 .xlsx";
const HISTORY_SOURCE_TYPE = "excel_history";
const HISTORY_MATERIAL_NAME = "Excel履歴取込";
const IMPORT_NOTE = "北名古屋製造報告 .xlsx 日報履歴取込（在庫未反映）";
const CHUNK_SIZE = 500;

type CliOptions = {
  apply: boolean;
  replaceHistory: boolean;
  filePath: string;
  sheets: string[] | null;
  maxDate: string;
};

type ProductWithAliases = Product & { aliases: { aliasName: string }[] };

type ProductResolution = {
  productId: string | null;
  productName: string;
  normalizedProductName: string;
  productMatchStatus: "exact" | "alias" | "fuzzy" | "unmatched";
  resolutionKind: "verified" | "sourceKey" | "exact" | "alias" | "unmatched";
};

type ParsedHistoryRow = {
  id: string;
  fingerprint: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  sourceSheetYearMonth: string;
  reportYearMonth: string;
  reportDate: string;
  productName: string;
  capacityGSnapshot: number | null;
  aggregateNames: string[];
  expiryDate: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  operatingMinutes: number;
  workerCount: number;
  productionQty: number;
  materialUsedKg: number;
  totalOperatingMinutes: number;
  perHourQty: number;
  perUnitTimeMinutes: number;
  laborFeePerUnit: number;
  bagWeightG: number;
  lossRate: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  sales: number;
  profitRate: number;
  note: string | null;
  resolution?: ProductResolution;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workbook = XLSX.readFile(options.filePath, { cellDates: false, cellNF: true });
  const sheetNames = resolveTargetSheets(workbook, options.sheets);
  const extractedRows = extractRows(workbook, sheetNames);
  const rawRows = extractedRows.filter((row) => row.reportDate <= options.maxDate);
  const futureRows = extractedRows.length - rawRows.length;
  const parsed = dedupeRows(rawRows);

  const products = await prisma.product.findMany({ where: { active: true }, include: { aliases: true } });
  const resolver = buildProductResolver(products);
  for (const row of parsed) row.resolution = resolver(row.productName);

  const summary = summarize(rawRows, parsed);
  console.log("=== 北名古屋製造日報 履歴取込 ===");
  console.log(`mode: ${options.apply ? "APPLY" : "dry-run"}`);
  console.log(`file: ${options.filePath}`);
  console.log(`sheets: ${sheetNames.map((name) => name.trim()).join(", ")}`);
  console.log(`raw valid rows: ${summary.rawRows}`);
  console.log(`future rows excluded (> ${options.maxDate}): ${futureRows}`);
  console.log(`unique history rows: ${parsed.length}`);
  console.log(`deduped rows: ${summary.duplicateRows}`);
  console.log("months:", summary.byMonth);
  console.log("resolution:", summary.resolutionCounts);
  console.log("inventory: stock movements will NOT be created (inventoryReflected=false)");

  if (!options.apply) {
    console.log("\nDry-run only. Re-run with --apply to write history rows.");
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let deleted = 0;
      if (options.replaceHistory) {
        const existing = await tx.productionDailyReportEntry.findMany({
          where: {
            sourceType: HISTORY_SOURCE_TYPE,
            sourceSheetName: { in: sheetNames.map((name) => name.trim()) },
          },
          select: { id: true },
        });
        if (existing.length > 0) {
          for (const chunk of chunks(existing.map((entry) => entry.id), 200)) {
            await tx.stockMovement.deleteMany({
              where: {
                sourceType: "production_daily_report",
                OR: chunk.flatMap((id) => [{ sourceId: id }, { sourceId: { startsWith: `${id}:` } }]),
              },
            });
          }
          const removed = await tx.productionDailyReportEntry.deleteMany({
            where: { id: { in: existing.map((entry) => entry.id) } },
          });
          deleted = removed.count;
        }
      }

      const existingIds = new Set<string>();
      for (const chunk of chunks(parsed.map((row) => row.id), CHUNK_SIZE)) {
        const existing = await tx.productionDailyReportEntry.findMany({
          where: { id: { in: chunk } },
          select: { id: true },
        });
        for (const row of existing) existingIds.add(row.id);
      }

      const rowsToCreate = parsed.filter((row) => !existingIds.has(row.id));
      for (const chunk of chunks(rowsToCreate, CHUNK_SIZE)) {
        await tx.productionDailyReportEntry.createMany({
          data: chunk.map((row) => toEntryCreateInput(row)),
          skipDuplicates: true,
        });
        const materialRows = chunk
          .filter((row) => row.materialUsedKg > 0)
          .map((row) => ({
            entryId: row.id,
            materialId: null,
            materialName: HISTORY_MATERIAL_NAME,
            materialCode: null,
            usedKg: row.materialUsedKg,
            unitPriceSnapshot: row.materialUsedKg > 0 ? row.materialCost / row.materialUsedKg : 0,
            mixRatio: null,
            sortOrder: 0,
          }));
        if (materialRows.length > 0) {
          await tx.productionDailyReportEntryMaterial.createMany({ data: materialRows });
        }
      }

      await tx.auditLog.create({
        data: {
          action: "import_kitanagoya_daily_report_history",
          entityType: "ProductionDailyReportEntry",
          afterJson: JSON.stringify({
            filePath: options.filePath,
            sheets: sheetNames.map((name) => name.trim()),
            rowsCreated: rowsToCreate.length,
            rowsSkippedExisting: existingIds.size,
            rowsDeletedBeforeReplace: deleted,
            inventoryReflected: false,
            byMonth: summary.byMonth,
            resolutionCounts: summary.resolutionCounts,
          }),
        },
      });

      return { rowsCreated: rowsToCreate.length, rowsSkippedExisting: existingIds.size, rowsDeletedBeforeReplace: deleted };
    },
    { timeout: 120000 },
  );

  console.log("\nApplied:");
  console.log(result);
}

function parseArgs(args: string[]): CliOptions {
  const apply = args.includes("--apply");
  const replaceHistory = args.includes("--replace-history");
  const sheetsArg = args.find((arg) => arg.startsWith("--sheets="));
  const maxDateArg = args.find((arg) => arg.startsWith("--max-date="));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const maxDate = maxDateArg ? maxDateArg.slice("--max-date=".length) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(maxDate)) throw new Error(`invalid --max-date: ${maxDate}`);
  return {
    apply,
    replaceHistory,
    filePath: path.resolve(process.cwd(), fileArg ?? DEFAULT_FILE_PATH),
    sheets: sheetsArg ? sheetsArg.slice("--sheets=".length).split(",").map((s) => s.trim()).filter(Boolean) : null,
    maxDate,
  };
}

function resolveTargetSheets(workbook: XLSX.WorkBook, requestedSheets: string[] | null) {
  if (requestedSheets && requestedSheets.length > 0) {
    return requestedSheets.map((requested) => {
      const found = workbook.SheetNames.find((sheet) => sheet.trim() === requested.trim());
      if (!found) throw new Error(`sheet not found: ${requested}`);
      return found;
    });
  }
  return workbook.SheetNames.filter((sheet) => /^\d{4}\.\d{1,2}\s*$/.test(sheet));
}

function extractRows(workbook: XLSX.WorkBook, sheetNames: string[]) {
  const rows: ParsedHistoryRow[] = [];
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`sheet not found: ${sheetName}`);
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: false,
    });
    const sourceSheetName = sheetName.trim();
    const sourceSheetYearMonth = sheetYearMonth(sourceSheetName);
    for (let index = 1; index < values.length; index++) {
      const row = parseRow(values[index] ?? [], sourceSheetName, sourceSheetYearMonth, index + 1);
      if (row) rows.push(row);
    }
  }
  return rows;
}

function parseRow(
  row: unknown[],
  sourceSheetName: string,
  sourceSheetYearMonth: string,
  sourceRowNumber: number,
): ParsedHistoryRow | null {
  const reportDate = parseDateCell(row[0]);
  const productName = textCell(row[1]);
  const productionQty = numberCell(row[11]);
  if (!reportDate || !productName || !productionQty || productionQty <= 0) return null;

  const aggregateNames = [textCell(row[3]), textCell(row[4])].filter((value): value is string => Boolean(value));
  const note = buildNote(aggregateNames, textCell(row[24]));
  const parsed: Omit<ParsedHistoryRow, "id" | "fingerprint"> = {
    sourceSheetName,
    sourceRowNumber,
    sourceSheetYearMonth,
    reportYearMonth: reportDate.slice(0, 7),
    reportDate,
    productName,
    capacityGSnapshot: numberCell(row[2]),
    aggregateNames,
    expiryDate: parseDateCell(row[5]),
    startTime: parseTimeCell(row[6]) ?? "00:00",
    endTime: parseTimeCell(row[7]) ?? "00:00",
    breakMinutes: durationMinutesCell(row[8]) ?? 0,
    operatingMinutes: numberCell(row[9]) ?? 0,
    workerCount: numberCell(row[10]) ?? 0,
    productionQty,
    materialUsedKg: numberCell(row[12]) ?? 0,
    totalOperatingMinutes: numberCell(row[13]) ?? 0,
    perHourQty: numberCell(row[14]) ?? 0,
    perUnitTimeMinutes: numberCell(row[15]) ?? 0,
    laborFeePerUnit: numberCell(row[16]) ?? 0,
    bagWeightG: numberCell(row[17]) ?? 0,
    lossRate: percentCell(row[18]) ?? 0,
    materialCost: numberCell(row[19]) ?? 0,
    packageCost: numberCell(row[20]) ?? 0,
    totalCost: numberCell(row[21]) ?? 0,
    sales: numberCell(row[22]) ?? 0,
    profitRate: percentCell(row[23]) ?? 0,
    note,
  };
  const fingerprint = buildFingerprint(parsed);
  return { ...parsed, fingerprint, id: `kdr_${fnv1aHex(fingerprint)}` };
}

function dedupeRows(rows: ParsedHistoryRow[]) {
  const byFingerprint = new Map<string, ParsedHistoryRow[]>();
  for (const row of rows) {
    const group = byFingerprint.get(row.fingerprint) ?? [];
    group.push(row);
    byFingerprint.set(row.fingerprint, group);
  }
  return [...byFingerprint.values()]
    .map((group) =>
      group.sort((a, b) => {
        const aMatches = a.sourceSheetYearMonth === a.reportYearMonth ? 1 : 0;
        const bMatches = b.sourceSheetYearMonth === b.reportYearMonth ? 1 : 0;
        return bMatches - aMatches || a.sourceRowNumber - b.sourceRowNumber;
      })[0],
    )
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.sourceRowNumber - b.sourceRowNumber);
}

function buildProductResolver(products: ProductWithAliases[]) {
  const verifiedMerges = loadVerifiedMerges();
  const byCode = new Map(products.map((product) => [product.productCode, product]));
  const bySourceKey = new Map(
    products
      .filter((product) => product.sourceProductKey)
      .map((product) => [product.sourceProductKey!, product]),
  );
  const exactIndex = new Map<string, { product: ProductWithAliases; kind: "exact" | "alias" }>();
  for (const product of products) {
    for (const name of [product.officialName, product.displayName].filter((value): value is string => Boolean(value))) {
      const key = normalizeForSearch(name);
      if (!exactIndex.has(key)) exactIndex.set(key, { product, kind: "exact" });
    }
    for (const alias of product.aliases) {
      const key = normalizeForSearch(alias.aliasName);
      if (!exactIndex.has(key)) exactIndex.set(key, { product, kind: "alias" });
    }
  }

  return (productName: string): ProductResolution => {
    const verifiedCode = verifiedMerges[productName];
    const verified = verifiedCode ? byCode.get(verifiedCode) : null;
    if (verified) return resolution(verified, productName, "alias", "verified");

    const sourceKeyProduct = bySourceKey.get(`prl|${normalizeIdentityText(productName)}`);
    if (sourceKeyProduct) return resolution(sourceKeyProduct, productName, "exact", "sourceKey");

    const exact = exactIndex.get(normalizeForSearch(productName));
    if (exact) return resolution(exact.product, productName, exact.kind, exact.kind);

    return {
      productId: null,
      productName,
      normalizedProductName: normalizeForSearch(productName),
      productMatchStatus: "unmatched",
      resolutionKind: "unmatched",
    };
  };
}

function resolution(
  product: ProductWithAliases,
  productName: string,
  productMatchStatus: ProductResolution["productMatchStatus"],
  resolutionKind: ProductResolution["resolutionKind"],
): ProductResolution {
  return {
    productId: product.id,
    productName,
    normalizedProductName: normalizeForSearch(productName),
    productMatchStatus,
    resolutionKind,
  };
}

function toEntryCreateInput(row: ParsedHistoryRow) {
  const resolution = row.resolution;
  if (!resolution) throw new Error(`missing product resolution: ${row.productName}`);
  const unitPriceSnapshot = row.productionQty > 0 ? row.sales / row.productionQty : 0;
  const packageCostPerUnitSnapshot = row.productionQty > 0 ? row.packageCost / row.productionQty : 0;
  const materialUnitCostSnapshot = row.materialUsedKg > 0 ? row.materialCost / row.materialUsedKg : 0;
  return {
    id: row.id,
    reportDate: toDate(row.reportDate),
    productId: resolution.productId,
    productName: resolution.productName,
    normalizedProductName: resolution.normalizedProductName,
    productMatchStatus: resolution.productMatchStatus,
    expiryDate: row.expiryDate ? toDate(row.expiryDate) : null,
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: row.breakMinutes,
    workerCount: row.workerCount,
    productionQty: row.productionQty,
    materialUsedKg: row.materialUsedKg,
    laborFeeRateId: null,
    note: row.note,
    sourceType: HISTORY_SOURCE_TYPE,
    sourceSheetName: row.sourceSheetName,
    sourceRowNumber: row.sourceRowNumber,
    active: true,
    approvalStatus: "approved",
    inventoryReflected: false,
    submittedBy: "Excel履歴取込",
    approvedAt: null,
    approvedBy: null,
    labelPhotosJson: "[]",
    capacityGSnapshot: row.capacityGSnapshot,
    materialUnitCostSnapshot,
    packageCostPerUnitSnapshot,
    unitPriceSnapshot,
    laborHourlyRateSnapshot: row.perHourQty > 0 ? row.laborFeePerUnit * row.perHourQty : 0,
    operatingMinutes: row.operatingMinutes,
    totalOperatingMinutes: row.totalOperatingMinutes,
    perHourQty: row.perHourQty,
    perUnitTimeMinutes: row.perUnitTimeMinutes,
    laborFeePerUnit: row.laborFeePerUnit,
    bagWeightG: row.bagWeightG,
    lossRate: row.lossRate,
    materialCost: row.materialCost,
    packageCost: row.packageCost,
    totalCost: row.totalCost,
    sales: row.sales,
    profitRate: row.profitRate,
    calculationWarnings: JSON.stringify([]),
  };
}

function summarize(rawRows: ParsedHistoryRow[], rows: ParsedHistoryRow[]) {
  const byMonth: Record<string, { rows: number; quantity: number }> = {};
  const resolutionCounts: Record<string, number> = {};
  const seenFingerprints = new Set<string>();
  for (const row of rows) {
    const month = byMonth[row.reportYearMonth] ?? { rows: 0, quantity: 0 };
    month.rows += 1;
    month.quantity = round4(month.quantity + row.productionQty);
    byMonth[row.reportYearMonth] = month;
    const kind = row.resolution?.resolutionKind ?? "unmatched";
    resolutionCounts[kind] = (resolutionCounts[kind] ?? 0) + 1;
    seenFingerprints.add(row.fingerprint);
  }
  return {
    rawRows: rawRows.length,
    duplicateRows: rawRows.length - seenFingerprints.size,
    byMonth,
    resolutionCounts,
  };
}

function loadVerifiedMerges(): Record<string, string> {
  const filePath = path.resolve(__dirname, "../../docs/production_actuals_verified_merges_2026-06-08.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
}

function buildNote(aggregateNames: string[], note: string | null) {
  const parts = [
    IMPORT_NOTE,
    aggregateNames.length > 0 ? `商品名合算: ${aggregateNames.join(" / ")}` : null,
    note ? `備考: ${note}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

function buildFingerprint(row: Omit<ParsedHistoryRow, "id" | "fingerprint" | "resolution">) {
  return [
    row.reportDate,
    normalizeForSearch(row.productName),
    row.capacityGSnapshot ?? "",
    row.aggregateNames.map(normalizeForSearch).join("/"),
    row.expiryDate ?? "",
    row.startTime,
    row.endTime,
    row.breakMinutes,
    row.operatingMinutes,
    row.workerCount,
    row.productionQty,
    row.materialUsedKg,
    row.totalOperatingMinutes,
    row.perHourQty,
    row.perUnitTimeMinutes,
    row.laborFeePerUnit,
    row.bagWeightG,
    row.lossRate,
    row.materialCost,
    row.packageCost,
    row.totalCost,
    row.sales,
    row.profitRate,
    normalizeForSearch(row.note),
  ].join("|");
}

function textCell(value: unknown): string | null {
  const text = value == null ? "" : String(value).replace(/\u00a0/g, " ").trim();
  return text ? text : null;
}

function numberCell(value: unknown): number | null {
  const text = textCell(value)?.normalize("NFKC").replace(/,/g, "");
  if (!text || text.startsWith("#")) return null;
  const n = Number(text.replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}

function percentCell(value: unknown): number | null {
  const text = textCell(value)?.normalize("NFKC").replace(/,/g, "");
  if (!text || text.startsWith("#")) return null;
  const n = Number(text.replace(/%$/, ""));
  if (!Number.isFinite(n)) return null;
  return text.includes("%") ? n / 100 : n;
}

function durationMinutesCell(value: unknown): number | null {
  const text = textCell(value)?.normalize("NFKC");
  if (!text) return null;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return numberCell(value);
}

function parseTimeCell(value: unknown): string | null {
  const text = textCell(value)?.normalize("NFKC");
  if (!text) return null;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function parseDateCell(value: unknown): string | null {
  const text = textCell(value)?.normalize("NFKC");
  const match = text?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function sheetYearMonth(sheetName: string) {
  const match = /^(\d{4})\.(\d{1,2})$/.exec(sheetName.trim());
  if (!match) return "";
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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
