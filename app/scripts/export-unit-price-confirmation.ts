/* eslint-disable no-console */
//
// Export a client-facing workbook for confirming raw material / packaging unit prices.
//
// Source prices are read from:
//   source_files/renamed_reference_copies/05_existing_production_daily_report_product_master_labor.xlsx
//   sheet: 商品リスト
//
// Output:
//   exports/unit_price_confirmation_list_YYYY-MM-DD.xlsx

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const PRODUCT_XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/05_existing_production_daily_report_product_master_labor.xlsx",
);
const OUTPUT_DIR = path.resolve(__dirname, "../exports");

type SourceKind = "原料" | "製袋名" | "段ボール" | "トレー" | "袋" | "乾燥剤";

type SourcePriceLine = {
  sourceKind: SourceKind;
  candidateName: string;
  unitPrice: number;
  productName: string;
  productPackSizeG: number | null;
};

type AggregatedPrice = {
  sourceKind: SourceKind;
  candidateName: string;
  normalizedName: string;
  unitPrices: number[];
  occurrenceCount: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sampleProducts: string[];
};

type CandidateMatch = {
  name: string;
  price: number;
  score: number;
  prices: string;
  sampleProducts: string;
};

const prisma = new PrismaClient();

function num(value: unknown): number | null {
  if (value == null || value === "" || value === "－" || value === "-") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).replace(/[\s　]+/g, " ").trim();
  if (normalized === "" || normalized === "－" || normalized === "-" || normalized === "null") return null;
  return normalized;
}

function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―ーｰ]/g, "-")
    .replace(/[×ｘ]/g, "x")
    .replace(/[㎏]/g, "kg")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function priceKey(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function uniqueSortedPrices(values: number[]) {
  return [...new Set(values.map((value) => priceKey(value)))].sort((a, b) => Number(a) - Number(b));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function readProductListPrices(): { raw: AggregatedPrice[]; packaging: AggregatedPrice[] } {
  const workbook = XLSX.readFile(PRODUCT_XLSX_PATH);
  const sheet = workbook.Sheets["商品リスト"];
  if (!sheet) throw new Error("商品リスト sheet not found");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  const lines: SourcePriceLine[] = [];

  function addLine(
    row: unknown[],
    sourceKind: SourceKind,
    candidateNameColumn: number,
    unitPriceColumn: number,
    productName: string,
    productPackSizeG: number | null,
  ) {
    const candidateName = str(row[candidateNameColumn]);
    const unitPrice = num(row[unitPriceColumn]);
    if (!candidateName || unitPrice == null || unitPrice <= 0) return;
    lines.push({ sourceKind, candidateName, unitPrice, productName, productPackSizeG });
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] as unknown[];
    const productName = str(row[0]);
    if (!productName) continue;
    const productPackSizeG = num(row[1]);

    addLine(row, "原料", 5, 6, productName, productPackSizeG);
    addLine(row, "原料", 7, 8, productName, productPackSizeG);
    addLine(row, "原料", 9, 10, productName, productPackSizeG);
    addLine(row, "製袋名", 12, 13, productName, productPackSizeG);
    addLine(row, "段ボール", 14, 15, productName, productPackSizeG);
    addLine(row, "トレー", 16, 17, productName, productPackSizeG);
    addLine(row, "袋", 18, 19, productName, productPackSizeG);
    addLine(row, "乾燥剤", 20, 21, productName, productPackSizeG);
  }

  const raw = aggregate(lines.filter((line) => line.sourceKind === "原料"));
  const packaging = aggregate(lines.filter((line) => line.sourceKind !== "原料"));
  return { raw, packaging };
}

function aggregate(lines: SourcePriceLine[]) {
  const map = new Map<string, SourcePriceLine[]>();
  for (const line of lines) {
    const key = `${line.sourceKind}\t${normalizeName(line.candidateName)}`;
    const current = map.get(key) ?? [];
    current.push(line);
    map.set(key, current);
  }

  return [...map.values()]
    .map((group): AggregatedPrice => {
      const first = group[0];
      const unitPrices = group.map((line) => line.unitPrice);
      return {
        sourceKind: first.sourceKind,
        candidateName: first.candidateName,
        normalizedName: normalizeName(first.candidateName),
        unitPrices,
        occurrenceCount: group.length,
        minPrice: Math.min(...unitPrices),
        maxPrice: Math.max(...unitPrices),
        medianPrice: median(unitPrices),
        sampleProducts: [...new Set(group.map((line) => line.productName))].slice(0, 8),
      };
    })
    .sort((a, b) => a.sourceKind.localeCompare(b.sourceKind, "ja") || a.candidateName.localeCompare(b.candidateName, "ja"));
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const min = Math.min(a.length, b.length);
    const max = Math.max(a.length, b.length);
    return 0.72 + (min / max) * 0.25;
  }

  const aSet = bigrams(a);
  const bSet = bigrams(b);
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap++;
  }
  return (2 * overlap) / (aSet.size + bSet.size);
}

