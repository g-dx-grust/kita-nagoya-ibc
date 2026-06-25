import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Plus,
  Table2,
  type LucideIcon,
} from "lucide-react";

import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { prisma } from "@/lib/prisma";
import {
  aggregateProductDailyReports,
  summarizeProductDailyReportTotals,
  type ProductDailyReportSummaryRow,
} from "@/lib/product-daily-report-calculations";
import { loadProductDailyReportSnapshotsForProducts } from "@/lib/product-daily-report-service";
import { kitagoyaPath } from "@/lib/paths";
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
  const initialReviewOnly = sp.review === "1";
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
      include: { product: true, workArea: true, laborFeeRate: true, materials: { orderBy: { sortOrder: "asc" } } },
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
      include: { product: true, workArea: true },
      orderBy: [{ sampleCount: "desc" }, { product: { productCode: "asc" } }],
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
      lossToleranceRate: product.rawMaterialLossToleranceRate,
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
      rawMaterialLossToleranceRate: snapshot.lossToleranceRate,
      materialUnitCostPerKg: snapshot.materialUnitCostPerKg,
      packageCostPerUnit: snapshot.packageCostPerUnit,
      unitPrice: snapshot.unitPrice,
      bomMaterials: bomByProduct.get(product.id) ?? [],
    };
  });
  const unitPriceByProduct = new Map(productOptions.map((p) => [p.id, p.unitPrice]));
  const currentBillingPrices = monthlyLaborFees.length
    ? await prisma.billingPrice.findMany({
        where: {
          productId: { in: Array.from(new Set(monthlyLaborFees.map((row) => row.productId))) },
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        orderBy: [{ productId: "asc" }, { effectiveFrom: "desc" }],
        select: { productId: true, workAreaId: true, unitPrice: true },
      })
    : [];
  const currentUnitPriceByProductArea = new Map<string, number>();
  for (const price of currentBillingPrices) {
    const key = laborFeePriceKey(price.productId, price.workAreaId);
    if (!currentUnitPriceByProductArea.has(key)) currentUnitPriceByProductArea.set(key, price.unitPrice);
  }

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
          entry.workAreaNameSnapshot,
          entry.workArea?.name,
          entry.note,
        ]),
      )
    : entries;

  const rows: ProductDailyReportRow[] = filteredEntries.map((entry) => ({
    id: entry.id,
    reportDate: formatDate(entry.reportDate),
    productId: entry.productId,
    productionPlanId: entry.productionPlanId,
    workAreaId: entry.workAreaId,
    workAreaName: entry.workAreaNameSnapshot ?? entry.workArea?.name ?? null,
    productName: entry.productName,
    productCode: entry.product?.productCode ?? null,
    displayName: entry.product?.displayName ?? null,
    officialName: entry.product?.officialName ?? null,
    productMatchStatus: entry.productMatchStatus,
    expiryDate: formatDate(entry.expiryDate),
    pillowManufacturedDate: formatDate(entry.pillowManufacturedDate),
    pillowExpiryDate: formatDate(entry.pillowExpiryDate),
    packagingLotNumber: entry.packagingLotNumber,
    fixedCode: entry.fixedCode,
    ribbonChangeTime: entry.ribbonChangeTime,
    startTime: entry.startTime,
    endTime: entry.endTime,
    breakMinutes: entry.breakMinutes,
    workerCount: entry.workerCount,
    staffSealerCount: entry.staffSealerCount,
    staffSetCount: entry.staffSetCount,
    staffReportNote: entry.staffReportNote,
    productionQty: entry.productionQty,
    materialUsedKg: entry.materialUsedKg,
    materials: entry.materials.map((m) => ({
      materialId: m.materialId,
      materialName: m.materialName,
      usedKg: m.usedKg,
      lotNumber: m.lotNumber,
      expiryDate: formatDate(m.expiryDate),
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
    preCheckExpiryOk: entry.preCheckExpiryOk,
    preCheckSealerPressureOk: entry.preCheckSealerPressureOk,
    metalDetectorBeforeFe: entry.metalDetectorBeforeFe,
    metalDetectorBeforeSus: entry.metalDetectorBeforeSus,
    metalDetectorAfterFe: entry.metalDetectorAfterFe,
    metalDetectorAfterSus: entry.metalDetectorAfterSus,
    lossRateReasonNote: entry.lossRateReasonNote,
    capacityGSnapshot: entry.capacityGSnapshot,
    lossToleranceRateSnapshot: entry.lossToleranceRateSnapshot,
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
  const pendingApprovalCount = rows.filter((row) => row.approvalStatus === "submitted").length;
  const approvedCount = rows.filter((row) => row.approvalStatus === "approved").length;
  const rejectedCount = rows.filter((row) => row.approvalStatus === "rejected").length;
  const unmatchedCount = rows.filter(
    (row) => row.productMatchStatus === "unmatched" || row.productMatchStatus === "fuzzy",
  ).length;
  const missingPriceCount = rows.filter((row) => row.unitPriceSnapshot <= 0).length;
  const warningCount = rows.filter((row) => row.calculationWarnings.length > 0).length;
  const alertCount = rows.filter(
    (row) =>
      row.approvalStatus === "submitted" ||
      row.approvalStatus === "rejected" ||
      row.productMatchStatus === "unmatched" ||
      row.productMatchStatus === "fuzzy" ||
      row.unitPriceSnapshot <= 0 ||
      row.calculationWarnings.length > 0,
  ).length;
  const laborRateOptions: ProductDailyReportLaborRateOption[] = laborRates.map((rate) => ({
    id: rate.id,
    code: rate.code,
    name: rate.name,
    hourlyRate: rate.hourlyRate,
  }));

  const monthlyLaborFeeRows: MonthlyLaborFeeRow[] = monthlyLaborFees.map((row) => ({
    id: row.id,
    productId: row.productId,
    workAreaId: row.workAreaId,
    workAreaName: row.workAreaNameSnapshot ?? row.workArea?.name ?? null,
    productName: row.product.displayName || row.product.officialName,
    productCode: row.product.productCode,
    perBagLaborFee: row.perBagLaborFee,
    avgPerHourQty: row.avgPerHourQty,
    sampleCount: row.sampleCount,
    status: row.status,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString().slice(0, 10) : null,
    currentUnitPrice:
      currentUnitPriceByProductArea.get(laborFeePriceKey(row.productId, row.workAreaId)) ??
      currentUnitPriceByProductArea.get(laborFeePriceKey(row.productId, null)) ??
      unitPriceByProduct.get(row.productId) ??
      0,
  }));
  const pendingLaborFeeCount = monthlyLaborFeeRows.filter((row) => row.status !== "applied").length;
  const inventoryReflectedCount = rows.filter((row) => row.approvalStatus === "approved" && row.inventoryReflected).length;
  const reviewHref = reviewAnchorHref(month, productId, q);
  const invoiceHref = kitagoyaPath("/invoices");
  const dailyReportTone = alertCount > 0 || pendingLaborFeeCount > 0 ? "warn" : "success";
  const dailyReportNext =
    pendingApprovalCount > 0
      ? { label: "未計上を確認", href: reviewHref }
      : alertCount > 0
        ? { label: "要確認を編集", href: reviewHref }
        : pendingLaborFeeCount > 0
          ? { label: "月次手間賃を反映", href: "#daily-report-review" }
          : rows.length === 0
            ? { label: "日報を入力", href: "#daily-report-review" }
            : { label: "ダッシュボードへ進む", href: dashboardHref(month, productId, q) };
  const dailyReportFlowCards: {
    label: string;
    count: number | string;
    detail: string;
    href: string;
    tone: "info" | "warn" | "danger" | "success";
    Icon: LucideIcon;
  }[] = [
    {
      label: "対象月",
      count: month,
      detail: productId || q ? "絞り込み中" : "全商品",
      href: "#daily-report-filter",
      tone: "info",
      Icon: ClipboardList,
    },
    {
      label: "日報確認",
      count: alertCount,
      detail: `未計上 ${pendingApprovalCount} / 差戻し ${rejectedCount}`,
      href: reviewHref,
      tone: alertCount > 0 ? "warn" : "success",
      Icon: alertCount > 0 ? AlertTriangle : CheckCircle2,
    },
    {
      label: "日報行数",
      count: rows.length,
      detail: `計上済 ${approvedCount} / 在庫反映 ${inventoryReflectedCount}`,
      href: "#daily-report-review",
      tone: rows.length > 0 ? "info" : "warn",
      Icon: Table2,
    },
    {
      label: "手間賃",
      count: pendingLaborFeeCount,
      detail: `算出 ${monthlyLaborFeeRows.length}`,
      href: "#daily-report-review",
      tone: pendingLaborFeeCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "商品別集計",
      count: summaries.length,
      detail: `照合 ${unmatchedCount} / 計算注意 ${warningCount}`,
      href: dashboardHref(month, productId, q),
      tone: unmatchedCount + warningCount > 0 ? "warn" : "success",
      Icon: BarChart3,
    },
    {
      label: "請求CSV",
      count: missingPriceCount,
      detail: missingPriceCount > 0 ? "売値未設定" : "出力準備",
      href: invoiceHref,
      tone: missingPriceCount > 0 ? "warn" : "info",
      Icon: FileText,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>日報・商品別集計</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link gap-2" href={dashboardHref(month, productId, q)}>
            <BarChart3 className="h-4 w-4" />
            ダッシュボード
          </Link>
          <Link className="button-link secondary-link gap-2" href={invoiceHref}>
            <FileText className="h-4 w-4" />
            請求CSV
          </Link>
          <a className="button-link gap-2" href="#daily-report-review">
            <Plus className="h-4 w-4" />
            日報入力
          </a>
        </div>
      </div>

      <CollapsiblePanel
        title="確認・操作"
        summary={`${alertCount > 0 ? `要確認 ${alertCount}件` : pendingLaborFeeCount > 0 ? `未反映 ${pendingLaborFeeCount}件` : "確認済み"} / 日報 ${rows.length.toLocaleString()}件`}
        className="top-flow-accordion"
      >
        <div className={`production-plans-overview-command ${dailyReportTone}`}>
          <div className="production-plans-overview-title">
            {dailyReportTone === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span className={`badge ${dailyReportTone}`}>
              {alertCount > 0 ? `要確認 ${alertCount}件` : pendingLaborFeeCount > 0 ? `未反映 ${pendingLaborFeeCount}件` : "確認済み"}
            </span>
            <strong>{formatMonthLabel(month)} の日報フロー</strong>
            <span className="subtext">
              日報 {rows.length.toLocaleString()}件 / 計上済 {approvedCount.toLocaleString()}件 / 商品別{" "}
              {summaries.length.toLocaleString()}件
            </span>
          </div>
          <Link className="production-plans-overview-next" href={dailyReportNext.href}>
            次: {dailyReportNext.label}
          </Link>
        </div>
        <div className="production-plans-overview-grid" aria-label="日報・商品別集計の確認フロー">
          {dailyReportFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
            <Link key={label} className={`production-plans-overview-card ${tone}`} href={href}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
      </CollapsiblePanel>

      {pendingApprovalCount > 0 && (
        <div className="alert warn top-page-alert">
          <span>
            日報未計上の案件が {pendingApprovalCount} 件あります。内容を確認し、問題なければ「計上」を押してください。
          </span>
          <a className="button-link secondary-link" href="#daily-report-review">
            日報確認へ
          </a>
        </div>
      )}

      <div id="daily-report-filter" className="anchor-offset">
        <CollapsiblePanel
          title={
            <span className="inline-action">
              検索・表示条件
              <HelpTooltip text="1製造の実績、複数原料、賞味期限、時間、生産数を入力すると、手間賃・原価・売値・利率を自動計算し、原料在庫を差し引きます。蓄積実績から月次の1袋手間賃を更新できます。" />
            </span>
          }
          summary={`${formatMonthLabel(month)} / ${productId ? "商品指定あり" : "全商品"}${q ? ` / ${q}` : ""}`}
          open={!!(productId || q)}
        >
          <form className="toolbar compact-controls" method="GET">
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
        </CollapsiblePanel>
      </div>

      <div id="daily-report-review" className="anchor-offset" />
      <ProductDailyReportClient
        selectedMonth={month}
        rows={rows}
        summaries={summaries}
        total={total}
        products={productOptions}
        materialOptions={materialOptions}
        laborRates={laborRateOptions}
        monthlyLaborFees={monthlyLaborFeeRows}
        initialReviewOnly={initialReviewOnly}
      />
    </>
  );
}

function normalizeMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function dashboardHref(month: string, productId: string, q: string) {
  const params = new URLSearchParams({ month });
  if (productId) params.set("productId", productId);
  if (q) params.set("q", q);
  return `${kitagoyaPath("/production-daily-reports/dashboard")}?${params.toString()}`;
}

function reviewAnchorHref(month: string, productId: string, q: string) {
  const params = new URLSearchParams({ month, review: "1" });
  if (productId) params.set("productId", productId);
  if (q) params.set("q", q);
  return `${kitagoyaPath("/production-daily-reports")}?${params.toString()}#daily-report-review`;
}

function laborFeePriceKey(productId: string, workAreaId: string | null) {
  return `${productId}|${workAreaId ?? "unassigned"}`;
}

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  return `${year}年 ${monthPart}月`;
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
