/* eslint-disable no-console */
//
// Link the rebuilt classification-table products to related master data.
//
// Default is dry-run:
//   npm run link:products:classification
//
// Apply:
//   npm run link:products:classification -- --apply
//
// What this script does:
// 1. Copies safe historical relations from inactive old products to active
//    classification products using the consistency audit CSV.
//    Default match statuses: exact + strong_spec. weak_name is audit only.
// 2. Generates packaging BOM rows from the official classification columns
//    (袋/トレー, ダンボール, 備品, シール).
// 3. Writes audit CSVs for applied and unresolved links.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type PackagingMaterial, type Product } from "@prisma/client";
import { parseCsvWithHeader, toCsv } from "../src/lib/csv";
import {
  CLASSIFICATION_PACKAGING_BOM_NOTE,
  HISTORICAL_PRODUCT_LINK_NOTE,
  buildClassificationPackagingComponents,
  normalizeLinkText,
  stableClassificationPackagingCode,
  type PackagingComponent,
} from "../src/lib/product-linking";
import {
  PRODUCT_CLASSIFICATION_SOURCE_SYSTEM,
  buildSourceProductKey,
} from "../src/lib/product-classification";

const prisma = new PrismaClient();

const ROOT_DIR = path.resolve(__dirname, "../..");
const AUDIT_INPUT_PATH = path.join(ROOT_DIR, "docs/product_list_consistency_latest_rows_2026-06-08.csv");
const LINK_AUDIT_PATH = path.join(ROOT_DIR, "docs/product_linking_audit_2026-06-08.csv");
const UNRESOLVED_PATH = path.join(ROOT_DIR, "docs/product_linking_unresolved_2026-06-08.csv");
const DEFAULT_ALLOWED_STATUSES = new Set(["exact", "strong_spec"]);
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const includeWeak = args.has("--include-weak");
const skipHistorical = args.has("--skip-historical");
const skipPackaging = args.has("--skip-packaging");

type ActiveProduct = Product;
type AuditRow = Record<string, string>;

type LinkAuditRow = {
  action: string;
  status: string;
  newProductCode: string;
  newProductName: string;
  oldProductCode: string;
  oldProductName: string;
  detail: string;
  count: number | string;
};

type UnresolvedRow = {
  type: string;
  status: string;
  productCode: string;
  productName: string;
  sourceValue: string;
  reason: string;
  oldProductCode?: string;
  oldProductName?: string;
};

type Stats = {
  historicalCandidates: number;
  historicalLinkedProducts: number;
  metadataUpdated: number;
  capacitiesCreated: number;
  capacitiesUpdated: number;
  billingCreated: number;
  billingUpdated: number;
  monthlyActualsCreated: number;
  monthlyActualsUpdated: number;
  oldBomCopied: number;
  generatedBomDeleted: number;
  packagingComponents: number;
  packagingMaterialsMatched: number;
  packagingMaterialsCreated: number;
  packagingBomCreated: number;
  unresolved: number;
};

const stats: Stats = {
  historicalCandidates: 0,
  historicalLinkedProducts: 0,
  metadataUpdated: 0,
  capacitiesCreated: 0,
  capacitiesUpdated: 0,
  billingCreated: 0,
  billingUpdated: 0,
  monthlyActualsCreated: 0,
  monthlyActualsUpdated: 0,
  oldBomCopied: 0,
  generatedBomDeleted: 0,
  packagingComponents: 0,
  packagingMaterialsMatched: 0,
  packagingMaterialsCreated: 0,
  packagingBomCreated: 0,
  unresolved: 0,
};

const linkAuditRows: LinkAuditRow[] = [];
const unresolvedRows: UnresolvedRow[] = [];

