import type { StockMovement } from "@prisma/client";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Eye,
  PackageCheck,
  PencilLine,
  ShoppingCart,
} from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import {
  buildMonthlyInventorySheet,
  type MonthlyInventoryMovement,
  type MonthlyInventorySheet,
  type MonthlyInventorySheetRow,
} from "@/lib/monthly-inventory-sheet";
import {
  buildEditableGrid,
  type EditableGrid,
  type EditableGridItem,
  type EditableGridKind,
  type EditableGridMovement,
} from "@/lib/inventory-editable-grid";
import { INVENTORY_LEDGER_STATUS, MANUAL_INVENTORY_SOURCE_TYPE } from "@/lib/inventory-types";
import { kitagoyaPath } from "@/lib/paths";
import { prisma } from "@/lib/prisma";
import { InventoryTabs, type InventoryTabKey, type InventoryTabMeta } from "./inventory-tabs";
import type { EditableGridItemType } from "./inventory-editable-grid";

export const dynamic = "force-dynamic";

type ActiveInventoryData = {
  title: string;
  sheet: MonthlyInventorySheet;
  itemType: EditableGridItemType;
  caseByItemId?: Record<string, number | null>;
  productScope: "kitagoya" | "all";
  editableGrid: EditableGrid | null;
  secondaryHeader: string;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toSheetMovement(movement: StockMovement): MonthlyInventoryMovement {
  return {
    itemId: movement.itemId,
    effectiveDate: movement.effectiveDate.toISOString().slice(0, 10),
    quantity: movement.quantity,
    movementType: movement.movementType,
    expiryDate: toIsoDate(movement.expiryDate),
    shippingDeadline: toIsoDate(movement.shippingDeadline),
  };
}

// grid管理(セル編集由来)の movement を sourceId から判別する。
// 形式: grid:{itemType}:{itemId}:{date}:{inbound|usage}  /  grid:{itemType}:{itemId}:opening:{YYYY-MM}
function classifyGrid(movement: StockMovement): {
  gridKind: EditableGridKind | null;
  gridMonth: string | null;
} {
  if (movement.sourceType !== MANUAL_INVENTORY_SOURCE_TYPE || !movement.sourceId?.startsWith("grid:")) {
    return { gridKind: null, gridMonth: null };
  }
  const parts = movement.sourceId.split(":");
  if (parts[3] === "opening") return { gridKind: "opening", gridMonth: parts[4] ?? null };
  if (parts[4] === "inbound") return { gridKind: "inbound", gridMonth: null };
  if (parts[4] === "usage") return { gridKind: "usage", gridMonth: null };
  return { gridKind: null, gridMonth: null };
}

function toGridMovement(movement: StockMovement): EditableGridMovement {
  const { gridKind, gridMonth } = classifyGrid(movement);
  return {
    itemId: movement.itemId,
    effectiveDate: movement.effectiveDate.toISOString().slice(0, 10),
    quantity: movement.quantity,
    gridKind,
    gridMonth,
    expiryDate: toIsoDate(movement.expiryDate),
    shippingDeadline: toIsoDate(movement.shippingDeadline),
  };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const month = normalizeMonth(sp.month ?? sp.date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7));
  const active = normalizeTab(sp.tab);
  const productScope = sp.scope === "all" ? "all" : "kitagoya";
  const adminMode = sp.admin === "1";
  const monthEnd = endOfMonth(month);

  const [productCount, rawCount, packagingCount, activeData] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.material.count({ where: { active: true } }),
    prisma.packagingMaterial.count({ where: { active: true } }),
    loadActiveInventoryData(active, month, monthEnd, { adminMode, productScope }),
  ]);

  const tabs: InventoryTabMeta[] = [
    { key: "product", label: "商品", count: productCount, href: inventoryTabHref(month, "product", { adminMode, productScope }) },
    { key: "raw", label: "原料", count: rawCount, href: inventoryTabHref(month, "raw", { adminMode, productScope }) },
    { key: "packaging", label: "資材", count: packagingCount, href: inventoryTabHref(month, "packaging", { adminMode, productScope }) },
  ];
  const activeTabLabel = tabs.find((tab) => tab.key === active)?.label ?? activeData.title.replace("在庫表", "");
  const overview = buildInventoryOverview(activeData.sheet.rows, activeData.itemType);
  const adminModeHref = inventoryTabHref(month, active, { adminMode: !adminMode, productScope });
  const productScopeHref = inventoryTabHref(month, active, {
    adminMode,
    productScope: productScope === "all" ? "kitagoya" : "all",
  });
  const planningHref =
    active === "product"
      ? kitagoyaPath(`/product-planning?dateFrom=${activeData.sheet.dateFrom}&dateTo=${activeData.sheet.dateTo}`)
      : kitagoyaPath("/purchases");
  const planningLabel = active === "product" ? "製品計画" : "発注候補";
  const planningDetail = active === "product" ? "不足商品の予定化" : "原料・資材の発注";
  const nextInventoryAction =
    overview.negativeItemCount > 0
      ? { label: "マイナス在庫を確認", href: "#inventory-review" }
      : overview.missingDeadlineItemCount > 0
        ? { label: "期限未入力を確認", href: "#inventory-review" }
        : overview.needsReviewCount > 0
          ? { label: "要確認を確認", href: "#inventory-review" }
          : overview.movementItemCount > 0
            ? { label: "入出庫を確認", href: "#inventory-review" }
            : { label: `${planningLabel}へ進む`, href: planningHref };
  const inventoryFlowCards = [
    {
      label: "対象月",
      count: formatMonthLabel(month),
      detail: "表示条件",
      href: "#inventory-display-condition",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: activeTabLabel,
      count: activeData.sheet.rows.length,
      detail: activeData.productScope === "all" ? "全品目" : "北名古屋のみ",
      href: "#inventory-review",
      tone: "info",
      Icon: PackageCheck,
    },
    {
      label: "要確認",
      count: overview.needsReviewCount,
      detail: `マイナス ${overview.negativeItemCount}`,
      href: "#inventory-review",
      tone: overview.needsReviewCount > 0 ? "warn" : "success",
      Icon: AlertTriangle,
    },
    {
      label: "手入力",
      count: adminMode ? "編集中" : "閲覧",
      detail: "月初・入荷・使用",
      href: adminMode ? "#inventory-review" : adminModeHref,
      tone: adminMode ? "warn" : "info",
      Icon: PencilLine,
    },
    {
      label: planningLabel,
      count: active === "product" ? overview.negativeItemCount : overview.needsReviewCount,
      detail: planningDetail,
      href: planningHref,
      tone: overview.needsReviewCount > 0 ? "warn" : "success",
      Icon: active === "product" ? ClipboardCheck : ShoppingCart,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>在庫</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={adminModeHref}>
            {adminMode ? <Eye size={16} aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
            {adminMode ? "閲覧モード" : "手入力"}
          </Link>
          <Link className="button-link" href={planningHref}>
            {active === "product" ? (
              <ClipboardCheck size={16} aria-hidden="true" />
            ) : (
              <ShoppingCart size={16} aria-hidden="true" />
            )}
            {planningLabel}
          </Link>
        </div>
      </div>
      <div className="inventory-page-command">
        <div className="inventory-page-command-title">
          <span className={`badge ${overview.needsReviewCount > 0 ? "warn" : "success"}`}>
            {overview.needsReviewCount > 0 ? "確認が必要" : "整備済み"}
          </span>
          <strong>在庫確認フロー</strong>
          <span className="subtext">
            {formatMonthLabel(month)} / {activeTabLabel}
          </span>
          <Link className="inventory-page-next" href={nextInventoryAction.href}>
            次: {nextInventoryAction.label}
          </Link>
        </div>
        <div className="inventory-page-command-checks">
          <span className="badge info">対象 {activeData.sheet.rows.length}品目</span>
          <span className="badge muted">入出庫あり {overview.movementItemCount}品目</span>
          <span className={`badge ${overview.negativeItemCount > 0 ? "danger" : "success"}`}>
            マイナス {overview.negativeItemCount}品目 / {overview.negativeDayCount}日
          </span>
          {activeData.itemType !== "product" && (
            <span className={`badge ${overview.missingDeadlineItemCount > 0 ? "warn" : "success"}`}>
              期限未入力 {overview.missingDeadlineItemCount}品目
            </span>
          )}
        </div>
      </div>
      <div className="inventory-page-flow-grid" aria-label="在庫確認フロー">
        {inventoryFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
          <Link key={label} className={`inventory-page-flow-card ${tone}`} href={href}>
            <span>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
            <small>{detail}</small>
          </Link>
        ))}
      </div>
      <div id="inventory-display-condition" className="anchor-offset">
        <CollapsiblePanel title="表示条件" summary={`${formatMonthLabel(month)} / ${activeTabLabel}`}>
          <form className="toolbar compact-controls" method="GET">
            <input type="hidden" name="tab" value={active} />
            {adminMode && <input type="hidden" name="admin" value="1" />}
            {productScope === "all" && <input type="hidden" name="scope" value="all" />}
            <label>
              <span>対象月</span>
              <input type="month" name="month" defaultValue={month} />
            </label>
            <button type="submit" className="secondary">
              更新
            </button>
          </form>
        </CollapsiblePanel>
      </div>

      <InventoryTabs
        active={active}
        tabs={tabs}
        adminMode={adminMode}
        adminModeHref={adminModeHref}
        productScopeHref={productScopeHref}
        {...activeData}
      />
    </>
  );
}

