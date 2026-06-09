/* eslint-disable no-console */
//
// Import 04_existing_packaging_material_inventory.xlsx
//   Sheet "26年4月 資材①": 乾燥剤等。col A=連番,B=資材名,C=仕入先,D=行種別("使用量"/"入荷"/"在庫"),E=前月繰越
//   Sheet "26年4月 資材 ②": 袋。col A=連番,B=資材名,C=仕入先 (在庫構造は省略あり)
//
// 投入先:
//   packagingMaterials  - material_code = XLP-001..  / name=B / kind推定
//   stock_movements     - movement_type=opening (在庫行があれば)
//
// 再実行は name 一致で upsert、stock_movements は sourceType で重複検知。

import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/04_existing_packaging_material_inventory.xlsx",
);
const OPENING_DATE = new Date("2026-04-01");
const OPENING_SOURCE = "import_packaging_opening_2026_04";
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
  // 全角スペースのみの場合を吸収
  const trimmed = s.replace(/[\s　]+/g, " ").trim();
  if (trimmed === "" || trimmed === "－" || trimmed === "-" || trimmed === "null") return null;
  return trimmed;
}

function guessKind(name: string): string | null {
  if (/^乾燥剤/.test(name)) return "desiccant";
  if (/^袋/.test(name)) return "bag";
  if (/段ボール|カートン/.test(name)) return "carton";
  if (/トレー/.test(name)) return "tray";
  return null;
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
      current = { serial: a, name, supplier, openingResidual: null };
      blocks.push(current);
      if (kind === "残" || kind === "在庫") current.openingResidual = openingCell;
      continue;
    }
    if (current && (kind === "残" || kind === "在庫")) {
      current.openingResidual = openingCell;
    }
  }
  return blocks;
}

async function main() {
  if (cliPath && /\.csv$/i.test(cliPath)) {
    await importPackagingCsv(path.resolve(process.cwd(), cliPath));
    return;
  }

  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  const all: Block[] = [];
  for (const name of wb.SheetNames) all.push(...parseBlocks(wb.Sheets[name]));
  console.log(`  parsed ${all.length} packaging items across ${wb.SheetNames.length} sheets`);

  const existingMax = await prisma.packagingMaterial.findFirst({
    where: { materialCode: { startsWith: "XLP-" } },
    orderBy: { materialCode: "desc" },
    select: { materialCode: true },
  });
  let nextSerial = existingMax ? Number(existingMax.materialCode.replace("XLP-", "")) + 1 : 1;

  const supplierCache = new Map<string, string>();
  async function getSupplierId(name: string | null): Promise<string | null> {
    if (!name) return null;
    if (supplierCache.has(name)) return supplierCache.get(name)!;
    const found = await prisma.supplier.findFirst({ where: { name } });
    const row = found ?? (await prisma.supplier.create({ data: { name } }));
    supplierCache.set(name, row.id);
    return row.id;
  }

  let created = 0;
  let updated = 0;
  let openingCreated = 0;
  let openingSkipped = 0;

  for (const b of all) {
    const supplierId = await getSupplierId(b.supplier);
    const existing = await prisma.packagingMaterial.findFirst({ where: { name: b.name } });
    const data = {
      name: b.name,
      supplierId,
      unit: /袋|個|枚/.test(b.name) ? "枚" : "個",
      kind: guessKind(b.name),
    };
    let pid: string;
    if (existing) {
      pid = (await prisma.packagingMaterial.update({ where: { id: existing.id }, data })).id;
      updated++;
    } else {
      const code = `XLP-${String(nextSerial++).padStart(3, "0")}`;
      pid = (await prisma.packagingMaterial.create({ data: { ...data, materialCode: code, active: true } })).id;
      created++;
    }

    if (b.openingResidual != null && b.openingResidual !== 0) {
      const dup = await prisma.stockMovement.findFirst({
        where: { itemId: pid, sourceType: OPENING_SOURCE },
      });
      if (dup) {
        openingSkipped++;
      } else {
        await prisma.stockMovement.create({
          data: {
            itemType: "packaging",
            itemId: pid,
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
  console.log(`  資材 新規: ${created}, 更新: ${updated}`);
  console.log(`  期首残 投入: ${openingCreated}, 既存スキップ: ${openingSkipped}`);
}

async function importPackagingCsv(filePath: string) {
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
      kind: csvValue(row.kind),
      unit: csvValue(row.unit) ?? "枚",
      standardUnitPrice: csvNonnegative(row.standard_unit_price) || 0,
      leadTimeDays: Math.trunc(csvNonnegative(row.lead_time_days) || 0),
      safetyStockQuantity: safetyStockQuantity || 0,
      orderLotQty,
      minOrderQty,
      validFrom,
      validTo,
      note: csvValue(row.note),
    };
    await prisma.packagingMaterial.upsert({
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
