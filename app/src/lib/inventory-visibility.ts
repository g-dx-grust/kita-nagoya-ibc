import type { Prisma } from "@prisma/client";

import { INVENTORY_LEDGER_STATUS } from "./inventory-types";
import { loadMonthEndInventoryForecast } from "./material-forecast";
import { monthRange, toDateInput } from "./monthly-flow-progress";
import { kitagoyaPath } from "./paths";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "./plan-status";
import { prisma } from "./prisma";

type InventoryVisibilityClient = typeof prisma | Prisma.TransactionClient;

export type InventoryVisibilityItemType = "product" | "raw_material" | "packaging";

export type InventoryVisibilityRow = {
  itemType: InventoryVisibilityItemType;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  supplierName: string | null;
  currentQuantity: number;
  plannedAllocationQuantity: number;
  afterPlannedAllocationQuantity: number;
  confirmedInboundQuantity: number;
  withConfirmedInboundQuantity: number;
  unconfirmedInboundQuantity: number;
  withUnconfirmedInboundQuantity: number;
  monthEndProjectedQuantity: number;
  shortageQuantity: number;
  shortageType: string;
  shortageDate: string | null;
  recommendedAction: string;
  links: {
    stockMovements: string;
    purchaseOrders: string | null;
    productionPlans: string | null;
    dailyReports: string | null;
  };
};

export type InventoryVisibilityDashboard = {
  targetMonth: string;
  asOfDate: string;
  itemType: InventoryVisibilityItemType;
  rows: InventoryVisibilityRow[];
};

export async function loadInventoryVisibilityDashboard({
  targetMonth,
  itemType,
  client = prisma,
}: {
  targetMonth: string;
  itemType: InventoryVisibilityItemType;
  client?: InventoryVisibilityClient;
}): Promise<InventoryVisibilityDashboard> {
  const asOfDate = toDateInput(new Date());
  if (itemType === "product") {
    return {
      targetMonth,
      asOfDate,
      itemType,
      rows: await loadProductRows(targetMonth, asOfDate, client),
    };
  }

  const materialForecast = await loadMonthEndInventoryForecast({ targetMonth });
  const currentByItem = await loadCurrentQuantityByItem(asOfDate, itemType, client);
  const rows = materialForecast.lines
    .filter((line) => line.itemType === itemType)
    .map<InventoryVisibilityRow>((line) => {
      const currentQuantity = currentByItem.get(line.itemId) ?? 0;
      const plannedAllocationQuantity = -Math.abs(line.plannedUsageQuantity);
      const afterPlannedAllocationQuantity = round4(currentQuantity + plannedAllocationQuantity);
      const withConfirmedInboundQuantity = round4(afterPlannedAllocationQuantity + line.confirmedInboundQuantity);
      const withUnconfirmedInboundQuantity = round4(withConfirmedInboundQuantity + line.unconfirmedInboundQuantity);
      return {
        itemType: line.itemType,
        itemId: line.itemId,
        itemCode: "",
        itemName: line.itemName,
        unit: line.unit,
        supplierName: line.supplierName,
        currentQuantity,
        plannedAllocationQuantity,
        afterPlannedAllocationQuantity,
        confirmedInboundQuantity: line.confirmedInboundQuantity,
        withConfirmedInboundQuantity,
        unconfirmedInboundQuantity: line.unconfirmedInboundQuantity,
        withUnconfirmedInboundQuantity,
        monthEndProjectedQuantity: line.confirmedProjectedQuantity,
        shortageQuantity: line.shortageQuantity || line.monthEndShortageQuantity,
        shortageType: line.shortageType !== "none" ? line.shortageType : line.monthEndShortageType,
        shortageDate: line.shortageDate,
        recommendedAction: recommendedMaterialAction(line.shortageType, line.monthEndShortageType),
        links: visibilityLinks(line.itemType, line.itemId, targetMonth),
      };
    });

  return { targetMonth, asOfDate, itemType, rows };
}