async function loadActiveInventoryData(
  active: InventoryTabKey,
  month: string,
  monthEnd: string,
  options: { adminMode: boolean; productScope: "kitagoya" | "all" },
): Promise<ActiveInventoryData> {
  if (active === "raw") return loadRawInventory(month, monthEnd, options.adminMode, options.productScope);
  if (active === "packaging") return loadPackagingInventory(month, monthEnd, options.adminMode, options.productScope);
  return loadProductInventory(month, monthEnd, options.adminMode, options.productScope);
}

async function loadProductInventory(
  month: string,
  monthEnd: string,
  adminMode: boolean,
  productScope: "kitagoya" | "all",
): Promise<ActiveInventoryData> {
  const products = await prisma.product.findMany({
    where: { active: true, ...(productScope === "kitagoya" ? { usedAtKitagoya: true } : {}) },
    orderBy: { productCode: "asc" },
    select: {
      id: true,
      productCode: true,
      officialName: true,
      displayName: true,
      unit: true,
      casePackQty: true,
      usedAtKitagoya: true,
    },
  });
  const movements = await loadMovements("product", products.map((p) => p.id), monthEnd);
  const items: EditableGridItem[] = products.map((p) => ({
    id: p.id,
    code: p.productCode,
    name: p.displayName || p.officialName,
    supplierName: "",
    unit: p.unit,
  }));

  return {
    title: "商品在庫表",
    itemType: "product",
    secondaryHeader: "区分",
    productScope,
    caseByItemId: Object.fromEntries(products.map((p) => [p.id, p.casePackQty])),
    sheet: buildMonthlyInventorySheet({
      month,
      items,
      movements: movements.map(toSheetMovement),
    }),
    editableGrid: adminMode
      ? buildEditableGrid({
          month,
          items,
          movements: movements.map(toGridMovement),
        })
      : null,
  };
}

