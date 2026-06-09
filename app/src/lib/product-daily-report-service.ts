import type { Prisma, Product } from "@prisma/client";

import { audit } from "./audit";
import {
  DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
  computeProductDailyReportMetrics,
} from "./product-daily-report-calculations";
import { HttpError } from "./http";
import {
  removeProductionDailyReportMovements,
  replaceProductionDailyReportMovements,
  type ProductionDailyReportConsumption,
} from "./inventory-ledger";
import { syncMonthlyActualFromProductionDailyReports, yearMonthFromDate } from "./monthly-actual-aggregation";
import { getCurrentBillingUnitPrice, loadProductBom } from "./plan-engine";
import { prisma } from "./prisma";
import { normalizeForSearch } from "./search";

export type ProductDailyReportMaterialInput = {
  materialId?: string | null;
  materialName: string;
  usedKg: number;
  mixRatio?: number | null;
};

export type ProductDailyReportApprovalStatus = "submitted" | "approved" | "rejected";

export type ProductDailyReportLabelPhotoInput = {
  name: string;
  type?: string | null;
  dataUrl: string;
};

export type ProductDailyReportInput = {
  reportDate: string;
  productId?: string | null;
  productName?: string | null;
  expiryDate?: string | null;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  workerCount: number;
  productionQty: number;
  // 複数原料(2種類以上)。未指定時は materialUsedKg / BOM から1要素を補完する(後方互換)。
  materials?: ProductDailyReportMaterialInput[];
  materialUsedKg?: number;
  laborFeeRateId?: string | null;
  note?: string | null;
  sourceType?: string | null;
  sourceSheetName?: string | null;
  sourceRowNumber?: number | null;
  approvalStatus?: ProductDailyReportApprovalStatus;
  submittedBy?: string | null;
  approvedBy?: string | null;
  labelPhotos?: ProductDailyReportLabelPhotoInput[];
};

// 在庫差引・原価計算で使う、単価まで解決済みの原料行。
type ResolvedMaterial = {
  materialId: string | null;
  materialName: string;
  materialCode: string | null;
  usedKg: number;
  unitPriceSnapshot: number;
  mixRatio: number | null;
  sortOrder: number;
};

// 資材(packaging)は入力させず、BOM標準使用量(生産数×quantityPerUnit×(1+ロス))で在庫差引する。
type PackagingDeduction = { itemId: string; quantity: number; unitPrice: number };

type BuiltEntry = {
  data: Prisma.ProductionDailyReportEntryUncheckedCreateInput;
  materials: ResolvedMaterial[];
  packaging: PackagingDeduction[];
};

type ProductWithAliases = Product & {
  aliases: { aliasName: string }[];
};

type ProductMatch = {
  product: ProductWithAliases | null;
  productName: string;
  normalizedProductName: string;
  productMatchStatus: "product_id" | "exact" | "alias" | "fuzzy" | "unmatched";
};

const entryInclude = {
  product: true,
  laborFeeRate: true,
  materials: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ProductionDailyReportEntryInclude;

type ProductDailyReportEntryWithDetails = Prisma.ProductionDailyReportEntryGetPayload<{
  include: typeof entryInclude;
}>;

export async function createProductDailyReportEntry(input: ProductDailyReportInput) {
  const built = await buildProductDailyReportData(input);
  const shouldReflectInventory = built.data.approvalStatus === "approved";

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.productionDailyReportEntry.create({ data: built.data });
    await tx.productionDailyReportEntryMaterial.createMany({
      data: built.materials.map((m) => ({ ...materialChildData(m), entryId: created.id })),
    });
    if (shouldReflectInventory) {
      await replaceProductionDailyReportMovements(
        tx,
        { id: created.id, productId: created.productId, productionQty: created.productionQty, reportDate: created.reportDate },
        toConsumptions(built),
      );
    }
    if (shouldReflectInventory && created.productId) {
      await syncMonthlyActualFromProductionDailyReports(tx, {
        productId: created.productId,
        yearMonth: yearMonthFromDate(created.reportDate),
      });
      await completeMatchingPlans(tx, created.productId, created.reportDate);
    }
    return tx.productionDailyReportEntry.findUnique({ where: { id: created.id }, include: entryInclude });
  });

  await audit({
    action: shouldReflectInventory ? "create" : "submit",
    entityType: "ProductionDailyReportEntry",
    entityId: row!.id,
    after: row,
  });
  if (shouldReflectInventory) {
    await audit({ action: "sync_inventory", entityType: "StockMovement", entityId: row!.id, after: row!.materials });
  }
  return row;
}

