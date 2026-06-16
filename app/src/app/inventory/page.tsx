import type { StockMovement } from "@prisma/client";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import {
  buildMonthlyInventorySheet,
  type MonthlyInventoryMovement,
  type MonthlyInventorySheet,
} from "@/lib/monthly-inventory-sheet";
import {
  buildEditableGrid,
  type EditableGrid,
  type EditableGridItem,
  type EditableGridKind,
  type EditableGridMovement,
} from "@/lib/inventory-editable-grid";
import { INVENTORY_LEDGER_STATUS, MANUAL_INVENTORY_SOURCE_TYPE } from "@/lib/inventory-types";
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

  return (
    <>
      <div className="page-title-row">
        <h1>在庫</h1>
      </div>
      <CollapsiblePanel title="表示条件" summary={`${formatMonthLabel(month)} / ${tabs.find((tab) => tab.key === active)?.label ?? ""}`}>
        <form className="toolbar compact-controls" method="GET">
          <input type="hidden" name="tab" value={active} />
          <label>
            <span>対象月</span>
            <input type="month" name="month" defaultValue={month} />
          </label>
          <button type="submit" className="secondary">
            更新
          </button>
        </form>
      </CollapsiblePanel>

      <InventoryTabs
        active={active}
        tabs={tabs}
        adminMode={adminMode}
        adminModeHref={inventoryTabHref(month, active, { adminMode: !adminMode, productScope })}
        productScopeHref={inventoryTabHref(month, active, {
          adminMode,
          productScope: productScope === "all" ? "kitagoya" : "all",
        })}
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