function bigrams(value: string) {
  const set = new Set<string>();
  if (value.length <= 1) {
    set.add(value);
    return set;
  }
  for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2));
  return set;
}

function findCandidates(masterName: string, prices: AggregatedPrice[]): CandidateMatch[] {
  const normalized = normalizeName(masterName);
  return prices
    .map((price) => ({
      source: price,
      score: similarity(normalized, price.normalizedName),
    }))
    .filter((match) => match.score >= 0.35)
    .sort((a, b) => b.score - a.score || a.source.candidateName.localeCompare(b.source.candidateName, "ja"))
    .slice(0, 3)
    .map((match) => ({
      name: match.source.candidateName,
      price: match.source.medianPrice,
      score: Math.round(match.score * 100),
      prices: uniqueSortedPrices(match.source.unitPrices).join(" / "),
      sampleProducts: match.source.sampleProducts.join(" / "),
    }));
}

function candidateColumns(candidates: CandidateMatch[]) {
  const padded = [...candidates];
  while (padded.length < 3) padded.push({ name: "", price: 0, score: 0, prices: "", sampleProducts: "" });
  return {
    "候補1_名称": padded[0].name,
    "候補1_単価候補": padded[0].prices,
    "候補1_代表単価": padded[0].name ? padded[0].price : "",
    "候補1_一致度": padded[0].name ? padded[0].score : "",
    "候補1_使用商品例": padded[0].sampleProducts,
    "候補2_名称": padded[1].name,
    "候補2_単価候補": padded[1].prices,
    "候補2_代表単価": padded[1].name ? padded[1].price : "",
    "候補2_一致度": padded[1].name ? padded[1].score : "",
    "候補2_使用商品例": padded[1].sampleProducts,
    "候補3_名称": padded[2].name,
    "候補3_単価候補": padded[2].prices,
    "候補3_代表単価": padded[2].name ? padded[2].price : "",
    "候補3_一致度": padded[2].name ? padded[2].score : "",
    "候補3_使用商品例": padded[2].sampleProducts,
  };
}

