/* eslint-disable no-console */
//
// Import "26年4月" sheet from 03_existing_raw_material_inventory.xlsx.
//
// Structure (vertical block per material):
//   Col A: 連番
//   Col B: 原料名 (e.g. "焼かまプレーンT 10kg")  -- block header
//   Col C: 仕入先
//   Col D: 行種別 ("使用量" | "入荷" | "残" | "賞味期限" | "出荷期限")
//   Col E ("前月繰越"): 期首値 (for the 残/在庫 row)
//   Col F-: 日別列
//
// 投入先:
//   materials             — material_code = XLR-001..  / name=B / supplier由来Cもsupplierへ
//   stock_movements       — movementType=opening, effectiveDate=2026-04-01,
//                            quantity = "残" 行の E (前月繰越) 値
//
// 再実行: name 完全一致でupsert、stock_movements は sourceType='import_opening_2026_04' で重複検知。

import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/03_existing_raw_material_inventory.xlsx",
);
const OPENING_DATE = new Date("2026-04-01");
const OPENING_SOURCE = "import_raw_material_opening_2026_04";
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

const prisma = new PrismaClient();

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

type Block = {
  serial: number;
  name: string;
  supplier: string | null;
  openingResidual: number | null;
};

function parseBlocks(sheet: XLSX.WorkSheet): Block[] {
  const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (let i = 1; i < arr.length; i++) {
    const r = arr[i] as unknown[];
    const a = num(r[0]);
    const name = str(r[1]);
    const supplier = str(r[2]);
    const kind = str(r[3]);
    const openingCell = num(r[4]);

    if (a != null && name) {
      // start of a new material block
      current = { serial: a, name, supplier, openingResidual: null };
      blocks.push(current);
      if (kind === "残" || kind === "在庫") {
        current.openingResidual = openingCell;
      }
      continue;
    }
    if (current && (kind === "残" || kind === "在庫")) {
      // residual row inside current block
      current.openingResidual = openingCell;
    }
  }
  return blocks;
}

async function main() {
  if (cliPath && /\.csv$/i.test(cliPath)) {
    await importMaterialsCsv(path.resolve(process.cwd(), cliPath));
    return;
  }

  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets["26年4月"];
  if (!ws) throw new Error("26年4月 sheet not found");
  const blocks = parseBlocks(ws);
  console.log(`  parsed ${blocks.length} materials`);

  // existing serial maps for re-runs
  const existingMax = await prisma.material.findFirst({
    where: { materialCode: { startsWith: "XLR-" } },
    orderBy: { materialCode: "desc" },
    select: { materialCode: true },
  });
  let nextSerial = existingMax ? Number(existingMax.materialCode.replace("XLR-", "")) + 1 : 1;

  // supplier map (upsert by name)
  const supplierCache = new Map<string, string>();
  async function getSupplierId(name: string | null): Promise<string | null> {
    if (!name) return null;
    if (supplierCache.has(name)) return supplierCache.get(name)!;
    const found = await prisma.supplier.findFirst({ where: { name } });
    const row = found ?? (await prisma.supplier.create({ data: { name } }));
    supplierCache.set(name, row.id);
    return row.id;
  }

  let createdMat = 0;
  let updatedMat = 0;
  let openingCreated = 0;
  let openingSkipped = 0;

  for (const b of blocks) {
    const supplierId = await getSupplierId(b.supplier);
    const existing = await prisma.material.findFirst({ where: { name: b.name } });

    const data = { name: b.name, supplierId, unit: "kg" };
    let materialId: string;
    if (existing) {
      const u = await prisma.material.update({ where: { id: existing.id }, data });
      materialId = u.id;
      updatedMat++;
    } else {
      const code = `XLR-${String(nextSerial++).padStart(3, "0")}`;
      const u = await prisma.material.create({ data: { ...data, materialCode: code, active: true } });
      materialId = u.id;
      createdMat++;
    }

    if (b.openingResidual != null && b.openingResidual !== 0) {
      const dup = await prisma.stockMovement.findFirst({
        where: { itemId: materialId, sourceType: OPENING_SOURCE },
      });
      if (dup) {
        openingSkipped++;
      } else {
        await prisma.stockMovement.create({
          data: {
            itemType: "raw_material",
            itemId: materialId,
            movementType: "opening",
            quantity: b.openingResidual,
            effectiveDate: OPENING_DATE,
            sourceType: OPENING_SOURCE,
            note: "Excel期首残 (前月繰越)",
          },
        });
        openingCreated++;
      }
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`  原料 新規: ${createdMat}, 更新: ${updatedMat}`);
  console.log(`  期首残 投入: ${openingCreated}, 既存スキップ: ${openingSkipped}`);
  console.log(`  仕入先 累積: ${supplierCache.size}`);
}

async function importMaterialsCsv(filePath: string) {
  console.log(`Reading CSV ${filePath}`);
  const { rows } = parseCsvWithHeader(readFileSync(filePath, "utf8"));
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const materialCode = csvValue(row.material_code);
    const name = csvValue(row.name);
    const safetyStockQuantity = csvNonnegative(row.safety_stock_quantity);
    const orderLotQty = csvNullableNonnegative(row.order_lot_qty);
    const minOrderQty = csvNullableNonnegative(row.min_order_qty);
    const validFrom = csvDate(row.valid_from);
    const validTo = csvDate(row.valid_to);

    if (!materialCode || !name) {
      errors.push(`${line}: material_code and name required`);
      continue;
    }
    if (
      safetyStockQuantity === false ||
      orderLotQty === false ||
      minOrderQty === false ||
      validFrom === false ||
      validTo === false ||
      (validFrom && validTo && validFrom >= validTo)
    ) {
      errors.push(`${line}: invalid extension columns`);
      continue;
    }

    const data = {
      materialCode,
      name,
      unit: csvValue(row.unit) ?? "kg",
      standardUnitPrice: csvNonnegative(row.standard_unit_price) || 0,
      leadTimeDays: Math.trunc(csvNonnegative(row.lead_time_days) || 0),
      shelfLifeManaged: csvBool(row.shelf_life_managed) ?? false,
      safetyStockQuantity: safetyStockQuantity || 0,
      orderLotQty,
      minOrderQty,
      validFrom,
      validTo,
      note: csvValue(row.note),
    };
    await prisma.material.upsert({
      where: { materialCode },
      update: data,
      create: data,
    });
    imported++;
  }

  console.log(`  CSV imported: ${imported}, errors: ${errors.length}`);
  for (const error of errors.slice(0, 20)) console.log(`  error ${error}`);
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