export async function updateProductDailyReportEntry(id: string, input: ProductDailyReportInput) {
  const before = await prisma.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  if (!before) throw new HttpError(404, "not_found");

  const built = await buildProductDailyReportData(input, {
    approvalStatus: before.approvalStatus as ProductDailyReportApprovalStatus,
    submittedBy: before.submittedBy,
    approvedAt: before.approvedAt,
    approvedBy: before.approvedBy,
    labelPhotosJson: before.labelPhotosJson,
  });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionDailyReportEntry.update({ where: { id }, data: built.data });
    await tx.productionDailyReportEntryMaterial.deleteMany({ where: { entryId: id } });
    await tx.productionDailyReportEntryMaterial.createMany({
      data: built.materials.map((m) => ({ ...materialChildData(m), entryId: id })),
    });
    if (updated.approvalStatus === "approved") {
      await replaceProductionDailyReportMovements(
        tx,
        { id, productId: updated.productId, productionQty: updated.productionQty, reportDate: updated.reportDate },
        toConsumptions(built),
      );
    } else {
      await removeProductionDailyReportMovements(tx, id);
    }
    // 商品/日付が変わる場合に旧月次も引き直す。
    const months = new Set<string>();
    if (before.productId) months.add(`${before.productId}|${yearMonthFromDate(before.reportDate)}`);
    if (updated.productId) months.add(`${updated.productId}|${yearMonthFromDate(updated.reportDate)}`);
    for (const key of months) {
      const [productId, yearMonth] = key.split("|");
      await syncMonthlyActualFromProductionDailyReports(tx, { productId, yearMonth });
    }
    if (updated.approvalStatus === "approved" && updated.productId) {
      await completeMatchingPlans(tx, updated.productId, updated.reportDate);
    }
    return tx.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  });

  await audit({ action: "update", entityType: "ProductionDailyReportEntry", entityId: id, before, after: row });
  return row;
}

export async function approveProductDailyReportEntry(id: string, approvedBy?: string | null) {
  const before = await prisma.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  if (!before) throw new HttpError(404, "not_found");
  if (!before.active) throw new HttpError(400, "inactive_entry", "削除済みの日報は計上できません。");

  const built = await buildProductDailyReportData(entryToInput(before), {
    approvalStatus: "approved",
    submittedBy: before.submittedBy,
    approvedAt: new Date(),
    approvedBy: approvedBy ?? before.approvedBy,
    labelPhotosJson: before.labelPhotosJson,
  });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionDailyReportEntry.update({ where: { id }, data: built.data });
    await tx.productionDailyReportEntryMaterial.deleteMany({ where: { entryId: id } });
    await tx.productionDailyReportEntryMaterial.createMany({
      data: built.materials.map((m) => ({ ...materialChildData(m), entryId: id })),
    });
    await replaceProductionDailyReportMovements(
      tx,
      { id, productId: updated.productId, productionQty: updated.productionQty, reportDate: updated.reportDate },
      toConsumptions(built),
    );
    if (updated.productId) {
      await syncMonthlyActualFromProductionDailyReports(tx, {
        productId: updated.productId,
        yearMonth: yearMonthFromDate(updated.reportDate),
      });
      await completeMatchingPlans(tx, updated.productId, updated.reportDate);
    }
    return tx.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  });

  await audit({ action: "approve", entityType: "ProductionDailyReportEntry", entityId: id, before, after: row });
  await audit({ action: "sync_inventory", entityType: "StockMovement", entityId: id, after: row!.materials });
  return row;
}

