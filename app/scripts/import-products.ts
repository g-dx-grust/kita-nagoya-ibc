/* eslint-disable no-console */
//
// Import "商品リスト" + "手間賃リスト" from the customer Excel into the DB.
//
// Source: source_files/renamed_reference_copies/05_existing_production_daily_report_product_master_labor.xlsx
//
// - Excel に商品コード列は無いので、内部的に XLS-001 〜 を発番する。
// - official_name (= Excelの商品名) を一意キー扱いとして冪等にupsert。
//   再実行時は既存行を更新し、新規行のみ採番する。
// - 入り数(g) → packSizeG, 入り数(c/s) → packCount / casePackQty (整数)
// - 手間賃リストは「商品名 / 1袋手間賃」が2列ペアで横並びになっているため、
//   全列を走査して name→price のマップを構築する。
// - 手間賃は BillingPrice (unitPrice=円, unit="袋", effectiveFrom=2026-01-01) として登録。
//   既に同 productId+effectiveFrom の行があれば skip (履歴を壊さない)。
// - 一致しない手間賃名は別名 (ProductAlias) として登録できないので、ログだけ残す。
//
// 実行: npm run import:products

import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";
import {
  defaultForecastMethodForProductionType,
  resolveProductProductionType,
} from "../src/lib/product-production-type";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/05_existing_production_daily_report_product_master_labor.xlsx",
);
const EFFECTIVE_FROM = new Date("2026-01-01");
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

const prisma = new PrismaClient();

type ProductRow = {
  name: string;
  packSizeG: number | null;
  packCount: number | null; // c/s
  totalCount: number | null;
  bagB: number | null;
  rawMaterials: { name: string; unitPrice: number | null }[];
  rawMaterialTotal: number | null;
  bagDesignName: string | null;
  bagUnitPrice: number | null;
  cartonName: string | null;
  cartonUnitPrice: number | null;
};

function num(v: unknown): number | null {
  if (v == null || v === "" || v === "－" || v === "-") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "－" || s === "-" || s === "null") return null;
  return s;
}

function readProductList(wb: XLSX.WorkBook): ProductRow[] {
  const ws = wb.Sheets["商品リスト"];
  if (!ws) throw new Error("商品リスト sheet not found");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const out: ProductRow[] = [];
  // row 0 is header.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const name = str(r[0]);
    if (!name) continue;
    out.push({
      name,
      packSizeG: num(r[1]),
      totalCount: num(r[2]),
      packCount: num(r[3]),
      bagB: num(r[4]),
      rawMaterials: [
        { name: str(r[5]) ?? "", unitPrice: num(r[6]) },
        { name: str(r[7]) ?? "", unitPrice: num(r[8]) },
        { name: str(r[9]) ?? "", unitPrice: num(r[10]) },
      ].filter((rm) => rm.name),
      rawMaterialTotal: num(r[11]),
      bagDesignName: str(r[12]),
      bagUnitPrice: num(r[13]),
      cartonName: str(r[14]),
      cartonUnitPrice: num(r[15]),
    });
  }
  return out;
}

function readLaborPrices(wb: XLSX.WorkBook): Map<string, number> {
  // 手間賃リスト は「商品名 / 1袋手間賃」のペアが横方向に複数並んでいる。
  // ヘッダーが row 1 にあり、row 2 以降がデータ。
  const ws = wb.Sheets["手間賃リスト"];
  if (!ws) throw new Error("手間賃リスト sheet not found");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const headerRow = rows[1] as unknown[];
  const pairs: { nameCol: number; priceCol: number }[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const cell = str(headerRow[c]);
    if (cell === "商品名" && headerRow[c + 1] != null) {
      pairs.push({ nameCol: c, priceCol: c + 1 });
    }
  }

  const map = new Map<string, number>();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    for (const { nameCol, priceCol } of pairs) {
      const n = str(r[nameCol]);
      const p = num(r[priceCol]);
      if (n && p != null && p > 0 && !map.has(n)) {
        map.set(n, p);
      }
    }
  }
  return map;
}

