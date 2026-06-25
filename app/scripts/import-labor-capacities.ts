/* eslint-disable no-console */
//
// Import the latest "1袋の手間賃" sheet and derive production capacity.
//
// Formula confirmed by the current handoff:
//   1時間1人あたり生産量 = 1500円 / 1袋の手間賃
//
// Source by default:
//   docs/手間賃集計 最新.xlsx
//
// The script also stores the current labor unit price as BillingPrice so
// plan estimates and invoice exports use the same source data.
//
// 実行:
//   npm run import:labor-capacities
//   npm run import:labor-capacities -- --dry-run
//   npm run import:labor-capacities -- --create-missing

import path from "node:path";
import * as XLSX from "xlsx";
import {
  PrismaClient,
  type Product,
  type ProductAlias,
  type ProductionCapacity,
  type ProductionPlan,
  type WorkArea,
} from "@prisma/client";
import {
  DEFAULT_HOURLY_LABOR_RATE,
  computeProductionDuration,
  computeUnitsPerPersonHourFromLaborUnitPrice,
} from "../src/lib/calculations";
import {
  defaultForecastMethodForProductionType,
  resolveProductProductionType,
} from "../src/lib/product-production-type";

const DEFAULT_XLSX_PATH = path.resolve(__dirname, "../../docs/手間賃集計 最新.xlsx");
const EFFECTIVE_FROM = new Date(process.env.LABOR_CAPACITY_EFFECTIVE_FROM ?? "2026-03-01");
const LABOR_IMPORT_NOTE = "手間賃最新集計から反映";
const CAPACITY_IMPORT_NOTE = "手間賃最新集計から算出";

const prisma = new PrismaClient();

type LaborEntry = {
  name: string;
  laborUnitPrice: number;
};

type ProductWithAliases = Product & { aliases: ProductAlias[] };

type ResolveResult =
  | { product: ProductWithAliases; matchType: "exact" | "normalized" }
  | { product: null; matchType: "missing" };

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || process.env.DRY_RUN === "1";
const createMissing =
  args.has("--create-missing") || process.env.LABOR_CAPACITY_CREATE_MISSING === "1";
const recalculatePlans =
  !args.has("--no-recalculate-plans") && process.env.LABOR_CAPACITY_RECALCULATE_PLANS !== "0";
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const xlsxPath = cliPath ? path.resolve(process.cwd(), cliPath) : DEFAULT_XLSX_PATH;