async function loadRawInventory(
  month: string,
  monthEnd: string,
  adminMode: boolean,
  productScope: "kitagoya" | "all",
): Promise<ActiveInventoryData> {
  const materials = await prisma.material.findMany({
    where: { active: true },
    include: { supplier: true },
    orderBy: { materialCode: "asc" },
  });
  const movements = await loadMovements("raw_material", materials.map((m) => m.id), monthEnd);
  const items: EditableGridItem[] = materials.map((m) => ({
    id: m.id,
    code: m.materialCode,
    name: m.name,
    supplierName: m.supplier?.name ?? "",
    unit: m.unit,
  }));

  return {
    title: "原料在庫表",
    itemType: "raw_material",
    secondaryHeader: "仕入先",
    productScope,
    sheet: buildMonthlyInventorySheet({
      month,
      items,
      movements: movements.map(toSheetMovement),
    }),
    editableGrid: adminMode
      ? buildEditableGrid({
          month,
          items,
          movements: movements.map(toGridMovement),
        })
      : null,
  };
}

async function loadPackagingInventory(
  month: string,
  monthEnd: string,
  adminMode: boolean,
  productScope: "kitagoya" | "all",
): Promise<ActiveInventoryData> {
  const packaging = await prisma.packagingMaterial.findMany({
    where: { active: true },
    include: { supplier: true },
    orderBy: { materialCode: "asc" },
  });
  const movements = await loadMovements("packaging", packaging.map((m) => m.id), monthEnd);
  const items: EditableGridItem[] = packaging.map((m) => ({
    id: m.id,
    code: m.materialCode,
    name: m.name,
    supplierName: m.supplier?.name ?? "",
    unit: m.unit,
  }));

  return {
    title: "資材在庫表",
    itemType: "packaging",
    secondaryHeader: "仕入先",
    productScope,
    caseByItemId: Object.fromEntries(packaging.map((p) => [p.id, p.casePackQty])),
    sheet: buildMonthlyInventorySheet({
      month,
      items,
      movements: movements.map(toSheetMovement),
    }),
    editableGrid: adminMode
      ? buildEditableGrid({
          month,
          items,
          movements: movements.map(toGridMovement),
        })
      : null,
  };
}