function sourceRows(prices: AggregatedPrice[]) {
  return prices.map((price) => ({
    "区分": price.sourceKind,
    "商品リスト上の名称": price.candidateName,
    "単価候補": uniqueSortedPrices(price.unitPrices).join(" / "),
    "代表単価": price.medianPrice,
    "最小単価": price.minPrice,
    "最大単価": price.maxPrice,
    "出現回数": price.occurrenceCount,
    "使用商品例": price.sampleProducts.join(" / "),
    "先方確認_正式名称": "",
    "先方確認_正式単価": "",
    "先方確認_単位": "",
    "先方メモ": "",
  }));
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: Math.max(headers.length - 1, 0) } }) };
  sheet["!cols"] = headers.map((header) => ({ wch: columnWidth(header) }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function appendArraySheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function columnWidth(header: string) {
  if (header.includes("使用商品例")) return 56;
  if (header.includes("名称")) return 28;
  if (header.includes("メモ")) return 28;
  if (header.includes("候補")) return 18;
  if (header.includes("単価")) return 14;
  return 16;
}

async function main() {
  const { raw, packaging } = readProductListPrices();
  const [materials, packagingMaterials] = await Promise.all([
    prisma.material.findMany({
      where: { active: true, materialCode: { notIn: ["RM001", "RM002"] } },
      select: { materialCode: true, name: true, unit: true, standardUnitPrice: true, supplier: { select: { name: true } } },
      orderBy: { materialCode: "asc" },
    }),
    prisma.packagingMaterial.findMany({
      where: { active: true, materialCode: { not: "PK001" } },
      select: {
        materialCode: true,
        name: true,
        kind: true,
        unit: true,
        standardUnitPrice: true,
        supplier: { select: { name: true } },
      },
      orderBy: { materialCode: "asc" },
    }),
  ]);

  const materialRows = materials.map((material) => {
    const candidates = findCandidates(material.name, raw);
    return {
      "確認区分": material.standardUnitPrice > 0 ? "既存単価あり" : "要確認",
      "原料番号": material.materialCode,
      "原料マスター名": material.name,
      "仕入先": material.supplier?.name ?? "",
      "現在の標準単価": material.standardUnitPrice,
      "単位": material.unit,
      ...candidateColumns(candidates),
      "先方確認_採用する名称": "",
      "先方確認_正式単価": "",
      "先方確認_単位": material.unit,
      "先方メモ": "",
    };
  });

  const packagingRows = packagingMaterials.map((material) => {
    const candidates = findCandidates(material.name, packaging);
    return {
      "確認区分": material.standardUnitPrice > 0 ? "既存単価あり" : "要確認",
      "資材番号": material.materialCode,
      "資材マスター名": material.name,
      "種類": material.kind ?? "",
      "仕入先": material.supplier?.name ?? "",
      "現在の標準単価": material.standardUnitPrice,
      "単位": material.unit,
      ...candidateColumns(candidates),
      "先方確認_採用する名称": "",
      "先方確認_正式単価": "",
      "先方確認_単位": material.unit,
      "先方メモ": "",
    };
  });

  const workbook = XLSX.utils.book_new();
  appendArraySheet(workbook, "README", [
    ["目的", "原料・資材マスターの標準単価を先方へ確認するための一覧です。"],
    ["現状", "在庫Excel取り込みでは単価列を読めないため、現DBでは多くの標準単価が0円です。"],
    ["候補の出典", "製造日報Excelの「商品リスト」シートにある 原料単価 / 袋単価 / 段ボール単価 / 乾燥剤単価 等から抽出しています。"],
    ["対象外", "開発用サンプルデータの RM001 / RM002 / PK001 は除外しています。"],
    ["確認してほしい列", "各マスター確認シートの「先方確認_正式単価」「先方確認_採用する名称」「先方確認_単位」「先方メモ」です。"],
    ["注意", "候補は名称の近さで機械的に出しています。名前違いが多いため、候補をそのまま自動反映する前に確認してください。"],
  ]);
  appendSheet(workbook, "原料マスター確認", materialRows);
  appendSheet(workbook, "資材マスター確認", packagingRows);
  appendSheet(workbook, "商品リスト_原料単価候補", sourceRows(raw));
  appendSheet(workbook, "商品リスト_資材単価候補", sourceRows(packaging));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `unit_price_confirmation_list_${todayInTokyo()}.xlsx`);
  XLSX.writeFile(workbook, outputPath);

  console.log(JSON.stringify({
    outputPath,
    materials: materials.length,
    packagingMaterials: packagingMaterials.length,
    rawPriceCandidates: raw.length,
    packagingPriceCandidates: packaging.length,
    materialsWithoutPrice: materials.filter((material) => material.standardUnitPrice === 0).length,
    packagingWithoutPrice: packagingMaterials.filter((material) => material.standardUnitPrice === 0).length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

function todayInTokyo() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