async function loadProductRows(
  targetMonth: string,
  asOfDate: string,
  client: InventoryVisibilityClient,
): Promise<InventoryVisibilityRow[]> {
  const { monthStart, monthEnd } = monthRange(targetMonth);
  const products = await client.product.findMany({
    where: { active: true },
    orderBy: { productCode: "asc" },
    select: {
      id: true,
      productCode: true,
      officialName: true,
      displayName: true,
      unit: true,
      safetyStockQuantity: true,
    },
  });
  const productIds = products.map((product) => product.id);
  if (productIds.length === 0) return [];

  const [
    currentRows,
    monthEndConfirmedRows,
    plannedProductionRows,
    openDemandRows,
    fulfilledDemandRows,
  ] = await Promise.all([
    client.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        itemType: "product",
        itemId: { in: productIds },
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(`${asOfDate}T23:59:59.999Z`) },
      },
      _sum: { quantity: true },
    }),
    client.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        itemType: "product",
        itemId: { in: productIds },
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: monthEnd },
      },
      _sum: { quantity: true },
    }),
    client.productionPlan.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        date: { gte: monthStart, lte: monthEnd },
        status: { in: [...PLANNED_PRODUCTION_PLAN_STATUSES] },
      },
      _sum: { plannedQuantity: true },
    }),
    client.productDemand.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        status: { in: ["open", "tentative"] },
        dueDate: { lte: monthEnd },
      },
      _sum: { quantity: true },
    }),
    client.productDemand.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        status: "fulfilled",
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { quantity: true },
    }),
  ]);

  const currentByProduct = new Map(currentRows.map((row) => [row.itemId, row._sum.quantity ?? 0]));
  const monthEndConfirmedByProduct = new Map(monthEndConfirmedRows.map((row) => [row.itemId, row._sum.quantity ?? 0]));
  const plannedByProduct = new Map(plannedProductionRows.map((row) => [row.productId, row._sum.plannedQuantity ?? 0]));
  const demandByProduct = new Map(openDemandRows.map((row) => [row.productId, row._sum.quantity ?? 0]));
  const fulfilledByProduct = new Map(fulfilledDemandRows.map((row) => [row.productId, row._sum.quantity ?? 0]));

  return products.map((product) => {
    const currentQuantity = round4(currentByProduct.get(product.id) ?? 0);
    const plannedProductionQuantity = round4(plannedByProduct.get(product.id) ?? 0);
    const demandQuantity = round4(demandByProduct.get(product.id) ?? 0);
    const plannedAllocationQuantity = round4(plannedProductionQuantity - demandQuantity);
    const afterPlannedAllocationQuantity = round4(currentQuantity + plannedAllocationQuantity);
    const monthEndProjectedQuantity = round4(
      (monthEndConfirmedByProduct.get(product.id) ?? currentQuantity) +
        plannedProductionQuantity -
        demandQuantity,
    );
    const shortageQuantity = round4(Math.max(0, product.safetyStockQuantity - monthEndProjectedQuantity));
    return {
      itemType: "product" as const,
      itemId: product.id,
      itemCode: product.productCode,
      itemName: product.displayName || product.officialName,
      unit: product.unit,
      supplierName: null,
      currentQuantity,
      plannedAllocationQuantity,
      afterPlannedAllocationQuantity,
      confirmedInboundQuantity: 0,
      withConfirmedInboundQuantity: afterPlannedAllocationQuantity,
      unconfirmedInboundQuantity: 0,
      withUnconfirmedInboundQuantity: afterPlannedAllocationQuantity,
      monthEndProjectedQuantity,
      shortageQuantity,
      shortageType: shortageQuantity > 0 ? "below_safety" : "none",
      shortageDate: shortageQuantity > 0 ? toDateInput(monthEnd) : null,
      recommendedAction:
        shortageQuantity > 0
          ? "翌月不足/発注推奨: 製品計画で予定化"
          : fulfilledByProduct.get(product.id)
            ? "日報承認済み"
            : "不足なし",
      links: visibilityLinks("product", product.id, targetMonth),
    };
  });
}

async function loadCurrentQuantityByItem(
  asOfDate: string,
  itemType: InventoryVisibilityItemType,
  client: InventoryVisibilityClient,
) {
  const rows = await client.stockMovement.groupBy({
    by: ["itemId"],
    where: {
      itemType,
      status: INVENTORY_LEDGER_STATUS.CONFIRMED,
      effectiveDate: { lte: new Date(`${asOfDate}T23:59:59.999Z`) },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.itemId, round4(row._sum.quantity ?? 0)]));
}

function visibilityLinks(itemType: InventoryVisibilityItemType, itemId: string, targetMonth: string) {
  const inventoryTab = itemType === "raw_material" ? "raw" : itemType === "packaging" ? "packaging" : "product";
  const dateFrom = `${targetMonth}-01`;
  const { monthEnd } = monthRange(targetMonth);
  const dateTo = toDateInput(monthEnd);
  return {
    stockMovements: kitagoyaPath(`/inventory?month=${targetMonth}&tab=${inventoryTab}&itemId=${itemId}`),
    purchaseOrders:
      itemType === "product"
        ? null
        : kitagoyaPath(`/purchases?targetMonth=${targetMonth}&itemType=${itemType}&itemId=${itemId}#purchase-orders`),
    productionPlans: kitagoyaPath(`/production-plans?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    dailyReports: kitagoyaPath(`/production-daily-reports?month=${targetMonth}`),
  };
}

function recommendedMaterialAction(shortageType: string, monthEndShortageType: string) {
  if (shortageType === "hard_shortage" || monthEndShortageType === "hard_shortage") return "翌月不足/発注推奨";
  if (shortageType === "unconfirmed_dependency" || monthEndShortageType === "unconfirmed_dependency") return "入荷予定を確認";
  if (shortageType === "below_safety" || monthEndShortageType === "below_safety") return "安全在庫割れ";
  return "不足なし";
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