async function main() {
  console.log(`Reading ${xlsxPath}`);
  console.log(
    `  formula: ${DEFAULT_HOURLY_LABOR_RATE}円 / 1袋手間賃 = 1時間1人あたり生産量`,
  );
  if (dryRun) console.log("  dry-run: DBは更新しません");

  const entries = readLaborEntries(xlsxPath);
  console.log(`  手間賃行: ${entries.length}`);

  const internalWorkAreas = await prisma.workArea.findMany({
    where: { active: true, areaType: "internal", externalFlag: false },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  if (internalWorkAreas.length === 0) {
    throw new Error("active internal work area not found");
  }

  const products = await prisma.product.findMany({ where: { active: true }, include: { aliases: true } });
  const index = buildProductIndex(products);
  let nextLaborProductSerial = await nextProductSerial("LAB-");

  const stats = {
    exactMatched: 0,
    normalizedMatched: 0,
    missing: 0,
    productsCreated: 0,
    aliasesCreated: 0,
    billingCreated: 0,
    billingUpdated: 0,
    capacityCreated: 0,
    capacityUpdated: 0,
    plansUpdated: 0,
    plansSkippedNoCapacity: 0,
  };
  const affectedProductIds = new Set<string>();
  const unmatchedNames: string[] = [];
  const largestChanges: {
    name: string;
    oldValue: number | null;
    newValue: number;
    laborUnitPrice: number;
    workAreaName: string;
  }[] = [];

  for (const entry of entries) {
    const unitsPerPersonHour = computeUnitsPerPersonHourFromLaborUnitPrice({
      laborUnitPrice: entry.laborUnitPrice,
    });
    let resolved = resolveProduct(index, entry.name);
    let productCreatedFromLaborSheet = false;

    if (!resolved.product && createMissing) {
      const code = `LAB-${String(nextLaborProductSerial++).padStart(3, "0")}`;
      const created = await createProductFromLaborEntry({
        code,
        entry,
        workAreaId: choosePrimaryWorkAreaId(null, internalWorkAreas),
      });
      resolved = { product: { ...created, aliases: [] }, matchType: "exact" };
      rememberProduct(index, resolved.product);
      stats.productsCreated++;
      productCreatedFromLaborSheet = true;
    }

    if (!resolved.product) {
      stats.missing++;
      unmatchedNames.push(entry.name);
      continue;
    }

    if (!productCreatedFromLaborSheet && resolved.matchType === "exact") stats.exactMatched++;
    if (!productCreatedFromLaborSheet && resolved.matchType === "normalized") {
      stats.normalizedMatched++;
      const created = await ensureAlias(resolved.product.id, entry.name, resolved.product.aliases);
      if (created) stats.aliasesCreated++;
    }

    const billingAction = await upsertBillingPrice(resolved.product.id, entry);
    if (billingAction === "created") stats.billingCreated++;
    if (billingAction === "updated") stats.billingUpdated++;

    const changes = await upsertCapacities({
      product: resolved.product,
      internalWorkAreas,
      entry,
      unitsPerPersonHour,
    });
    for (const change of changes) {
      if (change.action === "created") stats.capacityCreated++;
      if (change.action === "updated") stats.capacityUpdated++;
      largestChanges.push({
        name: entry.name,
        oldValue: change.oldValue,
        newValue: unitsPerPersonHour,
        laborUnitPrice: entry.laborUnitPrice,
        workAreaName: change.workAreaName,
      });
    }
    affectedProductIds.add(resolved.product.id);
  }

  if (recalculatePlans && affectedProductIds.size > 0) {
    const planStats = await recalculateOpenProductionPlans(affectedProductIds);
    stats.plansUpdated = planStats.updated;
    stats.plansSkippedNoCapacity = planStats.skippedNoCapacity;
  }

  largestChanges.sort((a, b) => Math.abs((b.oldValue ?? 0) - b.newValue) - Math.abs((a.oldValue ?? 0) - a.newValue));

  console.log("\n=== 結果 ===");
  console.log(`  商品マッチ: ${stats.exactMatched} (完全一致) + ${stats.normalizedMatched} (表記揺れ)`);
  console.log(`  商品新規: ${stats.productsCreated}`);
  console.log(`  別名追加: ${stats.aliasesCreated}`);
  console.log(`  手間賃単価: 新規 ${stats.billingCreated}, 更新 ${stats.billingUpdated}`);
  console.log(`  生産能力: 新規 ${stats.capacityCreated}, 更新 ${stats.capacityUpdated}`);
  console.log(`  生産予定再計算: 更新 ${stats.plansUpdated}, 能力未登録スキップ ${stats.plansSkippedNoCapacity}`);
  console.log(`  未マッチ: ${stats.missing}`);
  if (unmatchedNames.length > 0) {
    console.log("  未マッチ例:");
    for (const name of unmatchedNames.slice(0, 10)) console.log(`    - ${name}`);
    if (unmatchedNames.length > 10) console.log(`    ... (+${unmatchedNames.length - 10}件)`);
  }

  console.log("\n=== 生産能力の変更が大きい例 ===");
  for (const change of largestChanges.slice(0, 12)) {
    const oldLabel = change.oldValue == null ? "未登録" : formatNumber(change.oldValue);
    console.log(
      `  ${change.name} / ${change.workAreaName}: ${oldLabel} -> ${formatNumber(
        change.newValue,
      )} 袋/人時 (手間賃 ${formatNumber(change.laborUnitPrice)}円)`,
    );
  }
}

function readLaborEntries(filePath: string): LaborEntry[] {
  const wb = XLSX.readFile(filePath);
  const byName = new Map<string, LaborEntry>();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const header = findLaborHeader(rows);
    if (!header) continue;

    for (let r = header.rowIndex + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      for (const pair of header.pairs) {
        const name = str(row[pair.nameCol]);
        const laborUnitPrice = num(row[pair.priceCol]);
        if (!name || laborUnitPrice == null || byName.has(name)) continue;
        byName.set(name, {
          name,
          laborUnitPrice,
        });
      }
    }
  }

  return [...byName.values()];
}

function findLaborHeader(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const pairs: { nameCol: number; priceCol: number }[] = [];
    for (let c = 0; c < row.length - 1; c++) {
      const current = normalizeHeader(row[c]);
      const next = normalizeHeader(row[c + 1]);
      if (current === "商品名" && next.includes("手間賃")) {
        pairs.push({ nameCol: c, priceCol: c + 1 });
      }
    }
    if (pairs.length > 0) return { rowIndex, pairs };
  }
  return null;
}

function buildProductIndex(products: ProductWithAliases[]) {
  const byExact = new Map<string, ProductWithAliases>();
  const byNormalized = new Map<string, ProductWithAliases>();
  for (const product of products) rememberProduct({ byExact, byNormalized }, product);
  return { byExact, byNormalized };
}

