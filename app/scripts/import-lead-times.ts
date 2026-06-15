/* eslint-disable no-console */
//
// Import raw material lead times from docs/入荷予定一覧.xlsx.
//
// Default mode is a dry run. Add --apply to update Material.leadTimeDays.
// Matching is intentionally conservative:
//   1. materialCode equals 商品コード
//   2. normalized name + supplier name
//   3. normalized name
//
// Location notes such as "北名古屋" are skipped, not converted to 0 days.

import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { normalizeInventoryName, parseLeadTimeDays } from "../src/lib/lead-time";

const DEFAULT_XLSX_PATH = path.resolve(__dirname, "../../docs/入荷予定一覧.xlsx");
const DEFAULT_SHEET_NAME = "原料";
const prisma = new PrismaClient();

type ItemType = "raw_material" | "packaging";

type SourceRow = {
  sourceRowNumber: number;
  supplierName: string | null;
  sourceItemCode: string | null;
  itemName: string;
  rawLeadTime: string;
  leadTimeDays: number;
};

type DbItem = {
  itemType: ItemType;
  id: string;
  materialCode: string;
  name: string;
  supplierName: string | null;
  leadTimeDays: number;
};

type MatchResult = {
  source: SourceRow;
  item?: DbItem;
  matchMethod?: "material_code" | "name_supplier" | "name";
  status: "matched" | "unmatched" | "ambiguous";
  candidates?: DbItem[];
};

function optionValue(name: string): string | null {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function cellText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).normalize("NFKC").replace(/[　\s]+/g, " ").trim();
  return text === "" ? null : text;
}