async function main() {
  if (cliPath && /\.csv$/i.test(cliPath)) {
    await importProductsCsv(path.resolve(process.cwd(), cliPath));
    return;
  }

  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  const products = readProductList(wb);
  const laborMap = readLaborPrices(wb);
  console.log(`  商品リスト: ${products.length} rows`);
  console.log(`  手間賃リスト: ${laborMap.size} unique products`);

  // 既存の最大採番を取得
  const existingMax = await prisma.product.findFirst({
    where: { productCode: { startsWith: "XLS-" } },
    orderBy: { productCode: "desc" },
    select: { productCode: true },
  });
  let nextSerial = existingMax
    ? Number(existingMax.productCode.replace("XLS-", "")) + 1
    : 1;

  let created = 0;
  let updated = 0;
  let billingCreated = 0;
  const laborMatched = new Set<string>();

  for (const row of products) {
    const existing = await prisma.product.findFirst({
      where: { officialName: row.name },
    });

    const productionType = resolveProductProductionType({ productName: row.name });
    const data = {
      officialName: row.name,
      displayName: row.name,
      productionType,
      forecastMethod: defaultForecastMethodForProductionType(productionType),
      unit: "袋",
      packSizeG: row.packSizeG,
      packCount: row.packCount ?? row.totalCount ?? null,
      casePackQty: row.packCount ?? row.totalCount ?? null,
      note: [
        row.rawMaterials.length > 0
          ? `原料: ${row.rawMaterials.map((r) => `${r.name}${r.unitPrice ? `(¥${r.unitPrice})` : ""}`).join(", ")}`
          : null,
        row.bagDesignName ? `袋: ${row.bagDesignName}${row.bagUnitPrice ? `(¥${row.bagUnitPrice})` : ""}` : null,
        row.cartonName ? `段ボール: ${row.cartonName}${row.cartonUnitPrice ? `(¥${row.cartonUnitPrice})` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" / ") || null,
      billingEnabled: true,
    };

    let productId: string;
    if (existing) {
      const after = await prisma.product.update({ where: { id: existing.id }, data });
      productId = after.id;
      updated++;
    } else {
      const code = `XLS-${String(nextSerial++).padStart(3, "0")}`;
      const after = await prisma.product.create({
        data: { ...data, productCode: code, active: true },
      });
      productId = after.id;
      created++;
    }

    // BillingPrice (手間賃)
    const labor = laborMap.get(row.name);
    if (labor != null) {
      laborMatched.add(row.name);
      const dup = await prisma.billingPrice.findFirst({
        where: { productId, effectiveFrom: EFFECTIVE_FROM },
      });
      if (!dup) {
        await prisma.billingPrice.create({
          data: {
            productId,
            unitPrice: labor,
            unit: "袋",
            effectiveFrom: EFFECTIVE_FROM,
            billingTarget: true,
          },
        });
        billingCreated++;
      }
    }
  }

  // 手間賃リストにあって、商品リストに無い名前 → 別名候補としてレポート
  const orphans = [...laborMap.keys()].filter((n) => !laborMatched.has(n));
  console.log(`\n=== 結果 ===`);
  console.log(`  商品 新規: ${created}, 更新: ${updated}`);
  console.log(`  手間賃 登録: ${billingCreated}`);
  console.log(`  手間賃のみ存在 (商品リスト未登録): ${orphans.length}`);
  if (orphans.length > 0) {
    console.log(`  例:`);
    for (const n of orphans.slice(0, 10)) console.log(`    - ${n} → ¥${laborMap.get(n)}`);
    if (orphans.length > 10) console.log(`    ... (+${orphans.length - 10}件)`);
  }
}

async function importProductsCsv(filePath: string) {
  console.log(`Reading CSV ${filePath}`);
  const { rows } = parseCsvWithHeader(readFileSync(filePath, "utf8"));
  const workAreas = await prisma.workArea.findMany();
  const groups = await prisma.productEquivalenceGroup.findMany({ where: { active: true } });
  const workAreaByName = new Map(workAreas.map((workArea) => [workArea.name, workArea.id]));
  const groupByName = new Map(groups.map((group) => [group.name, group.id]));
  let imported = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const productCode = csvValue(row.product_code);
    const officialName = csvValue(row.official_name);
    const forecastMethod = csvValue(row.forecast_method) ?? "MANUAL";
    const validFrom = csvDate(row.valid_from);
    const validTo = csvDate(row.valid_to);
    let equivalenceGroupId: string | null = null;
    const equivalenceGroupName = csvValue(row.equivalence_group_name);

    if (!productCode || !officialName) {
      errors.push(`${line}: product_code and official_name required`);
      continue;
    }
    if (!["MANUAL", "YEAR_RATIO", "SALES_INPUT", "NONE"].includes(forecastMethod)) {
      errors.push(`${line}: invalid forecast_method`);
      continue;
    }
    const explicitProductionType = csvValue(row.production_type);
    if (explicitProductionType && !["stock", "make_to_order", "both"].includes(explicitProductionType)) {
      errors.push(`${line}: invalid production_type`);
      continue;
    }
    if (validFrom === false || validTo === false || (validFrom && validTo && validFrom >= validTo)) {
      errors.push(`${line}: invalid validity period`);
      continue;
    }
    if (equivalenceGroupName) {
      equivalenceGroupId = groupByName.get(equivalenceGroupName) ?? null;
      if (!equivalenceGroupId) warnings.push(`${line}: equivalence_group_name not found: ${equivalenceGroupName}`);
    }

    const safetyStockQuantity = csvNonnegative(row.safety_stock_quantity);
    const standardProductionLotSize = csvNonnegative(row.standard_production_lot_size);
    const packSizeG = csvNullableNonnegative(row.pack_size_g);
    const packCount = csvNullableInt(row.pack_count);
    const casePackQty = csvNullableNonnegative(row.case_pack_qty);
    if (
      safetyStockQuantity === false ||
      standardProductionLotSize === false ||
      packSizeG === false ||
      packCount === false ||
      casePackQty === false
    ) {
      errors.push(`${line}: invalid numeric columns`);
      continue;
    }

    const aliases = (row.aliases ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    const productionType =
      explicitProductionType ??
      resolveProductProductionType({
        productCode,
        officialName,
        displayName: csvValue(row.display_name),
        aliases,
      });
    const data = {
      productCode,
      officialName,
      displayName: csvValue(row.display_name),
      productionType,
      forecastMethod,
      equivalenceGroupId,
      safetyStockQuantity: safetyStockQuantity ?? 0,
      standardProductionLotSize: standardProductionLotSize ?? 0,
      unit: csvValue(row.unit) ?? "袋",
      packSizeG,
      packCount,
      casePackQty: casePackQty ?? packCount,
      category: csvValue(row.category),
      defaultWorkAreaId: csvValue(row.default_work_area_name)
        ? workAreaByName.get(csvValue(row.default_work_area_name)!) ?? null
        : null,
      billingEnabled: csvBool(row.billing_enabled) ?? true,
      validFrom: validFrom || null,
      validTo: validTo || null,
      note: csvValue(row.note),
    };

    const existing = await prisma.product.findUnique({ where: { productCode } });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: existing.id }, data });
        await tx.productAlias.deleteMany({ where: { productId: existing.id } });
        if (aliases.length > 0) {
          await tx.productAlias.createMany({
            data: aliases.map((aliasName) => ({ productId: existing.id, aliasName })),
          });
        }
      });
    } else {
      await prisma.product.create({
        data: { ...data, aliases: { create: aliases.map((aliasName) => ({ aliasName })) } },
      });
    }
    imported++;
  }

  console.log(`  CSV imported: ${imported}, errors: ${errors.length}, warnings: ${warnings.length}`);
  for (const error of errors.slice(0, 20)) console.log(`  error ${error}`);
  for (const warning of warnings.slice(0, 20)) console.log(`  warning ${warning}`);
}

function csvValue(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function csvNonnegative(v: string | undefined): number | false | null {
  const s = csvValue(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : false;
}

function csvNullableNonnegative(v: string | undefined): number | false | null {
  if (v === undefined || v.trim() === "") return null;
  return csvNonnegative(v);
}

function csvNullableInt(v: string | undefined): number | false | null {
  const n = csvNullableNonnegative(v);
  if (n === false) return false;
  return typeof n === "number" ? Math.trunc(n) : null;
}

function csvBool(v: string | undefined): boolean | null {
  const s = csvValue(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function csvDate(v: string | undefined): Date | false | null {
  const s = csvValue(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : false;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
