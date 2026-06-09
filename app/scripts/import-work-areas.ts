/* eslint-disable no-console */
//
// CSV import for work areas.
//
// Columns:
//   name,area_type,default_start_time,default_end_time,max_people_count,
//   display_order,external_flag,note,equipment_kind,
//   concurrent_operation_allowed,valid_from,valid_to
//
// 実行:
//   npm run import:work-areas -- ./work-areas.csv

import path from "node:path";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";

const prisma = new PrismaClient();
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

async function main() {
  if (!cliPath) throw new Error("CSV path required");
  const filePath = path.resolve(process.cwd(), cliPath);
  const { rows } = parseCsvWithHeader(readFileSync(filePath, "utf8"));
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const name = value(row.name);
    const areaType = value(row.area_type) ?? "internal";
    const equipmentKind = value(row.equipment_kind) ?? "ROOM";
    const concurrentOperationAllowed = parseBool(row.concurrent_operation_allowed) ?? true;
    const validFrom = parseDate(row.valid_from);
    const validTo = parseDate(row.valid_to);

    if (!name) {
      errors.push(`${line}: name required`);
      continue;
    }
    if (!["internal", "external", "warehouse"].includes(areaType)) {
      errors.push(`${line}: invalid area_type`);
      continue;
    }
    if (!["ROOM", "LINE", "MACHINE", "OTHER"].includes(equipmentKind)) {
      errors.push(`${line}: invalid equipment_kind`);
      continue;
    }
    if (validFrom === false || validTo === false || (validFrom && validTo && validFrom >= validTo)) {
      errors.push(`${line}: invalid validity period`);
      continue;
    }

    const data = {
      name,
      areaType,
      defaultStartTime: value(row.default_start_time),
      defaultEndTime: value(row.default_end_time),
      maxPeopleCount: positiveInt(row.max_people_count) ?? 4,
      displayOrder: integer(row.display_order) ?? 0,
      externalFlag: parseBool(row.external_flag) ?? areaType === "external",
      note: value(row.note),
      equipmentKind,
      concurrentOperationAllowed,
      validFrom: validFrom || null,
      validTo: validTo || null,
      active: true,
    };

    const existing = await prisma.workArea.findUnique({ where: { name } });
    if (existing) await prisma.workArea.update({ where: { id: existing.id }, data });
    else await prisma.workArea.create({ data });
    imported++;
  }

  console.log(`CSV imported: ${imported}, errors: ${errors.length}`);
  for (const error of errors.slice(0, 20)) console.log(`  error ${error}`);
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function integer(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function positiveInt(v: string | undefined): number | null {
  const n = integer(v);
  return n != null && n > 0 ? n : null;
}

function parseBool(v: string | undefined): boolean | null {
  const s = value(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function parseDate(v: string | undefined): Date | false | null {
  const s = value(v);
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
