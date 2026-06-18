import Link from "next/link";
import { ClipboardCheck, Database, FileUp, PackagePlus, Settings, Table2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import ProductCreateForm from "./product-create-form";
import ProductsMasterTable, { type ProductRow } from "./products-master-table";
import CsvImport from "../csv-import";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, workAreas, bomGroups, capacityGroups, billingGroups] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: {
        aliases: true,
        defaultWorkArea: true,
        capacities: { include: { workArea: true } },
        bomItems: true,
      },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
    // 登録状況バッジ用に「設定有無」だけを1クエリずつ集計する(商品ごとのN回問い合わせを避ける)。
    prisma.productBomItem.groupBy({ by: ["productId"] }),
    prisma.productionCapacity.groupBy({ by: ["productId"] }),
    prisma.billingPrice.groupBy({ by: ["productId"] }),
  ]);

  const bomSet = new Set(bomGroups.map((g) => g.productId));
  const capacitySet = new Set(capacityGroups.map((g) => g.productId));
  const billingSet = new Set(billingGroups.map((g) => g.productId));

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    officialName: p.officialName,
    displayName: p.displayName,
    aliases: p.aliases.map((a) => a.aliasName),
    packSizeG: p.packSizeG,
    casePackQty: p.casePackQty,
    packCount: p.packCount,
    specification: p.specification,
    packCountExpression: p.packCountExpression,
    bundleCount: p.bundleCount,
    brandName: p.brandName,
    bagTrayName: p.bagTrayName,
    cartonName: p.cartonName,
    accessoryName: p.accessoryName,
    sealCount: p.sealCount,
    sourceSheetName: p.sourceSheetName,
    sourceRowNumber: p.sourceRowNumber,
    unit: p.unit,
    productionType: p.productionType,
    forecastMethod: p.forecastMethod,
    category: p.category,
    safetyStockQuantity: p.safetyStockQuantity,
    standardProductionLotSize: p.standardProductionLotSize,
    defaultWorkAreaName: p.defaultWorkArea?.name ?? null,
    bomItemCount: p.bomItems.length,
    capacitySummary: capacitySummary(p.capacities, p.unit),
    billingEnabled: p.billingEnabled,
    usedAtKitagoya: p.usedAtKitagoya,
    hasBom: bomSet.has(p.id),
    hasCapacity: capacitySet.has(p.id),
    hasBilling: billingSet.has(p.id),
    validFromLabel: formatDate(p.validFrom),
    validToLabel: formatDate(p.validTo),
  }));
  const setupSummary = buildProductSetupSummary(rows);
  const nextProductAction =
    setupSummary.missingWorkArea > 0
      ? { label: "標準作業場所を確認", href: "#product-master-list" }
      : setupSummary.missingBom > 0
        ? { label: "レシピ未設定を確認", href: "#product-master-list" }
        : setupSummary.missingCapacity > 0
          ? { label: "能力未設定を確認", href: "#product-master-list" }
          : setupSummary.missingBilling > 0
            ? { label: "手間賃未設定を確認", href: "#product-master-list" }
            : { label: "製品計画へ進む", href: kitagoyaPath("/product-planning") };
  const productMasterFlowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "基本情報から登録",
      href: "#product-create",
      tone: "info",
      Icon: PackagePlus,
    },
    {
      label: "整備対象",
      count: setupSummary.needsActionCount,
      detail: `${setupSummary.readyCount}/${setupSummary.kitagoyaCount} 完了`,
      href: "#product-master-list",
      tone: setupSummary.needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "レシピ",
      count: setupSummary.missingBom,
      detail: "BOM未設定",
      href: "#product-master-list",
      tone: setupSummary.missingBom > 0 ? "warn" : "success",
      Icon: Database,
    },
    {
      label: "能力・手間賃",
      count: setupSummary.missingCapacity + setupSummary.missingBilling,
      detail: `能力 ${setupSummary.missingCapacity} / 手間賃 ${setupSummary.missingBilling}`,
      href: "#product-master-list",
      tone: setupSummary.missingCapacity + setupSummary.missingBilling > 0 ? "warn" : "success",
      Icon: Settings,
    },
    {
      label: "CSV取込",
      count: "取込",
      detail: "商品マスター",
      href: "#product-master-import",
      tone: "info",
      Icon: FileUp,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>商品マスター</h1>
        <div className="page-title-actions">
          <a className="button-link secondary-link" href="#product-create">
            <PackagePlus size={16} aria-hidden="true" />
            新規商品
          </a>
          <a className="button-link secondary-link" href="#product-master-import">
            <FileUp size={16} aria-hidden="true" />
            CSV取り込み
          </a>
          <Link className="button-link" href={kitagoyaPath("/product-planning")}>
            <Table2 size={16} aria-hidden="true" />
            製品計画
          </Link>
        </div>
      </div>

      <div className="product-master-page-command">
        <div className="product-master-page-command-title">
          <span className={`badge ${setupSummary.needsActionCount > 0 ? "warn" : "success"}`}>
            {setupSummary.needsActionCount > 0 ? `整備が必要 ${setupSummary.needsActionCount}` : "整備済み"}
          </span>
          <strong>商品マスター整備フロー</strong>
          <span className="subtext">
            北名古屋 {setupSummary.kitagoyaCount} / 全商品 {setupSummary.totalCount}
          </span>
          <a className="product-master-page-next" href={nextProductAction.href}>
            次: {nextProductAction.label}
          </a>
        </div>
        <div className="product-master-page-checks">
          <span className="badge info">整備済み {setupSummary.readyCount}件</span>
          <span className={`badge ${setupSummary.missingWorkArea > 0 ? "warn" : "success"}`}>
            標準場所 {setupSummary.missingWorkArea}件
          </span>
          <span className={`badge ${setupSummary.missingBom > 0 ? "warn" : "success"}`}>
            レシピ {setupSummary.missingBom}件
          </span>
          <span className={`badge ${setupSummary.missingCapacity > 0 ? "warn" : "success"}`}>
            能力 {setupSummary.missingCapacity}件
          </span>
          <span className={`badge ${setupSummary.missingBilling > 0 ? "warn" : "success"}`}>
            手間賃 {setupSummary.missingBilling}件
          </span>
        </div>
      </div>

      <div className="product-master-flow-grid" aria-label="商品マスター整備フロー">
        {productMasterFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
          <a key={label} className={`product-master-flow-card ${tone}`} href={href}>
            <span>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
            <small>{detail}</small>
          </a>
        ))}
      </div>

      <div className="product-master-summary-grid">
        <div className="metric">
          <div className="metric-label">北名古屋商品</div>
          <div className="metric-value">{setupSummary.kitagoyaCount} 件</div>
          <div className="metric-note">全商品 {setupSummary.totalCount} 件</div>
        </div>
        <div className="metric">
          <div className="metric-label">整備済み</div>
          <div className="metric-value">{setupSummary.readyCount} 件</div>
          <div className="metric-note">レシピ・能力・手間賃・標準場所</div>
        </div>
        <div className="metric">
          <div className="metric-label">未整備</div>
          <div className={`metric-value${setupSummary.needsActionCount > 0 ? " warn-value" : ""}`}>
            {setupSummary.needsActionCount} 件
          </div>
          <div className="metric-note">一覧の未整備のみで確認</div>
        </div>
        <div className="metric">
          <div className="metric-label">請求対象</div>
          <div className="metric-value">{setupSummary.billingEnabledCount} 件</div>
          <div className="metric-note">手間賃未設定 {setupSummary.missingBilling} 件</div>
        </div>
      </div>

      <section id="product-create" className="anchor-offset">
        <ProductCreateForm workAreas={workAreas} />
      </section>
      <section id="product-master-list" className="anchor-offset">
        <ProductsMasterTable products={rows} />
      </section>

      <div id="product-master-import" className="panel after-table anchor-offset">
        <strong>CSV取り込み</strong>
        <CsvImport endpoint={kitagoyaApiPath("/import/products")} templateType="products" />
      </div>
    </>
  );
}