async function main() {
  console.log("=== 商品分類表 紐づけ ===");
  console.log(`mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`audit input: ${AUDIT_INPUT_PATH}`);
  console.log(`match statuses: ${allowedStatuses().join(", ")}`);
  if (skipHistorical) console.log("  skip: historical relations");
  if (skipPackaging) console.log("  skip: classification packaging BOM");

  const products = await prisma.product.findMany({
    where: { active: true, sourceSystem: PRODUCT_CLASSIFICATION_SOURCE_SYSTEM },
  });
  const productsBySourceKey = new Map(products.map((product) => [product.sourceProductKey, product]));
  console.log(`active classification products: ${products.length}`);

  if (!skipHistorical) {
    const auditRows = readAuditRows();
    await linkHistoricalRelations(auditRows, productsBySourceKey);
  }
  if (!skipPackaging) {
    await generatePackagingBom(products);
  }
  addRawMaterialCandidateRows(products);

  stats.unresolved = unresolvedRows.length;
  writeAuditCsvs();

  if (apply) {
    await prisma.auditLog.create({
      data: {
        action: "link_classification_products",
        entityType: "Product",
        afterJson: JSON.stringify(stats),
      },
    });
  }

  console.log("\n=== 結果 ===");
  console.log(`  旧関連データ 候補商品: ${stats.historicalCandidates}`);
  console.log(`  旧関連データ 紐づけ商品: ${stats.historicalLinkedProducts}`);
  console.log(`  商品メタデータ 更新: ${stats.metadataUpdated}`);
  console.log(`  生産能力: 新規 ${stats.capacitiesCreated}, 更新 ${stats.capacitiesUpdated}`);
  console.log(`  手間賃単価: 新規 ${stats.billingCreated}, 更新 ${stats.billingUpdated}`);
  console.log(`  月次実績: 新規 ${stats.monthlyActualsCreated}, 更新 ${stats.monthlyActualsUpdated}`);
  console.log(`  旧BOMコピー: ${stats.oldBomCopied}`);
  console.log(`  包装部材: 既存マッチ ${stats.packagingMaterialsMatched}, 新規 ${stats.packagingMaterialsCreated}`);
  console.log(`  包装BOM: 生成 ${stats.packagingBomCreated}, 既存生成分削除 ${stats.generatedBomDeleted}`);
  console.log(`  未解決/要確認: ${stats.unresolved}`);
  console.log(`  audit: ${LINK_AUDIT_PATH}`);
  console.log(`  unresolved: ${UNRESOLVED_PATH}`);
  if (!apply) console.log("\nDry-run only. Re-run with --apply to update the database.");
}

function allowedStatuses(): string[] {
  return includeWeak ? ["exact", "strong_spec", "weak_name"] : [...DEFAULT_ALLOWED_STATUSES];
}

function readAuditRows(): AuditRow[] {
  const { rows } = parseCsvWithHeader(readFileSync(AUDIT_INPUT_PATH, "utf8"));
  return rows;
}

async function linkHistoricalRelations(
  auditRows: AuditRow[],
  productsBySourceKey: Map<string | null, ActiveProduct>,
) {
  const allowed = new Set(allowedStatuses());
  const candidates = auditRows
    .filter((row) => allowed.has(row.status) && row.dbProductCode)
    .map((row) => {
      const sourceProductKey = buildSourceProductKey({
        productName: row.latestName,
        specification: row.latestSpec || null,
        brandName: row.latestBrand || null,
      });
      return { row, sourceProductKey };
    });
  stats.historicalCandidates = candidates.length;

  const oldCodes = [...new Set(candidates.map((candidate) => candidate.row.dbProductCode))];
  const oldProducts = await prisma.product.findMany({
    where: { productCode: { in: oldCodes } },
    include: {
      capacities: true,
      billingPrices: true,
      monthlyActuals: true,
      bomItems: true,
    },
  });
  const oldByCode = new Map(oldProducts.map((product) => [product.productCode, product]));

  const rawMappings = [];
  for (const candidate of candidates) {
    const newProduct = productsBySourceKey.get(candidate.sourceProductKey);
    const oldProduct = oldByCode.get(candidate.row.dbProductCode);
    if (!newProduct || !oldProduct) {
      unresolvedRows.push({
        type: "historical_mapping",
        status: candidate.row.status,
        productCode: newProduct?.productCode ?? "",
        productName: candidate.row.latestName,
        sourceValue: candidate.row.dbProductCode,
        reason: !newProduct ? "new_product_not_found" : "old_product_not_found",
        oldProductCode: candidate.row.dbProductCode,
        oldProductName: candidate.row.dbOfficialName,
      });
      continue;
    }
    rawMappings.push({ row: candidate.row, newProduct, oldProduct });
  }

  const mappings = filterConflictingMappings(rawMappings);
  stats.historicalLinkedProducts = mappings.length;

  for (const mapping of mappings) {
    await copyProductMetadata(mapping.newProduct, mapping.oldProduct, mapping.row.status);
    await copyCapacities(mapping.newProduct, mapping.oldProduct, mapping.row.status);
    await copyBillingPrices(mapping.newProduct, mapping.oldProduct, mapping.row.status);
    await copyMonthlyActuals(mapping.newProduct, mapping.oldProduct, mapping.row.status);
    await copyOldBomItems(mapping.newProduct, mapping.oldProduct, mapping.row.status);
  }
}

function filterConflictingMappings<T extends { newProduct: Product; oldProduct: Product & { productCode: string }; row: AuditRow }>(
  mappings: T[],
): T[] {
  const byPair = new Map<string, T>();
  for (const mapping of mappings) byPair.set(`${mapping.newProduct.id}:${mapping.oldProduct.id}`, mapping);
  const unique = [...byPair.values()];
  const oldToNew = groupBy(unique, (mapping) => mapping.oldProduct.id);
  const newToOld = groupBy(unique, (mapping) => mapping.newProduct.id);
  return unique.filter((mapping) => {
    const oldConflict = new Set(oldToNew.get(mapping.oldProduct.id)?.map((row) => row.newProduct.id)).size > 1;
    const newConflict = new Set(newToOld.get(mapping.newProduct.id)?.map((row) => row.oldProduct.id)).size > 1;
    if (!oldConflict && !newConflict) return true;
    unresolvedRows.push({
      type: "historical_mapping",
      status: mapping.row.status,
      productCode: mapping.newProduct.productCode,
      productName: mapping.newProduct.officialName,
      sourceValue: mapping.oldProduct.productCode,
      reason: oldConflict ? "old_product_maps_to_multiple_new_products" : "new_product_maps_to_multiple_old_products",
      oldProductCode: mapping.oldProduct.productCode,
      oldProductName: mapping.oldProduct.officialName,
    });
    return false;
  });
}

async function copyProductMetadata(
  newProduct: Product,
  oldProduct: Product,
  status: string,
) {
  const data: Partial<Product> = {};
  if (!newProduct.defaultWorkAreaId && oldProduct.defaultWorkAreaId) data.defaultWorkAreaId = oldProduct.defaultWorkAreaId;
  if (newProduct.standardProductionLotSize <= 0 && oldProduct.standardProductionLotSize > 0) {
    data.standardProductionLotSize = oldProduct.standardProductionLotSize;
  }
  if (newProduct.safetyStockQuantity <= 0 && oldProduct.safetyStockQuantity > 0) {
    data.safetyStockQuantity = oldProduct.safetyStockQuantity;
  }
  if (Object.keys(data).length === 0) return;
  stats.metadataUpdated++;
  linkAuditRows.push(auditRow("product_metadata", status, newProduct, oldProduct, Object.keys(data).join(","), 1));
  if (!apply) return;
  await prisma.product.update({ where: { id: newProduct.id }, data });
}

async function copyCapacities(
  newProduct: Product,
  oldProduct: Product & { capacities?: any[] },
  status: string,
) {
  for (const oldCapacity of oldProduct.capacities ?? []) {
    if (!oldCapacity.active) continue;
    const existing = await prisma.productionCapacity.findUnique({
      where: { productId_workAreaId: { productId: newProduct.id, workAreaId: oldCapacity.workAreaId } },
    });
    if (existing) stats.capacitiesUpdated++;
    else stats.capacitiesCreated++;
    linkAuditRows.push(
      auditRow("production_capacity", status, newProduct, oldProduct, oldCapacity.workAreaId, existing ? "update" : "create"),
    );
    if (!apply) continue;
    const data = {
      unitsPerPersonHour: oldCapacity.unitsPerPersonHour,
      standardPeople: oldCapacity.standardPeople,
      standardBreakMinutes: oldCapacity.standardBreakMinutes,
      note: mergeLinkNote(oldCapacity.note, oldProduct, status),
      sourceType: oldCapacity.sourceType,
      locked: oldCapacity.locked,
      active: oldCapacity.active,
      validFrom: oldCapacity.validFrom,
      validTo: oldCapacity.validTo,
      reviewStatus: oldCapacity.reviewStatus,
      reviewMemo: oldCapacity.reviewMemo,
      reviewedAt: oldCapacity.reviewedAt,
    };
    await prisma.productionCapacity.upsert({
      where: { productId_workAreaId: { productId: newProduct.id, workAreaId: oldCapacity.workAreaId } },
      create: { productId: newProduct.id, workAreaId: oldCapacity.workAreaId, ...data },
      update: data,
    });
  }
}

async function copyBillingPrices(
  newProduct: Product,
  oldProduct: Product & { billingPrices?: any[] },
  status: string,
) {
  for (const oldBilling of oldProduct.billingPrices ?? []) {
    const existing = await prisma.billingPrice.findFirst({
      where: { productId: newProduct.id, unit: oldBilling.unit, effectiveFrom: oldBilling.effectiveFrom },
      orderBy: { id: "asc" },
    });
    if (existing) stats.billingUpdated++;
    else stats.billingCreated++;
    linkAuditRows.push(
      auditRow("billing_price", status, newProduct, oldProduct, oldBilling.effectiveFrom.toISOString().slice(0, 10), existing ? "update" : "create"),
    );
    if (!apply) continue;
    const data = {
      unitPrice: oldBilling.unitPrice,
      unit: oldBilling.unit,
      effectiveFrom: oldBilling.effectiveFrom,
      effectiveTo: oldBilling.effectiveTo,
      billingTarget: oldBilling.billingTarget,
      externalCode: oldBilling.externalCode,
      note: mergeLinkNote(oldBilling.note, oldProduct, status),
    };
    if (existing) await prisma.billingPrice.update({ where: { id: existing.id }, data });
    else await prisma.billingPrice.create({ data: { productId: newProduct.id, ...data } });
  }
}

async function copyMonthlyActuals(
  newProduct: Product,
  oldProduct: Product & { monthlyActuals?: any[] },
  status: string,
) {
  for (const oldActual of oldProduct.monthlyActuals ?? []) {
    const existing = await prisma.productMonthlyActual.findUnique({
      where: { productId_yearMonth: { productId: newProduct.id, yearMonth: oldActual.yearMonth } },
    });
    if (existing) stats.monthlyActualsUpdated++;
    else stats.monthlyActualsCreated++;
    linkAuditRows.push(
      auditRow("monthly_actual", status, newProduct, oldProduct, oldActual.yearMonth, existing ? "update" : "create"),
    );
    if (!apply) continue;
    await prisma.productMonthlyActual.upsert({
      where: { productId_yearMonth: { productId: newProduct.id, yearMonth: oldActual.yearMonth } },
      create: {
        productId: newProduct.id,
        yearMonth: oldActual.yearMonth,
        actualQuantity: oldActual.actualQuantity,
        sourceType: oldActual.sourceType,
        note: mergeLinkNote(oldActual.note, oldProduct, status),
      },
      update: {
        actualQuantity: oldActual.actualQuantity,
        sourceType: oldActual.sourceType,
        note: mergeLinkNote(oldActual.note, oldProduct, status),
      },
    });
  }
}

async function copyOldBomItems(
  newProduct: Product,
  oldProduct: Product & { bomItems?: any[] },
  status: string,
) {
  for (const oldBom of oldProduct.bomItems ?? []) {
    if (!oldBom.active) continue;
    const existing = await prisma.productBomItem.findFirst({
      where: {
        productId: newProduct.id,
        itemType: oldBom.itemType,
        itemId: oldBom.itemId,
        note: { contains: HISTORICAL_PRODUCT_LINK_NOTE },
      },
    });
    if (existing) continue;
    stats.oldBomCopied++;
    linkAuditRows.push(auditRow("old_bom", status, newProduct, oldProduct, oldBom.itemId, "create"));
    if (!apply) continue;
    await prisma.productBomItem.create({
      data: {
        productId: newProduct.id,
        itemType: oldBom.itemType,
        itemId: oldBom.itemId,
        quantityPerUnit: oldBom.quantityPerUnit,
        unit: oldBom.unit,
        lossRate: oldBom.lossRate,
        mixRatio: oldBom.mixRatio,
        active: oldBom.active,
        validFrom: oldBom.validFrom,
        validTo: oldBom.validTo,
        note: mergeLinkNote(oldBom.note, oldProduct, status),
      },
    });
  }
}

async function generatePackagingBom(products: ActiveProduct[]) {
  const productIds = products.map((product) => product.id);
  const existingGenerated = await prisma.productBomItem.count({
    where: { productId: { in: productIds }, note: { startsWith: CLASSIFICATION_PACKAGING_BOM_NOTE } },
  });
  stats.generatedBomDeleted = existingGenerated;
  if (apply && existingGenerated > 0) {
    await prisma.productBomItem.deleteMany({
      where: { productId: { in: productIds }, note: { startsWith: CLASSIFICATION_PACKAGING_BOM_NOTE } },
    });
  }

  const packaging = await prisma.packagingMaterial.findMany({ where: { active: true } });
  const resolver = new PackagingResolver(packaging);
  const bomRows: {
    productId: string;
    itemType: "packaging";
    itemId: string;
    quantityPerUnit: number;
    unit: string;
    note: string;
  }[] = [];

  for (const product of products) {
    const { components, issues } = buildClassificationPackagingComponents(product);
    for (const issue of issues) {
      unresolvedRows.push({
        type: `packaging_${issue.source}`,
        status: "classification",
        productCode: product.productCode,
        productName: product.officialName,
        sourceValue: issue.value,
        reason: issue.reason,
      });
    }
    for (const component of components) {
      stats.packagingComponents++;
      const material = await resolver.resolve(component);
      if (material.created) stats.packagingMaterialsCreated++;
      else stats.packagingMaterialsMatched++;
      bomRows.push({
        productId: product.id,
        itemType: "packaging",
        itemId: material.id,
        quantityPerUnit: component.quantityPerUnit,
        unit: component.unit,
        note: `${component.note} / ${component.name}`,
      });
      linkAuditRows.push({
        action: "packaging_bom",
        status: "classification",
        newProductCode: product.productCode,
        newProductName: product.officialName,
        oldProductCode: "",
        oldProductName: "",
        detail: `${component.source}:${component.name}:${material.code}`,
        count: component.quantityPerUnit,
      });
    }
  }

  stats.packagingBomCreated = bomRows.length;
  if (apply && bomRows.length > 0) {
    await prisma.productBomItem.createMany({ data: bomRows });
  }
}

class PackagingResolver {
  private byNormalizedName = new Map<string, PackagingMaterial>();
  private byGeneratedCode = new Map<string, PackagingMaterial>();
  private usedCodes = new Set<string>();

  constructor(packaging: PackagingMaterial[]) {
    for (const material of packaging) this.remember(material);
  }

  async resolve(component: PackagingComponent): Promise<{ id: string; code: string; created: boolean }> {
    const existing = this.findExisting(component);
    if (existing) {
      await this.syncGeneratedMaterial(existing, component);
      return { id: existing.id, code: existing.materialCode, created: false };
    }

    let materialCode = stableClassificationPackagingCode(component.name);
    let suffix = 2;
    while (this.usedCodes.has(materialCode)) materialCode = `${stableClassificationPackagingCode(component.name)}-${suffix++}`;

    if (!apply) {
      this.usedCodes.add(materialCode);
      this.byNormalizedName.set(normalizeLinkText(component.name), {
        id: `dry-${materialCode}`,
        materialCode,
        name: component.name,
        kind: component.kind,
        unit: component.unit,
        casePackQty: null,
        standardUnitPrice: 0,
        supplierId: null,
        leadTimeDays: 0,
        safetyStockQuantity: 0,
        orderLotQty: null,
        minOrderQty: null,
        orderProcessingBufferDays: null,
        active: true,
        validFrom: null,
        validTo: null,
        note: "dry-run",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: `dry-${materialCode}`, code: materialCode, created: true };
    }

    const created = await prisma.packagingMaterial.create({
      data: {
        materialCode,
        name: component.name,
        kind: component.kind,
        unit: component.unit,
        standardUnitPrice: 0,
        active: true,
        note: `商品分類表から自動追加: ${component.source}`,
      },
    });
    this.remember(created);
    return { id: created.id, code: created.materialCode, created: true };
  }

  private remember(material: PackagingMaterial) {
    this.usedCodes.add(material.materialCode);
    this.byGeneratedCode.set(material.materialCode, material);
    this.byNormalizedName.set(normalizeLinkText(material.name), material);
    const stripped = stripPackagingPrefixes(material.name);
    this.byNormalizedName.set(normalizeLinkText(stripped), material);
  }

  private findExisting(component: PackagingComponent): PackagingMaterial | null {
    const normalized = normalizeLinkText(component.name);
    const exact = this.byNormalizedName.get(normalized);
    if (exact) return exact;

    if (component.kind === "carton") {
      const carton = this.byNormalizedName.get(normalizeLinkText(`段ボール ${component.name}`));
      if (carton) return carton;
    }

    if (/^((tm|tp|kt|s)-?\d+)/i.test(component.name)) {
      const token = normalizeLinkText(component.name).replace(/p$/, "");
      const tray = [...this.byNormalizedName.values()].find((material) =>
        normalizeLinkText(material.name).includes(token),
      );
      if (tray) return tray;
    }

    const baitalon = normalized.match(/バイタロン(\d+)/);
    if (baitalon) {
      const matched = [...this.byNormalizedName.values()].find((material) => {
        const name = normalizeLinkText(material.name);
        return name.includes("バイタロン") && name.includes(baitalon[1]);
      });
      if (matched) return matched;
    }

    return null;
  }

  private async syncGeneratedMaterial(material: PackagingMaterial, component: PackagingComponent) {
    if (!apply || !material.materialCode.startsWith("KPM-")) return;
    if (material.kind === component.kind && material.unit === component.unit && material.name === component.name) return;
    const updated = await prisma.packagingMaterial.update({
      where: { id: material.id },
      data: {
        name: component.name,
        kind: component.kind,
        unit: component.unit,
      },
    });
    this.remember(updated);
  }
}

function addRawMaterialCandidateRows(products: ActiveProduct[]) {
  for (const product of products) {
    if (!product.rawMaterialNote) continue;
    unresolvedRows.push({
      type: "raw_material_candidate",
      status: "classification",
      productCode: product.productCode,
      productName: product.officialName,
      sourceValue: product.rawMaterialNote,
      reason: "raw_material_note_requires_review",
    });
  }
}

function stripPackagingPrefixes(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^段ボール\s*/i, "")
    .replace(/^袋\s*/i, "")
    .replace(/^トレー\s*/i, "")
    .replace(/^ﾄﾚｰ\s*/i, "")
    .trim();
}

function mergeLinkNote(note: string | null | undefined, oldProduct: Product, status: string): string {
  return [
    `${HISTORICAL_PRODUCT_LINK_NOTE}: ${oldProduct.productCode} (${status})`,
    note,
  ].filter(Boolean).join(" / ");
}

function auditRow(
  action: string,
  status: string,
  newProduct: Product,
  oldProduct: Product,
  detail: string,
  count: number | string,
): LinkAuditRow {
  return {
    action,
    status,
    newProductCode: newProduct.productCode,
    newProductName: newProduct.officialName,
    oldProductCode: oldProduct.productCode,
    oldProductName: oldProduct.officialName,
    detail,
    count,
  };
}

function writeAuditCsvs() {
  writeFileSync(
    LINK_AUDIT_PATH,
    toCsv(
      ["action", "status", "newProductCode", "newProductName", "oldProductCode", "oldProductName", "detail", "count"],
      linkAuditRows.map((row) => [
        row.action,
        row.status,
        row.newProductCode,
        row.newProductName,
        row.oldProductCode,
        row.oldProductName,
        row.detail,
        row.count,
      ]),
    ),
  );
  writeFileSync(
    UNRESOLVED_PATH,
    toCsv(
      ["type", "status", "productCode", "productName", "sourceValue", "reason", "oldProductCode", "oldProductName"],
      unresolvedRows.map((row) => [
        row.type,
        row.status,
        row.productCode,
        row.productName,
        row.sourceValue,
        row.reason,
        row.oldProductCode,
        row.oldProductName,
      ]),
    ),
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return grouped;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
