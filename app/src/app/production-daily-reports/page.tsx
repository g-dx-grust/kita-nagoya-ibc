import { prisma } from "@/lib/prisma";
import {
  aggregateProductDailyReports,
  summarizeProductDailyReportTotals,
  type ProductDailyReportSummaryRow,
} from "@/lib/product-daily-report-calculations";
import { loadProductDailyReportSnapshotsForProducts } from "@/lib/product-daily-report-service";
import { matchesQuery } from "@/lib/search";
import ProductReportFilter from "./product-report-filter";
import ProductDailyReportClient, {
  type ProductDailyReportLaborRateOption,
  type ProductDailyReportLabelPhoto,
  type ProductDailyReportMaterialOption,
  type ProductDailyReportProductOption,
  type ProductDailyReportRow,
  type MonthlyLaborFeeRow,
} from "./product-daily-report-client";

export const dynamic = "force-dynamic";

export default async function ProductionDailyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const month = normalizeMonth(sp.month ?? new Date().toISOString().slice(0, 7));
  const productId = sp.productId ?? "";
  const q = (sp.q ?? "").trim();
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const [entries, products, laborRates, materialMaster, bomRows, monthlyLaborFees] = await Promise.all([
    prisma.productionDailyReportEntry.findMany({
      where: {
        active: true,
        reportDate: { gte: monthStart, lt: monthEnd },
        ...(productId ? { productId } : {}),
      },
      include: { product: true, laborFeeRate: true, materials: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ reportDate: "asc" }, { sourceRowNumber: "asc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: { active: true },
      include: { aliases: true },
      orderBy: [{ usedAtKitagoya: "desc" }, { productCode: "asc" }],
    }),
    prisma.laborFeeRate.findMany({
      where: { active: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.material.findMany({
      where: { active: true },
      orderBy: [{ materialCode: "asc" }],
      select: { id: true, materialCode: true, name: true, standardUnitPrice: true, unit: true },
    }),
    prisma.productBomItem.findMany({
      where: { itemType: "raw_material", active: true },
      orderBy: [{ productId: "asc" }],
      select: { productId: true, itemId: true, quantityPerUnit: true },
    }),
    prisma.productMonthlyLaborFee.findMany({
      where: { yearMonth: month },
      include: { product: true },
      orderBy: [{ sampleCount: "desc" }],
    }),
  ]);

  const materialMasterById = new Map(materialMaster.map((m) => [m.id, m]));
  // 商品別の原料BOM(自動表示用)。
  const bomByProduct = new Map<string, { materialId: string; materialName: string; unitPrice: number; quantityPerUnit: number }[]>();
  for (const b of bomRows) {
    const master = materialMasterById.get(b.itemId);
    if (!master) continue;
    const list = bomByProduct.get(b.productId) ?? [];
    list.push({
      materialId: b.itemId,
      materialName: master.name,
      unitPrice: master.standardUnitPrice,
      quantityPerUnit: b.quantityPerUnit,
    });
    bomByProduct.set(b.productId, list);
  }

  const snapshotsByProduct = await loadProductDailyReportSnapshotsForProducts(products, monthStart);
  const productOptions: ProductDailyReportProductOption[] = products.map((product) => {
    const snapshot = snapshotsByProduct.get(product.id) ?? {
      capacityG: product.packSizeG,
      materialUnitCostPerKg: 0,
      packageCostPerUnit: 0,
      unitPrice: 0,
    };
    return {
      id: product.id,
      productCode: product.productCode,
      officialName: product.officialName,
      displayName: product.displayName,
      aliases: product.aliases.map((alias) => alias.aliasName),
      specification: product.specification,
      brandName: product.brandName,
      unit: product.unit,
      capacityG: snapshot.capacityG,
      materialUnitCostPerKg: snapshot.materialUnitCostPerKg,
      packageCostPerUnit: snapshot.packageCostPerUnit,
      unitPrice: snapshot.unitPrice,
      bomMaterials: bomByProduct.get(product.id) ?? [],
    };
  });
  const unitPriceByProduct = new Map(productOptions.map((p) => [p.id, p.unitPrice]));

  const materialOptions: ProductDailyReportMaterialOption[] = materialMaster.map((m) => ({
    id: m.id,
    materialCode: m.materialCode,
    name: m.name,
    standardUnitPrice: m.standardUnitPrice,
    unit: m.unit,
  }));

  const filteredEntries = q
    ? entries.filter((entry) =>
        matchesQuery(q, [
          entry.productName,
          entry.product?.productCode,
          entry.product?.officialName,
          entry.product?.displayName,
          entry.note,
        ]),
      )
    : entries;

  const rows: ProductDailyReportRow[] = filteredEntries.map((entry) => ({
    id: entry.id,
    reportDate: formatDate(entry.reportDate),
    productId: entry.productId,
    productName: entry.productName,
    productCode: entry.product?.productCode ?? null,
    displayName: entry.product?.displayName ?? null,
    officialName: entry.product?.officialName ?? null,
    productMatchStatus: entry.productMatchStatus,
    expiryDate: formatDate(entry.expiryDate),
    startTime: entry.startTime,
    endTime: entry.endTime,
    breakMinutes: entry.breakMinutes,
    workerCount: entry.workerCount,
    productionQty: entry.productionQty,
    materialUsedKg: entry.materialUsedKg,
    materials: entry.materials.map((m) => ({
      materialId: m.materialId,
      materialName: m.materialName,
      usedKg: m.usedKg,
      unitPriceSnapshot: m.unitPriceSnapshot,
    })),
    laborFeeRateId: entry.laborFeeRateId,
    laborFeeRateName: entry.laborFeeRate?.name ?? null,
    note: entry.note,
    approvalStatus: entry.approvalStatus,
    inventoryReflected: entry.inventoryReflected,
    submittedBy: entry.submittedBy,
    approvedAt: entry.approvedAt ? entry.approvedAt.toISOString().slice(0, 16).replace("T", " ") : null,
    approvedBy: entry.approvedBy,
    labelPhotos: parseLabelPhotos(entry.labelPhotosJson),
    capacityGSnapshot: entry.capacityGSnapshot,
    materialUnitCostSnapshot: entry.materialUnitCostSnapshot,
    packageCostPerUnitSnapshot: entry.packageCostPerUnitSnapshot,
    unitPriceSnapshot: entry.unitPriceSnapshot,
    laborHourlyRateSnapshot: entry.laborHourlyRateSnapshot,
    operatingMinutes: entry.operatingMinutes,
    totalOperatingMinutes: entry.totalOperatingMinutes,
    perHourQty: entry.perHourQty,
    perUnitTimeMinutes: entry.perUnitTimeMinutes,
    laborFeePerUnit: entry.laborFeePerUnit,
    bagWeightG: entry.bagWeightG,
    lossRate: entry.lossRate,
    materialCost: entry.materialCost,
    packageCost: entry.packageCost,
    totalCost: entry.totalCost,
    sales: entry.sales,
    profitRate: entry.profitRate,
    calculationWarnings: parseWarnings(entry.calculationWarnings),
  }));

  const approvedEntries = filteredEntries.filter((entry) => entry.approvalStatus === "approved");
  const summaries = aggregateProductDailyReports(
    approvedEntries.map((entry) => ({
      productId: entry.productId,
      productName: entry.product?.displayName || entry.product?.officialName || entry.productName,
      productionQty: entry.productionQty,
      materialUsedKg: entry.materialUsedKg,
      sales: entry.sales,
      profitRate: entry.profitRate,
      lossRate: entry.lossRate,
    })),
  );
  const total: ProductDailyReportSummaryRow = summarizeProductDailyReportTotals(summaries);
  const laborRateOptions: ProductDailyReportLaborRateOption[] = laborRates.map((rate) => ({
    id: rate.id,
    code: rate.code,
    name: rate.name,
    hourlyRate: rate.hourlyRate,
  }));

  const monthlyLaborFeeRows: MonthlyLaborFeeRow[] = monthlyLaborFees.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.product.displayName || row.product.officialName,
    productCode: row.product.productCode,
    perBagLaborFee: row.perBagLaborFee,
    avgPerHourQty: row.avgPerHourQty,
    sampleCount: row.sampleCount,
    status: row.status,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString().slice(0, 10) : null,
    currentUnitPrice: unitPriceByProduct.get(row.productId) ?? 0,
  }));

  return (
    <>
      <h1>日報・商品別集計</h1>
      <p className="section-note">
        1製造の実績(複数原料・賞味期限・時間・生産数)を入力すると、手間賃・原価・売値・利率を自動計算し、
        原料在庫を差引きます。蓄積した実績から月次の1袋手間賃を更新できます。
      </p>

      <form className="panel toolbar" method="GET">
        <label>
          <span>対象月</span>
          <input name="month" type="month" defaultValue={month} />
        </label>
        <label>
          <span>商品</span>
          <ProductReportFilter products={productOptions} initialProductId={productId} />
        </label>
        <label className="filter-search">
          <span>商品検索</span>
          <input name="q" type="search" defaultValue={q} placeholder="商品名・管理コード" />
        </label>
        <button type="submit" className="secondary">
          表示
        </button>
      </form>

      <ProductDailyReportClient
        selectedMonth={month}
        rows={rows}
        summaries={summaries}
        total={total}
        products={productOptions}
        materialOptions={materialOptions}
        laborRates={laborRateOptions}
        monthlyLaborFees={monthlyLaborFeeRows}
      />
    </>
  );
}

function normalizeMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function parseWarnings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseLabelPhotos(value: string): ProductDailyReportLabelPhoto[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: typeof item?.name === "string" ? item.name : "label-photo",
        type: typeof item?.type === "string" ? item.type : null,
        dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
      }))
      .filter((item): item is ProductDailyReportLabelPhoto => item.dataUrl.startsWith("data:image/"));
  } catch {
    return [];
  }
}