function buildProductSetupSummary(rows: ProductRow[]) {
  const kitagoyaRows = rows.filter((row) => row.usedAtKitagoya);
  const readyRows = kitagoyaRows.filter(
    (row) => row.hasBom && row.hasCapacity && row.hasBilling && Boolean(row.defaultWorkAreaName),
  );
  return {
    totalCount: rows.length,
    kitagoyaCount: kitagoyaRows.length,
    readyCount: readyRows.length,
    needsActionCount: kitagoyaRows.length - readyRows.length,
    missingWorkArea: kitagoyaRows.filter((row) => !row.defaultWorkAreaName).length,
    missingBom: kitagoyaRows.filter((row) => !row.hasBom).length,
    missingCapacity: kitagoyaRows.filter((row) => !row.hasCapacity).length,
    missingBilling: kitagoyaRows.filter((row) => !row.hasBilling).length,
    billingEnabledCount: kitagoyaRows.filter((row) => row.billingEnabled).length,
  };
}

function capacitySummary(
  capacities: { unitsPerPersonHour: number; workArea: { name: string } }[],
  unit: string,
) {
  if (capacities.length === 0) return "未登録";
  const shown = capacities
    .slice(0, 2)
    .map((capacity) => `${capacity.workArea.name} ${formatCapacity(capacity.unitsPerPersonHour)}${unit}/人時`);
  const rest = capacities.length > shown.length ? ` 他${capacities.length - shown.length}件` : "";
  return `${shown.join(" / ")}${rest}`;
}

function formatCapacity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "-";
}