async function loadMovements(itemType: EditableGridItemType, itemIds: string[], monthEnd: string) {
  if (itemIds.length === 0) return [];
  return prisma.stockMovement.findMany({
    where: {
      itemType,
      itemId: { in: itemIds },
      status: INVENTORY_LEDGER_STATUS.CONFIRMED,
      effectiveDate: { lte: new Date(monthEnd) },
    },
    orderBy: [{ itemId: "asc" }, { effectiveDate: "asc" }],
  });
}

function normalizeTab(value: string | undefined): InventoryTabKey {
  if (value === "raw" || value === "packaging") return value;
  return "product";
}

function inventoryTabHref(
  month: string,
  tab: InventoryTabKey,
  options: { adminMode: boolean; productScope: "kitagoya" | "all" },
) {
  const params = new URLSearchParams({ month, tab });
  if (options.adminMode) params.set("admin", "1");
  if (options.productScope === "all") params.set("scope", "all");
  return `?${params.toString()}`;
}

function normalizeMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  return `${year}年 ${monthPart}月`;
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function buildInventoryOverview(rows: MonthlyInventorySheetRow[], itemType: EditableGridItemType) {
  return rows.reduce(
    (summary, row) => {
      const negativeDays = row.days.filter((day) => day.balanceQuantity < 0).length;
      const missingDeadlineDays =
        itemType === "product"
          ? 0
          : row.days.filter((day) => day.inboundQuantity > 0 && (!day.expiryDate || !day.shippingDeadline)).length;
      const hasMovement = row.usageTotalQuantity !== 0 || row.inboundTotalQuantity !== 0;
      const needsReview = row.monthEndQuantity < 0 || negativeDays > 0 || missingDeadlineDays > 0;

      return {
        needsReviewCount: summary.needsReviewCount + (needsReview ? 1 : 0),
        movementItemCount: summary.movementItemCount + (hasMovement ? 1 : 0),
        negativeItemCount: summary.negativeItemCount + (row.monthEndQuantity < 0 || negativeDays > 0 ? 1 : 0),
        negativeDayCount: summary.negativeDayCount + negativeDays,
        missingDeadlineItemCount: summary.missingDeadlineItemCount + (missingDeadlineDays > 0 ? 1 : 0),
      };
    },
    {
      needsReviewCount: 0,
      movementItemCount: 0,
      negativeItemCount: 0,
      negativeDayCount: 0,
      missingDeadlineItemCount: 0,
    },
  );
}