function readLeadTimeRows(filePath: string, sheetName: string): {
  rows: SourceRow[];
  sourceRowCount: number;
  skippedNoLeadTime: number;
  sourceConflicts: { first: SourceRow; second: SourceRow }[];
} {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}. Available: ${wb.SheetNames.join(", ")}`);

  const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  const rows: SourceRow[] = [];
  const dedupe = new Map<string, SourceRow>();
  const sourceConflicts: { first: SourceRow; second: SourceRow }[] = [];
  let sourceRowCount = 0;
  let skippedNoLeadTime = 0;

  for (let i = 1; i < arr.length; i++) {
    const row = arr[i] ?? [];
    const itemName = cellText(row[2]);
    if (!itemName) continue;
    sourceRowCount++;

    const rawLeadTime = cellText(row[4]) ?? "";
    const leadTimeDays = parseLeadTimeDays(rawLeadTime);
    if (leadTimeDays == null) {
      skippedNoLeadTime++;
      continue;
    }

    const parsed: SourceRow = {
      sourceRowNumber: i + 1,
      supplierName: cellText(row[0]),
      sourceItemCode: cellText(row[1]),
      itemName,
      rawLeadTime,
      leadTimeDays,
    };
    const key = `${normalizeInventoryName(parsed.supplierName)}::${normalizeInventoryName(parsed.itemName)}`;
    const existing = dedupe.get(key);
    if (!existing) {
      dedupe.set(key, parsed);
      rows.push(parsed);
      continue;
    }
    if (existing.leadTimeDays !== parsed.leadTimeDays) {
      sourceConflicts.push({ first: existing, second: parsed });
    }
  }

  return { rows, sourceRowCount, skippedNoLeadTime, sourceConflicts };
}

async function loadDbItems(includePackaging: boolean): Promise<DbItem[]> {
  const materials = await prisma.material.findMany({
    include: { supplier: true },
    orderBy: { materialCode: "asc" },
  });
  const items: DbItem[] = materials.map((m) => ({
    itemType: "raw_material",
    id: m.id,
    materialCode: m.materialCode,
    name: m.name,
    supplierName: m.supplier?.name ?? null,
    leadTimeDays: m.leadTimeDays,
  }));

  if (!includePackaging) return items;

  const packaging = await prisma.packagingMaterial.findMany({
    include: { supplier: true },
    orderBy: { materialCode: "asc" },
  });
  items.push(
    ...packaging.map((m) => ({
      itemType: "packaging" as const,
      id: m.id,
      materialCode: m.materialCode,
      name: m.name,
      supplierName: m.supplier?.name ?? null,
      leadTimeDays: m.leadTimeDays,
    })),
  );
  return items;
}

function buildIndex(items: DbItem[]) {
  const byCode = new Map<string, DbItem[]>();
  const byNameSupplier = new Map<string, DbItem[]>();
  const byName = new Map<string, DbItem[]>();

  for (const item of items) {
    push(byCode, item.materialCode, item);
    push(byName, normalizeInventoryName(item.name), item);
    push(
      byNameSupplier,
      `${normalizeInventoryName(item.supplierName)}::${normalizeInventoryName(item.name)}`,
      item,
    );
  }

  return { byCode, byNameSupplier, byName };
}

function push(map: Map<string, DbItem[]>, key: string | null, item: DbItem) {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(item);
  map.set(key, list);
}

function uniqueItems(items: DbItem[]): DbItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function resolveMatches(sourceRows: SourceRow[], dbItems: DbItem[]): MatchResult[] {
  const index = buildIndex(dbItems);
  return sourceRows.map((source) => {
    const codeMatches = source.sourceItemCode ? uniqueItems(index.byCode.get(source.sourceItemCode) ?? []) : [];
    if (codeMatches.length === 1) {
      return { source, item: codeMatches[0], matchMethod: "material_code", status: "matched" };
    }
    if (codeMatches.length > 1) {
      return { source, status: "ambiguous", candidates: codeMatches };
    }

    const nameSupplierKey = `${normalizeInventoryName(source.supplierName)}::${normalizeInventoryName(source.itemName)}`;
    const nameSupplierMatches = uniqueItems(index.byNameSupplier.get(nameSupplierKey) ?? []);
    if (nameSupplierMatches.length === 1) {
      return { source, item: nameSupplierMatches[0], matchMethod: "name_supplier", status: "matched" };
    }
    if (nameSupplierMatches.length > 1) {
      return { source, status: "ambiguous", candidates: nameSupplierMatches };
    }

    const nameMatches = uniqueItems(index.byName.get(normalizeInventoryName(source.itemName)) ?? []);
    if (nameMatches.length === 1) {
      return { source, item: nameMatches[0], matchMethod: "name", status: "matched" };
    }
    if (nameMatches.length > 1) {
      return { source, status: "ambiguous", candidates: nameMatches };
    }
    return { source, status: "unmatched" };
  });
}

async function updateLeadTime(item: DbItem, leadTimeDays: number) {
  if (item.itemType === "raw_material") {
    return prisma.material.update({ where: { id: item.id }, data: { leadTimeDays } });
  }
  return prisma.packagingMaterial.update({ where: { id: item.id }, data: { leadTimeDays } });
}

async function main() {
  const apply = hasFlag("--apply");
  const includePackaging = hasFlag("--include-packaging");
  const filePath = path.resolve(process.cwd(), optionValue("--file") ?? DEFAULT_XLSX_PATH);
  const sheetName = optionValue("--sheet") ?? DEFAULT_SHEET_NAME;
  const sampleLimit = Number(optionValue("--sample") ?? "20");

  console.log(`Reading ${filePath}`);
  const { rows, sourceRowCount, skippedNoLeadTime, sourceConflicts } = readLeadTimeRows(filePath, sheetName);
  const dbItems = await loadDbItems(includePackaging);
  const matches = resolveMatches(rows, dbItems);

  const matched = matches.filter((row) => row.status === "matched" && row.item);
  const toUpdate = matched.filter((row) => row.item!.leadTimeDays !== row.source.leadTimeDays);
  const unchanged = matched.filter((row) => row.item!.leadTimeDays === row.source.leadTimeDays);
  const unmatched = matches.filter((row) => row.status === "unmatched");
  const ambiguous = matches.filter((row) => row.status === "ambiguous");

  let updated = 0;
  if (apply) {
    for (const row of toUpdate) {
      await updateLeadTime(row.item!, row.source.leadTimeDays);
      updated++;
    }
    await prisma.auditLog.create({
      data: {
        action: includePackaging ? "import_material_packaging_lead_times" : "import_material_lead_times",
        entityType: includePackaging ? "Material/PackagingMaterial" : "Material",
        afterJson: JSON.stringify({
          sourceFile: filePath,
          sheetName,
          sourceRows: sourceRowCount,
          parsedLeadTimeRows: rows.length,
          updated,
          unchanged: unchanged.length,
          unmatched: unmatched.length,
          ambiguous: ambiguous.length,
          sourceConflicts: sourceConflicts.length,
        }),
      },
    });
  }

  console.log(`\n=== ${apply ? "適用結果" : "ドライラン結果"} ===`);
  console.log(`  DB対象: ${includePackaging ? "原料 + 資材" : "原料のみ"} (${dbItems.length}件)`);
  console.log(`  Excel品目行: ${sourceRowCount}`);
  console.log(`  日数として読めた行: ${rows.length}`);
  console.log(`  日数でないメモとしてスキップ: ${skippedNoLeadTime}`);
  console.log(`  照合成功: ${matched.length}`);
  console.log(`  ${apply ? "更新" : "更新予定"}: ${apply ? updated : toUpdate.length}`);
  console.log(`  変更なし: ${unchanged.length}`);
  console.log(`  未照合: ${unmatched.length}`);
  console.log(`  曖昧一致: ${ambiguous.length}`);
  console.log(`  Excel内リードタイム矛盾: ${sourceConflicts.length}`);

  printSamples("更新対象", toUpdate, sampleLimit, (row) => {
    const item = row.item!;
    return `${row.source.sourceRowNumber}: ${item.materialCode} ${item.name} ${item.leadTimeDays}日 -> ${row.source.leadTimeDays}日 (${row.matchMethod})`;
  });
  printSamples("未照合", unmatched, sampleLimit, (row) => {
    return `${row.source.sourceRowNumber}: ${row.source.itemName} / ${row.source.rawLeadTime}`;
  });
  printSamples("曖昧一致", ambiguous, sampleLimit, (row) => {
    const candidates = row.candidates?.map((item) => `${item.materialCode}:${item.name}`).join(" | ");
    return `${row.source.sourceRowNumber}: ${row.source.itemName} => ${candidates}`;
  });
  printSamples("Excel内リードタイム矛盾", sourceConflicts, sampleLimit, (row) => {
    return `${row.first.sourceRowNumber}/${row.second.sourceRowNumber}: ${row.first.itemName} ${row.first.leadTimeDays}日 vs ${row.second.leadTimeDays}日`;
  });

  if (!apply) {
    console.log("\nDBは変更していません。反映する場合は同じコマンドに --apply を付けて実行してください。");
  }
}

function printSamples<T>(label: string, rows: T[], limit: number, format: (row: T) => string) {
  if (rows.length === 0 || limit <= 0) return;
  console.log(`\n--- ${label} 例 (${Math.min(rows.length, limit)}/${rows.length}) ---`);
  for (const row of rows.slice(0, limit)) console.log(`  ${format(row)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
