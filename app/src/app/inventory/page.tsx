import type { StockMovement } from "@prisma/client";
import {
  buildMonthlyInventorySheet,
  type MonthlyInventoryMovement,
} from "@/lib/monthly-inventory-sheet";
import {
  buildEditableGrid,
  type EditableGridItem,
  type EditableGridKind,
  type EditableGridMovement,
} from "@/lib/inventory-editable-grid";
import { INVENTORY_LEDGER_STATUS, MANUAL_INVENTORY_SOURCE_TYPE } from "@/lib/inventory-types";
import { prisma } from "@/lib/prisma";
import { InventoryTabs } from "./inventory-tabs";

export const dynamic = "force-dynamic";

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
  const monthEnd = endOfMonth(month);

  const [products, materials, packaging] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { productCode: "asc" },
      select: { id: true, productCode: true, officialName: true, displayName: true, unit: true, casePackQty: true, usedAtKitagoya: true },
    }),
    prisma.material.findMany({
      where: { active: true },
      include: { supplier: true },
      orderBy: { materialCode: "asc" },
    }),
    prisma.packagingMaterial.findMany({
      where: { active: true },
      include: { supplier: true },
      orderBy: { materialCode: "asc" },
    }),
  ]);

  const [productMovements, rawMovements, packagingMovements] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        itemType: "product",
        itemId: { in: products.map((p) => p.id) },
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(monthEnd) },
      },
      orderBy: [{ itemId: "asc" }, { effectiveDate: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: {
        itemType: "raw_material",
        itemId: { in: materials.map((material) => material.id) },
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(monthEnd) },
      },
      orderBy: [{ itemId: "asc" }, { effectiveDate: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: {
        itemType: "packaging",
        itemId: { in: packaging.map((material) => material.id) },
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(monthEnd) },
      },
      orderBy: [{ itemId: "asc" }, { effectiveDate: "asc" }],
    }),
  ]);

  // 商品在庫: 確定在庫トランザクション(期首＋確定生産)から、原料/資材と同じ日次台帳を作る。
  // 入荷=生産入庫(プラス), 使用量=出荷/出庫(マイナス), 残=理論在庫。
  const productSheet = buildMonthlyInventorySheet({
    month,
    items: products.map((p) => ({
      id: p.id,
      code: p.productCode,
      name: p.displayName || p.officialName,
      supplierName: "",
      unit: p.unit,
    })),
    movements: productMovements.map(toSheetMovement),
  });

  const rawSheet = buildMonthlyInventorySheet({
    month,
    items: materials.map((material) => ({
      id: material.id,
      code: material.materialCode,
      name: material.name,
      supplierName: material.supplier?.name ?? "",
      unit: material.unit,
    })),
    movements: rawMovements.map(toSheetMovement),
  });

  const packagingSheet = buildMonthlyInventorySheet({
    month,
    items: packaging.map((material) => ({
      id: material.id,
      code: material.materialCode,
      name: material.name,
      supplierName: material.supplier?.name ?? "",
      unit: material.unit,
    })),
    movements: packagingMovements.map(toSheetMovement),
  });

  const productCases = Object.fromEntries(products.map((p) => [p.id, p.casePackQty]));
  const packagingCases = Object.fromEntries(packaging.map((p) => [p.id, p.casePackQty]));
  const productKitagoya = Object.fromEntries(products.map((p) => [p.id, p.usedAtKitagoya]));

  // Excelライク・セル編集(管理者)用の編集グリッド。auto/手入力(grid)に分けて保持する。
  const productItems: EditableGridItem[] = products.map((p) => ({
    id: p.id,
    code: p.productCode,
    name: p.displayName || p.officialName,
    supplierName: "",
    unit: p.unit,
  }));
  const rawItems: EditableGridItem[] = materials.map((m) => ({
    id: m.id,
    code: m.materialCode,
    name: m.name,
    supplierName: m.supplier?.name ?? "",
    unit: m.unit,
  }));
  const packagingItems: EditableGridItem[] = packaging.map((m) => ({
    id: m.id,
    code: m.materialCode,
    name: m.name,
    supplierName: m.supplier?.name ?? "",
    unit: m.unit,
  }));

  const editableGrids = {
    product: buildEditableGrid({ month, items: productItems, movements: productMovements.map(toGridMovement) }),
    raw_material: buildEditableGrid({ month, items: rawItems, movements: rawMovements.map(toGridMovement) }),
    packaging: buildEditableGrid({ month, items: packagingItems, movements: packagingMovements.map(toGridMovement) }),
  };

  return (
    <>
      <h1>在庫</h1>
      <form className="panel toolbar" method="GET">
        <label>
          <span>対象月</span>
          <input type="month" name="month" defaultValue={month} />
        </label>
        <button type="submit" className="secondary">
          更新
        </button>
      </form>

      <InventoryTabs
        product={productSheet}
        raw={rawSheet}
        packaging={packagingSheet}
        productCases={productCases}
        packagingCases={packagingCases}
        productKitagoya={productKitagoya}
        editableGrids={editableGrids}
      />
    </>
  );
}

function normalizeMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}
