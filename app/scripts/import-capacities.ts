/* eslint-disable no-console */
//
// Aggregate daily-report sheets in 05_…labor.xlsx and import known production facts:
// - "1人当たり1hの生産数(個)" (col N, index 13) -> ProductionCapacity.unitsPerPersonHour
// - "生産数" (col K, index 10) -> Product.standardProductionLotSize when empty
//
// 作業場所は日報に記録されていないため、以下のルールで決定する:
//   1) 商品の defaultWorkAreaId が設定済み → それを使う
//   2) 未設定 → 「一般部屋」(無ければ新規作成して使う) をデフォルトとして適用
//
// 商品の照合は officialName 完全一致 → ProductAlias → 失敗ならスキップ＆ログ。
//
// 再実行: ProductionCapacity (productId+workAreaId ユニーク) を update_or_create。

import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/05_existing_production_daily_report_product_master_labor.xlsx",
);
const DEFAULT_WORK_AREA_NAME = "一般部屋";
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

const prisma = new PrismaClient();

function num(v: unknown): number | null {
  if (v == null || v === "" || v === "－" || v === "-") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// 月別シート名 (例: "2024.3", "2024.11 ", "2025.1 ") を網羅
function monthlySheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter((n) => /^20\d{2}\.\d{1,2}\s*$/.test(n));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

type Sample = {
  upph: number;
  productionQuantity: number | null;
  bagG: number | null;
  lossRate: number | null;
  labor: number | null;
};

async function main() {
  if (cliPath && /\.csv$/i.test(cliPath)) {
    await importCapacitiesCsv(path.resolve(process.cwd(), cliPath));
    return;
  }

  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  const sheets = monthlySheets(wb);
  console.log(`  monthly sheets: ${sheets.length}`);

  // Aggregate samples per official product name
  const byName = new Map<string, Sample[]>();
  let totalRows = 0;
  let usefulRows = 0;
  for (const s of sheets) {
    const ws = wb.Sheets[s];
    if (!ws) continue;
    const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    for (let i = 1; i < arr.length; i++) {
      const r = arr[i] as unknown[];
      const name = str(r[1]);
      const upph = num(r[13]); // 1人当たり1hの生産数(個)
      if (!name) continue;
      totalRows++;
      if (upph == null) continue;
      usefulRows++;
      const sample: Sample = {
        upph,
        productionQuantity: num(r[10]),
        bagG: num(r[16]),
        lossRate: num(r[17]),
        labor: num(r[15]),
      };
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(sample);
    }
  }
  console.log(`  rows scanned: ${totalRows}, with capacity: ${usefulRows}`);
  console.log(`  unique product names: ${byName.size}`);

  // Resolve default work area
  let defaultArea = await prisma.workArea.findFirst({
    where: { name: DEFAULT_WORK_AREA_NAME },
  });
  if (!defaultArea) {
    defaultArea = await prisma.workArea.create({
      data: { name: DEFAULT_WORK_AREA_NAME, areaType: "internal", displayOrder: 0 },
    });
    console.log(`  作成: workArea ${DEFAULT_WORK_AREA_NAME}`);
  }

  let matched = 0;
  let aliased = 0;
  let unmatched = 0;
  let capacityCreated = 0;
  let capacityUpdated = 0;
  let lotSizeUpdated = 0;
  let lotSizeSkipped = 0;
  const unmatchedNames: string[] = [];

  for (const [name, samples] of byName) {
    // Find product by officialName first, then by alias.
    let product = await prisma.product.findFirst({ where: { officialName: name, active: true } });
    if (!product) {
      const alias = await prisma.productAlias.findFirst({
        where: { aliasName: name, product: { active: true } },
        include: { product: true },
      });
      if (alias) {
        product = alias.product;
        aliased++;
      }
    } else {
      matched++;
    }
    if (!product) {
      unmatched++;
      unmatchedNames.push(name);
      continue;
    }

    const upph = median(samples.map((s) => s.upph));
    const productionQuantities = samples
      .map((s) => s.productionQuantity)
      .filter((v): v is number => v != null);
    const medianProductionQuantity =
      productionQuantities.length > 0 ? median(productionQuantities) : null;
    if (medianProductionQuantity != null) {
      if (product.standardProductionLotSize <= 0) {
        await prisma.product.update({
          where: { id: product.id },
          data: { standardProductionLotSize: medianProductionQuantity },
        });
        lotSizeUpdated++;
      } else {
        lotSizeSkipped++;
      }
    }

    const workAreaId = product.defaultWorkAreaId ?? defaultArea.id;
    const note = [
      `日報${samples.length}件の中央値 (median)`,
      medianProductionQuantity != null
        ? `生産数中央値 ${formatNumber(medianProductionQuantity)}袋`
        : null,
    ]
      .filter(Boolean)
      .join(" / ");

    const existing = await prisma.productionCapacity.findUnique({
      where: { productId_workAreaId: { productId: product.id, workAreaId } },
    });
    if (existing) {
      await prisma.productionCapacity.update({
        where: { id: existing.id },
        data: {
          unitsPerPersonHour: upph,
          standardBreakMinutes: 0,
          sourceType: "DAILY_REPORT_MEDIAN",
          note,
        },
      });
      capacityUpdated++;
    } else {
      await prisma.productionCapacity.create({
        data: {
          productId: product.id,
          workAreaId,
          unitsPerPersonHour: upph,
          standardPeople: 1,
          standardBreakMinutes: 0,
          sourceType: "DAILY_REPORT_MEDIAN",
          note,
        },
      });
      capacityCreated++;
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`  商品マッチ: ${matched} (officialName) + ${aliased} (alias) = ${matched + aliased}`);
  console.log(`  生産能力 新規: ${capacityCreated}, 更新: ${capacityUpdated}`);
  console.log(`  標準ロット(生産数中央値) 更新: ${lotSizeUpdated}, 既存値ありスキップ: ${lotSizeSkipped}`);
  console.log(`  未マッチ商品名: ${unmatched}`);
  if (unmatched > 0) {
    console.log(`  例 (最初の10件):`);
    for (const n of unmatchedNames.slice(0, 10)) console.log(`    - ${n}`);
    if (unmatchedNames.length > 10) console.log(`    ... (+${unmatchedNames.length - 10}件)`);
  }
}

async function importCapacitiesCsv(filePath: string) {
  console.log(`Reading CSV ${filePath}`);
  const { rows } = parseCsvWithHeader(readFileSync(filePath, "utf8"));
  const workAreas = await prisma.workArea.findMany();
  const products = await prisma.product.findMany({ where: { active: true } });
  const workAreaByName = new Map(workAreas.map((row) => [row.name, row.id]));
  const productByCode = new Map(products.map((row) => [row.productCode, row.id]));
  const productByName = new Map(products.map((row) => [row.officialName, row.id]));
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const productId =
      value(row.product_id) ??
      (value(row.product_code) ? productByCode.get(value(row.product_code)!) : undefined) ??
      (value(row.product_name) ? productByName.get(value(row.product_name)!) : undefined);
    const workAreaId =
      value(row.work_area_id) ??
      (value(row.work_area_name) ? workAreaByName.get(value(row.work_area_name)!) : undefined);
    const unitsPerPersonHour = positiveNumber(row.units_per_person_hour);
    const sourceType = value(row.source_type) ?? "MANUAL";
    const locked = parseBool(row.locked) ?? false;
    const validFrom = parseDate(row.valid_from);
    const validTo = parseDate(row.valid_to);

    if (!productId) {
      errors.push(`${line}: product not found`);
      continue;
    }
    if (!workAreaId) {
      errors.push(`${line}: work_area not found`);
      continue;
    }
    if (unitsPerPersonHour == null) {
      errors.push(`${line}: invalid units_per_person_hour`);
      continue;
    }
    if (!["MANUAL", "DAILY_REPORT_MEDIAN"].includes(sourceType)) {
      errors.push(`${line}: invalid source_type`);
      continue;
    }
    if (validFrom === false || validTo === false || (validFrom && validTo && validFrom >= validTo)) {
      errors.push(`${line}: invalid validity period`);
      continue;
    }

    await prisma.productionCapacity.upsert({
      where: { productId_workAreaId: { productId, workAreaId } },
      update: {
        unitsPerPersonHour,
        standardPeople: positiveNumber(row.standard_people) ?? 1,
        standardBreakMinutes: nonnegativeInt(row.standard_break_minutes) ?? 0,
        sourceType,
        locked,
        validFrom: validFrom || null,
        validTo: validTo || null,
        note: value(row.note),
      },
      create: {
        productId,
        workAreaId,
        unitsPerPersonHour,
        standardPeople: positiveNumber(row.standard_people) ?? 1,
        standardBreakMinutes: nonnegativeInt(row.standard_break_minutes) ?? 0,
        sourceType,
        locked,
        validFrom: validFrom || null,
        validTo: validTo || null,
        note: value(row.note),
      },
    });
    imported++;
  }

  console.log(`  CSV imported: ${imported}, errors: ${errors.length}`);
  for (const error of errors.slice(0, 20)) console.log(`  error ${error}`);
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function positiveNumber(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonnegativeInt(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function parseBool(v: string | undefined): boolean | null {
  const s = value(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function parseDate(v: string | undefined): Date | null | false {
  const s = value(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : false;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