function rememberProduct(
  index: {
    byExact: Map<string, ProductWithAliases>;
    byNormalized: Map<string, ProductWithAliases>;
  },
  product: ProductWithAliases,
) {
  index.byExact.set(product.officialName, product);
  const normalizedOfficial = normalizeProductName(product.officialName);
  if (!index.byNormalized.has(normalizedOfficial)) {
    index.byNormalized.set(normalizedOfficial, product);
  }
  for (const alias of product.aliases) {
    const normalizedAlias = normalizeProductName(alias.aliasName);
    if (!index.byNormalized.has(normalizedAlias)) {
      index.byNormalized.set(normalizedAlias, product);
    }
  }
}

function resolveProduct(
  index: {
    byExact: Map<string, ProductWithAliases>;
    byNormalized: Map<string, ProductWithAliases>;
  },
  name: string,
): ResolveResult {
  const exact = index.byExact.get(name);
  if (exact) return { product: exact, matchType: "exact" };
  const normalized = index.byNormalized.get(normalizeProductName(name));
  if (normalized) return { product: normalized, matchType: "normalized" };
  return { product: null, matchType: "missing" };
}

async function nextProductSerial(prefix: string) {
  const existingMax = await prisma.product.findFirst({
    where: { productCode: { startsWith: prefix } },
    orderBy: { productCode: "desc" },
    select: { productCode: true },
  });
  if (!existingMax) return 1;
  const n = Number(existingMax.productCode.replace(prefix, ""));
  return Number.isFinite(n) ? n + 1 : 1;
}