export async function deactivateProductDailyReportEntry(id: string) {
  const before = await prisma.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  if (!before) throw new HttpError(404, "not_found");

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionDailyReportEntry.update({ where: { id }, data: { active: false } });
    // 在庫差引を戻し、月次実績も引き直す。
    await removeProductionDailyReportMovements(tx, id);
    if (updated.productId) {
      await syncMonthlyActualFromProductionDailyReports(tx, {
        productId: updated.productId,
        yearMonth: yearMonthFromDate(updated.reportDate),
      });
    }
    return tx.productionDailyReportEntry.findUnique({ where: { id }, include: entryInclude });
  });

  await audit({ action: "deactivate", entityType: "ProductionDailyReportEntry", entityId: id, before, after: row });
  return row;
}

async function buildProductDailyReportData(
  input: ProductDailyReportInput,
  defaults?: {
    approvalStatus?: ProductDailyReportApprovalStatus;
    submittedBy?: string | null;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    labelPhotosJson?: string | null;
  },
): Promise<BuiltEntry> {
  const reportDate = new Date(`${input.reportDate}T00:00:00.000Z`);
  const productMatch = await resolveProductMatch(input.productId, input.productName);
  const snapshots = productMatch.product
    ? await loadProductDailyReportSnapshots(productMatch.product.id, reportDate)
    : emptySnapshots();
  const labor = await resolveLaborFeeRate(input.laborFeeRateId, reportDate);

  const productId = productMatch.product?.id ?? null;
  const bom = productId ? await loadProductBom(productId, reportDate) : [];
  const bomRaw = bom.filter((b) => b.itemType === "raw_material");
  const materials = await resolveMaterials(input, bomRaw, snapshots.materialUnitCostPerKg);
  const packaging = resolvePackagingDeductions(bom, input.productionQty ?? 0);
  const totalMaterialKg = materials.reduce((acc, m) => acc + Math.max(0, m.usedKg), 0);

  const metrics = computeProductDailyReportMetrics({
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: input.breakMinutes ?? 0,
    workerCount: input.workerCount,
    productionQty: input.productionQty,
    materials: materials.map((m) => ({ usedKg: m.usedKg, unitCostPerKg: m.unitPriceSnapshot })),
    capacityG: snapshots.capacityG,
    packageCostPerUnit: snapshots.packageCostPerUnit,
    unitPrice: snapshots.unitPrice,
    laborHourlyRate: labor.hourlyRate,
  });

  // 表示・後方互換用の親スナップショット。複数原料時は加重平均(原価/総kg)を保持する。
  const blendedMaterialUnitCost =
    totalMaterialKg > 0 ? metrics.materialCost / totalMaterialKg : snapshots.materialUnitCostPerKg;
  const approvalStatus = input.approvalStatus ?? defaults?.approvalStatus ?? "approved";
  const approvedAt =
    approvalStatus === "approved" ? (defaults?.approvedAt ?? new Date()) : null;

  const data: Prisma.ProductionDailyReportEntryUncheckedCreateInput = {
    reportDate,
    productId: productMatch.product?.id ?? null,
    productName: productMatch.productName,
    normalizedProductName: productMatch.normalizedProductName,
    productMatchStatus: productMatch.productMatchStatus,
    expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00.000Z`) : null,
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: input.breakMinutes ?? 0,
    workerCount: input.workerCount,
    productionQty: input.productionQty,
    materialUsedKg: totalMaterialKg,
    laborFeeRateId: labor.id,
    note: input.note ?? null,
    sourceType: input.sourceType ?? "manual",
    sourceSheetName: input.sourceSheetName ?? null,
    sourceRowNumber: input.sourceRowNumber ?? null,
    active: true,
    approvalStatus,
    submittedBy: input.submittedBy ?? defaults?.submittedBy ?? null,
    approvedAt,
    approvedBy: input.approvedBy ?? defaults?.approvedBy ?? null,
    labelPhotosJson: input.labelPhotos
      ? serializeLabelPhotos(input.labelPhotos)
      : (defaults?.labelPhotosJson ?? "[]"),
    capacityGSnapshot: snapshots.capacityG,
    materialUnitCostSnapshot: blendedMaterialUnitCost,
    packageCostPerUnitSnapshot: snapshots.packageCostPerUnit,
    unitPriceSnapshot: snapshots.unitPrice,
    laborHourlyRateSnapshot: labor.hourlyRate,
    operatingMinutes: metrics.operatingMinutes,
    totalOperatingMinutes: metrics.totalOperatingMinutes,
    perHourQty: metrics.perHourQty,
    perUnitTimeMinutes: metrics.perUnitTimeMinutes,
    laborFeePerUnit: metrics.laborFeePerUnit,
    bagWeightG: metrics.bagWeightG,
    lossRate: metrics.lossRate,
    materialCost: metrics.materialCost,
    packageCost: metrics.packageCost,
    totalCost: metrics.totalCost,
    sales: metrics.sales,
    profitRate: metrics.profitRate,
    calculationWarnings: JSON.stringify(metrics.warnings),
  };

  return { data, materials, packaging };
}

function entryToInput(
  entry: ProductDailyReportEntryWithDetails,
): ProductDailyReportInput {
  return {
    reportDate: entry.reportDate.toISOString().slice(0, 10),
    productId: entry.productId,
    productName: entry.productId ? null : entry.productName,
    expiryDate: entry.expiryDate?.toISOString().slice(0, 10) ?? null,
    startTime: entry.startTime,
    endTime: entry.endTime,
    breakMinutes: entry.breakMinutes,
    workerCount: entry.workerCount,
    productionQty: entry.productionQty,
    materials: entry.materials.map((m) => ({
      materialId: m.materialId,
      materialName: m.materialName,
      usedKg: m.usedKg,
      mixRatio: m.mixRatio,
    })),
    laborFeeRateId: entry.laborFeeRateId,
    note: entry.note,
    sourceType: entry.sourceType,
    sourceSheetName: entry.sourceSheetName,
    sourceRowNumber: entry.sourceRowNumber,
    approvalStatus: "approved",
  };
}

function serializeLabelPhotos(photos: ProductDailyReportLabelPhotoInput[]) {
  return JSON.stringify(
    photos.slice(0, 4).map((photo) => ({
      name: String(photo.name || "label-photo").slice(0, 120),
      type: photo.type ? String(photo.type).slice(0, 80) : null,
      dataUrl: String(photo.dataUrl || ""),
    })),
  );
}

// 在庫差引用の消費(原料=実測kg, 資材=BOM標準量)へ変換する。itemId 未解決はスキップ。
function toConsumptions(built: BuiltEntry): ProductionDailyReportConsumption[] {
  return [
    ...built.materials
      .filter((m) => m.materialId)
      .map((m) => ({
        itemType: "raw_material" as const,
        itemId: m.materialId,
        quantity: m.usedKg,
        unitPrice: m.unitPriceSnapshot,
      })),
    ...built.packaging.map((p) => ({
      itemType: "packaging" as const,
      itemId: p.itemId,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
    })),
  ];
}

// 資材(packaging)はBOM標準: 生産数 × quantityPerUnit × (1+ロス率)。
function resolvePackagingDeductions(
  bom: Awaited<ReturnType<typeof loadProductBom>>,
  productionQty: number,
): PackagingDeduction[] {
  if (productionQty <= 0) return [];
  return bom
    .filter((b) => b.itemType === "packaging")
    .map((b) => ({
      itemId: b.itemId,
      quantity: Math.max(0, productionQty * b.quantityPerUnit * (1 + (b.lossRate ?? 0))),
      unitPrice: b.unitPrice,
    }));
}

// 入力の materials を、原料マスタの単価/コードまで解決した行へ変換する。
// 1) materials 指定あり -> それを解決。 2) materialUsedKg のみ -> BOM主原料に紐付けた単一行。
// 3) どちらも無く productId あり -> BOM の raw_material を標準使用量で自動展開。
// bom は商品の raw_material BOM 行(loadProductBom由来)。
async function resolveMaterials(
  input: ProductDailyReportInput,
  bom: Awaited<ReturnType<typeof loadProductBom>>,
  fallbackUnitCostPerKg: number,
): Promise<ResolvedMaterial[]> {
  if (input.materials && input.materials.length > 0) {
    const materialIds = input.materials.map((m) => m.materialId).filter((v): v is string => !!v);
    const masters = materialIds.length
      ? await prisma.material.findMany({ where: { id: { in: materialIds } } })
      : [];
    const masterById = new Map(masters.map((m) => [m.id, m]));
    return input.materials.map((m, index) => {
      const master = m.materialId ? masterById.get(m.materialId) : undefined;
      return {
        materialId: master?.id ?? null,
        materialName: m.materialName?.trim() || master?.name || "(未設定)",
        materialCode: master?.materialCode ?? null,
        usedKg: Math.max(0, safeNumber(m.usedKg)),
        unitPriceSnapshot: master?.standardUnitPrice ?? 0,
        mixRatio: m.mixRatio ?? null,
        sortOrder: index,
      };
    });
  }

  // 後方互換: 単一 materialUsedKg。BOM主原料(あれば)に紐付けて在庫差引対象にする。
  if (input.materialUsedKg != null) {
    const primary = bom[0];
    if (primary) {
      return [
        {
          materialId: primary.itemId,
          materialName: primary.itemName,
          materialCode: null,
          usedKg: Math.max(0, safeNumber(input.materialUsedKg)),
          unitPriceSnapshot: primary.unitPrice,
          mixRatio: null,
          sortOrder: 0,
        },
      ];
    }
    return [
      {
        materialId: null,
        materialName: "(取込)",
        materialCode: null,
        usedKg: Math.max(0, safeNumber(input.materialUsedKg)),
        unitPriceSnapshot: fallbackUnitCostPerKg,
        mixRatio: null,
        sortOrder: 0,
      },
    ];
  }

  // 何も無ければ BOM を標準使用量(quantityPerUnit × 生産数)で自動展開。
  return bom.map((b, index) => ({
    materialId: b.itemId,
    materialName: b.itemName,
    materialCode: null,
    usedKg: Math.max(0, b.quantityPerUnit * (input.productionQty ?? 0)),
    unitPriceSnapshot: b.unitPrice,
    mixRatio: null,
    sortOrder: index,
  }));
}

// 日報蓄積(B)が実績の正になったため、A系統(DailyReport)の「予定→完了」を肩代わりする。
// 同一(商品×生産日)の未完了予定を completed にし、在庫計算層で PLANNED 予約を実績で置換させる
// (inventory.ts の supersededPlanIds 機構)。これで予定予約と実績の二重計上を防ぐ。
async function completeMatchingPlans(tx: Prisma.TransactionClient, productId: string, reportDate: Date) {
  // 生産日(同日)で一致させる。plan.date に時刻成分があっても拾えるよう [日始, 翌日) で絞る。
  const dayEnd = new Date(reportDate);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  await tx.productionPlan.updateMany({
    where: { productId, date: { gte: reportDate, lt: dayEnd }, status: { in: ["draft", "confirmed"] } },
    data: { status: "completed" },
  });
}

function materialChildData(m: ResolvedMaterial) {
  return {
    materialId: m.materialId,
    materialName: m.materialName,
    materialCode: m.materialCode,
    usedKg: m.usedKg,
    unitPriceSnapshot: m.unitPriceSnapshot,
    mixRatio: m.mixRatio,
    sortOrder: m.sortOrder,
  };
}

async function resolveProductMatch(productId?: string | null, productName?: string | null): Promise<ProductMatch> {
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { aliases: true },
    });
    if (!product) throw new HttpError(400, "product_not_found");
    const name = normalizeProductName(productName) || product.displayName || product.officialName;
    return {
      product,
      productName: name,
      normalizedProductName: normalizeForSearch(name),
      productMatchStatus: "product_id",
    };
  }

  const name = normalizeProductName(productName);
  if (!name) throw new HttpError(400, "product_required");

  const normalized = normalizeForSearch(name);
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { aliases: true },
    orderBy: { productCode: "asc" },
  });

  const exact = products.find((product) =>
    [product.officialName, product.displayName].some((value) => normalizeForSearch(value) === normalized),
  );
  if (exact) return matchedProduct(exact, name, normalized, "exact");

  const alias = products.find((product) =>
    product.aliases.some((a) => normalizeForSearch(a.aliasName) === normalized),
  );
  if (alias) return matchedProduct(alias, name, normalized, "alias");

  const fuzzy = products.find((product) =>
    [product.officialName, product.displayName, ...product.aliases.map((a) => a.aliasName)].some((value) => {
      const n = normalizeForSearch(value);
      return n.includes(normalized) || normalized.includes(n);
    }),
  );
  if (fuzzy) return matchedProduct(fuzzy, name, normalized, "fuzzy");

  return {
    product: null,
    productName: name,
    normalizedProductName: normalized,
    productMatchStatus: "unmatched",
  };
}

function matchedProduct(
  product: ProductWithAliases,
  productName: string,
  normalizedProductName: string,
  productMatchStatus: ProductMatch["productMatchStatus"],
): ProductMatch {
  return { product, productName, normalizedProductName, productMatchStatus };
}

export async function loadProductDailyReportSnapshots(productId: string, reportDate: Date) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      bomItems: {
        where: {
          active: true,
          OR: [{ validFrom: null }, { validFrom: { lte: reportDate } }],
          AND: [{ OR: [{ validTo: null }, { validTo: { gt: reportDate } }] }],
        },
      },
    },
  });
  if (!product) return emptySnapshots();

  const rawItems = product.bomItems.filter((item) => item.itemType === "raw_material");
  const packageItems = product.bomItems.filter((item) => item.itemType === "packaging");
  const [materials, packagingMaterials, unitPrice] = await Promise.all([
    rawItems.length
      ? prisma.material.findMany({ where: { id: { in: rawItems.map((item) => item.itemId) } } })
      : Promise.resolve([]),
    packageItems.length
      ? prisma.packagingMaterial.findMany({ where: { id: { in: packageItems.map((item) => item.itemId) } } })
      : Promise.resolve([]),
    getCurrentBillingUnitPrice(productId, reportDate),
  ]);

  const materialPriceMap = new Map(materials.map((material) => [material.id, material.standardUnitPrice]));
  const packagingPriceMap = new Map(packagingMaterials.map((material) => [material.id, material.standardUnitPrice]));

  return {
    capacityG: product.packSizeG,
    materialUnitCostPerKg: computeMaterialUnitCostPerKg(
      rawItems.map((item) => ({
        unitPrice: materialPriceMap.get(item.itemId) ?? 0,
        quantityPerUnit: item.quantityPerUnit,
        mixRatio: item.mixRatio,
      })),
    ),
    packageCostPerUnit: packageItems.reduce(
      (acc, item) => acc + item.quantityPerUnit * (1 + (item.lossRate ?? 0)) * (packagingPriceMap.get(item.itemId) ?? 0),
      0,
    ),
    unitPrice,
  };
}

function computeMaterialUnitCostPerKg(
  rows: { unitPrice: number; quantityPerUnit: number; mixRatio: number | null }[],
) {
  if (rows.length === 0) return 0;

  const ratioRows = rows.filter((row) => row.mixRatio != null && row.mixRatio > 0);
  if (ratioRows.length > 0) {
    const totalRatio = ratioRows.reduce((acc, row) => acc + (row.mixRatio ?? 0), 0);
    if (totalRatio <= 0) return 0;
    return ratioRows.reduce((acc, row) => acc + row.unitPrice * ((row.mixRatio ?? 0) / totalRatio), 0);
  }

  const totalQuantity = rows.reduce((acc, row) => acc + row.quantityPerUnit, 0);
  if (totalQuantity <= 0) return rows.reduce((acc, row) => acc + row.unitPrice, 0);
  return rows.reduce((acc, row) => acc + row.unitPrice * (row.quantityPerUnit / totalQuantity), 0);
}

async function resolveLaborFeeRate(laborFeeRateId: string | null | undefined, reportDate: Date) {
  const whereValid = {
    active: true,
    OR: [{ validFrom: null }, { validFrom: { lte: reportDate } }],
    AND: [{ OR: [{ validTo: null }, { validTo: { gt: reportDate } }] }],
  };
  const row = laborFeeRateId
    ? await prisma.laborFeeRate.findFirst({ where: { id: laborFeeRateId, ...whereValid } })
    : await prisma.laborFeeRate.findFirst({
        where: { code: "standard_1200", ...whereValid },
        orderBy: { createdAt: "asc" },
      });
  return {
    id: row?.id ?? null,
    hourlyRate: row?.hourlyRate ?? DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
  };
}

function emptySnapshots() {
  return {
    capacityG: null,
    materialUnitCostPerKg: 0,
    packageCostPerUnit: 0,
    unitPrice: 0,
  };
}

function normalizeProductName(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? (value as number) : 0;
}
