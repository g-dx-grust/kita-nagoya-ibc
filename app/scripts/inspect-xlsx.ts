/* eslint-disable no-console */
// Inspect any source Excel by command-line file path, listing sheets + first N rows.
//
//   npx tsx scripts/inspect-xlsx.ts <relative-to-source_files>
//   npx tsx scripts/inspect-xlsx.ts 05_…labor.xlsx          # original positional
//   npx tsx scripts/inspect-xlsx.ts --all                   # all four files

import path from "node:path";
import fs from "node:fs";
import * as XLSX from "xlsx";

const ROOT = path.resolve(__dirname, "../../source_files/renamed_reference_copies");

const FILES = [
  "02_existing_attendance_shift_table.xlsx",
  "03_existing_raw_material_inventory.xlsx",
  "04_existing_packaging_material_inventory.xlsx",
  "05_existing_production_daily_report_product_master_labor.xlsx",
];

function previewSheet(wb: XLSX.WorkBook, name: string, rows = 6, cols = 14) {
  const ws = wb.Sheets[name];
  if (!ws) return;
  console.log(`\n  ## ${name}`);
  console.log(`    range: ${ws["!ref"]}`);
  const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  for (let i = 0; i < Math.min(rows, arr.length); i++) {
    const row = (arr[i] as unknown[]).slice(0, cols);
    console.log(`    [${i}]`, JSON.stringify(row));
  }
}

function inspect(file: string) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.log(`# ${file} -- not found`);
    return;
  }
  console.log(`\n========================= ${file}`);
  const wb = XLSX.readFile(full);
  console.log("Sheets:", wb.SheetNames);
  for (const s of wb.SheetNames.slice(0, 6)) previewSheet(wb, s);
}

const arg = process.argv[2];
if (!arg || arg === "--all") {
  for (const f of FILES) inspect(f);
} else {
  inspect(arg);
}