async function createProductFromLaborEntry(input: {
  code: string;
  entry: LaborEntry;
  workAreaId: string;
}): Promise<Product> {
  const productionType = resolveProductProductionType({ productName: input.entry.name });
  const data = {
    productCode: input.code,
    officialName: input.entry.name,
    displayName: input.entry.name,
    productionType,
    forecastMethod: defaultForecastMethodForProductionType(productionType),
    unit: "袋",
    defaultWorkAreaId: input.workAreaId,
    billingEnabled: true,
    active: true,
    note: "手間賃最新集計から追加。BOM未登録。",
  };
  if (dryRun) {
    return {
      id: `dry-${input.code}`,
      ...data,
      usedAtKitagoya: false,
      safetyStockQuantity: 0,
      standardProductionLotSize: 0,
      rawMaterialLossToleranceRate: 0.05,
      schedulePriority: null,
      packSizeG: null,
      packCount: null,
      casePackQty: null,
      category: null,
      sourceSystem: null,
      sourceProductKey: null,
      sourceSheetName: null,
      sourceRowNumber: null,
      specification: null,
      packCountExpression: null,
      bundleCount: null,
      brandName: null,
      bagTrayName: null,
      cartonName: null,
      accessoryName: null,
      sealCount: null,
      classificationNote: null,
      rawMaterialNote: null,
      equivalenceGroupId: null,
      validFrom: null,
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  return prisma.product.create({ data });
}

async function ensureAlias(productId: string, aliasName: string, aliases: ProductAlias[]) {
  if (aliases.some((alias) => alias.aliasName === aliasName)) return false;
  if (dryRun) return true;
  await prisma.productAlias.create({ data: { productId, aliasName } });
  return true;
}

async function upsertBillingPrice(productId: string, entry: LaborEntry) {
  const existing = await prisma.billingPrice.findFirst({
    where: { productId, effectiveFrom: EFFECTIVE_FROM },
    orderBy: { id: "asc" },
  });
  const data = {
    unitPrice: entry.laborUnitPrice,
    unit: "袋",
    effectiveFrom: EFFECTIVE_FROM,
    billingTarget: true,
    note: sourceText(entry),
  };

  if (dryRun) return existing ? "updated" : "created";
  if (!existing) {
    await prisma.billingPrice.create({ data: { productId, ...data } });
    return "created";
  }
  await prisma.billingPrice.update({ where: { id: existing.id }, data });
  return "updated";
}

async function upsertCapacities(input: {
  product: ProductWithAliases;
  internalWorkAreas: WorkArea[];
  entry: LaborEntry;
  unitsPerPersonHour: number;
}) {
  const internalWorkAreaIds = input.internalWorkAreas.map((workArea) => workArea.id);
  const internalWorkAreaById = new Map(input.internalWorkAreas.map((workArea) => [workArea.id, workArea]));
  const existingRows = await prisma.productionCapacity.findMany({
    where: {
      productId: input.product.id,
      workAreaId: { in: internalWorkAreaIds },
    },
  });
  const targetWorkAreaIds =
    existingRows.length > 0
      ? existingRows.map((row) => row.workAreaId)
      : [choosePrimaryWorkAreaId(input.product, input.internalWorkAreas)];
  const existingByWorkArea = new Map(existingRows.map((row) => [row.workAreaId, row]));
  const changes: {
    action: "created" | "updated";
    oldValue: number | null;
    workAreaName: string;
  }[] = [];

  for (const workAreaId of targetWorkAreaIds) {
    const existing = existingByWorkArea.get(workAreaId);
    const sourceNote = capacitySourceNote(input.entry, input.unitsPerPersonHour);
    const workAreaName = internalWorkAreaById.get(workAreaId)?.name ?? "(作業場所不明)";
    if (dryRun) {
      changes.push({
        action: existing ? "updated" : "created",
        oldValue: existing?.unitsPerPersonHour ?? null,
        workAreaName,
      });
      continue;
    }

    if (!existing) {
      await prisma.productionCapacity.create({
        data: {
          productId: input.product.id,
          workAreaId,
          unitsPerPersonHour: input.unitsPerPersonHour,
          standardPeople: 1,
          standardBreakMinutes: 0,
          sourceType: "MANUAL",
          note: sourceNote,
        },
      });
      changes.push({ action: "created", oldValue: null, workAreaName });
      continue;
    }

    await prisma.productionCapacity.update({
      where: { id: existing.id },
      data: {
        unitsPerPersonHour: input.unitsPerPersonHour,
        standardBreakMinutes: 0,
        sourceType: "MANUAL",
        note: mergeCapacityNote(existing.note, sourceNote),
      },
    });
    changes.push({ action: "updated", oldValue: existing.unitsPerPersonHour, workAreaName });
  }

  return changes;
}

function choosePrimaryWorkAreaId(product: Product | null, internalWorkAreas: WorkArea[]) {
  const defaultIsInternal =
    product?.defaultWorkAreaId &&
    internalWorkAreas.some((workArea) => workArea.id === product.defaultWorkAreaId);
  return defaultIsInternal && product?.defaultWorkAreaId
    ? product.defaultWorkAreaId
    : internalWorkAreas[0].id;
}

async function recalculateOpenProductionPlans(productIds: Set<string>) {
  const plans = await prisma.productionPlan.findMany({
    where: {
      productId: { in: [...productIds] },
      status: { in: ["draft", "confirmed"] },
    },
  });
  let updated = 0;
  let skippedNoCapacity = 0;

  for (const plan of plans) {
    const capacity = await prisma.productionCapacity.findUnique({
      where: { productId_workAreaId: { productId: plan.productId, workAreaId: plan.workAreaId } },
    });
    if (!capacity) {
      skippedNoCapacity++;
      continue;
    }
    await recalculatePlanFromCapacity(plan, capacity);
    updated++;
  }

  return { updated, skippedNoCapacity };
}

async function recalculatePlanFromCapacity(plan: ProductionPlan, capacity: ProductionCapacity) {
  const duration = computeProductionDuration({
    quantity: plan.plannedQuantity,
    unitsPerPersonHour: capacity.unitsPerPersonHour,
    peopleCount: plan.plannedPeopleCount,
    startTime: plan.plannedStartTime,
    baselineEndTime: plan.baselineEndTime,
  });
  const billingUnitPrice = await getCurrentBillingUnitPrice(plan.productId, plan.date);
  const estLaborCost = round2(plan.plannedQuantity * billingUnitPrice);
  const estTotalCost = round2(estLaborCost + (plan.estMaterialCost ?? 0) + (plan.estPackagingCost ?? 0));

  if (dryRun) return;
  await prisma.productionPlan.update({
    where: { id: plan.id },
    data: {
      plannedEndTime: duration.endTime,
      overtimeMinutes: duration.overtimeMinutes,
      estUnitsPerPersonHour: capacity.unitsPerPersonHour,
      estLaborCost,
      estTotalCost,
    },
  });
}

async function getCurrentBillingUnitPrice(productId: string, onDate: Date) {
  const row = await prisma.billingPrice.findFirst({
    where: {
      productId,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return row?.unitPrice ?? 0;
}

function capacitySourceNote(entry: LaborEntry, unitsPerPersonHour: number) {
  void entry;
  void unitsPerPersonHour;
  return CAPACITY_IMPORT_NOTE;
}

function sourceText(entry: LaborEntry) {
  void entry;
  return LABOR_IMPORT_NOTE;
}

function mergeCapacityNote(current: string | null, sourceNote: string) {
  void current;
  return sourceNote;
}

function normalizeProductName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function normalizeHeader(value: unknown) {
  return (str(value) ?? "").normalize("NFKC").replace(/\s+/g, "");
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" || s === "－" || s === "-" ? null : s;
}

function num(value: unknown): number | null {
  if (value == null || value === "" || value === "－" || value === "-") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
