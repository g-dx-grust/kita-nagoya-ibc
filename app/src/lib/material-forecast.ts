import { prisma } from "./prisma";
import { INVENTORY_LEDGER_STATUS } from "./inventory-types";

export type MaterialItemType = "raw_material" | "packaging";

export type MaterialForecastItem = {
  itemType: MaterialItemType;
  itemId: string;
  itemName: string;
  unit: string;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  safetyStockQuantity: number;
  orderLotQty: number | null;
  minOrderQty: number | null;
};

export type MaterialForecastRequirement = {
  requirementId: string;
  productionPlanId: string;
  date: string;
  sortKey: string;
  itemType: MaterialItemType;
  itemId: string;
  itemName: string;
  unit: string;
  plannedQuantity: number;
};

export type MaterialForecastInbound = {
  date: string;
  itemType: MaterialItemType;
  itemId: string;
  quantity: number;
  status: "confirmed" | "ordered_unconfirmed";
};

export type MaterialShortageType =
  | "none"
  | "hard_shortage"
  | "unconfirmed_dependency"
  | "below_safety";

export type MaterialForecastLine = MaterialForecastRequirement & {
  onHandBefore: number;
  confirmedInboundBefore: number;
  unconfirmedInboundBefore: number;
  confirmedProjectedAfter: number;
  projectedWithUnconfirmedAfter: number;
  /** この時点の安全在庫しきい値(品目マスターの safetyStockQuantity)。 */
  safetyStock: number;
  shortageQuantity: number;
  shortageType: MaterialShortageType;
};

export function buildMaterialForecast(input: {
  requirements: MaterialForecastRequirement[];
  openingByItemKey: Record<string, number>;
  inbounds: MaterialForecastInbound[];
  /** 品目キーごとの安全在庫量。未指定の品目は 0 とみなす。 */
  safetyByItemKey?: Record<string, number>;
}): MaterialForecastLine[] {
  const requirements = [...input.requirements].sort(compareRequirement);
  const inboundsByKey = new Map<string, MaterialForecastInbound[]>();
  for (const inbound of input.inbounds) {
    const key = itemKey(inbound.itemType, inbound.itemId);
    const list = inboundsByKey.get(key) ?? [];
    list.push(inbound);
    inboundsByKey.set(key, list);
  }
  for (const list of inboundsByKey.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const stateByKey = new Map<
    string,
    { confirmed: number; withUnconfirmed: number; inboundIndex: number }
  >();
  const lines: MaterialForecastLine[] = [];

  for (const requirement of requirements) {
    const key = itemKey(requirement.itemType, requirement.itemId);
    const state =
      stateByKey.get(key) ??
      {
        confirmed: input.openingByItemKey[key] ?? 0,
        withUnconfirmed: input.openingByItemKey[key] ?? 0,
        inboundIndex: 0,
      };
    const inbounds = inboundsByKey.get(key) ?? [];
    while (state.inboundIndex < inbounds.length && inbounds[state.inboundIndex].date <= requirement.date) {
      const inbound = inbounds[state.inboundIndex];
      if (inbound.status === "confirmed") {
        state.confirmed += inbound.quantity;
        state.withUnconfirmed += inbound.quantity;
      } else {
        state.withUnconfirmed += inbound.quantity;
      }
      state.inboundIndex += 1;
    }

    const confirmedBefore = state.confirmed;
    const withUnconfirmedBefore = state.withUnconfirmed;
    const safetyStock = input.safetyByItemKey?.[key] ?? 0;
    // 「一定数(安全在庫)を下回る前に発注」: 使用後の確定在庫が安全在庫を割り込む量で不足を測る。
    // effectiveThreshold = この時点の所要量 + 安全在庫。confirmedBefore がこれを下回る分が不足量。
    const effectiveThreshold = requirement.plannedQuantity + safetyStock;
    const shortageQuantity =
      confirmedBefore < effectiveThreshold
        ? round4(effectiveThreshold - confirmedBefore)
        : 0;
    // 在庫不足の重大度を3区分する。
    // hard_shortage : 確定在庫が素の所要量に届かない(=実際に作れない/在庫がマイナスになる)。
    // unconfirmed_dependency : 確定だけでは所要量に届かないが、未確定入荷を含めれば足りる。
    // below_safety : 所要量は確定在庫で満たせるが、使用後に安全在庫を割り込む早期警告。
    let shortageType: MaterialShortageType;
    if (shortageQuantity <= 0) {
      shortageType = "none";
    } else if (confirmedBefore >= requirement.plannedQuantity) {
      // 素の所要量は確定在庫で賄えるが、安全在庫まで含めると不足 → 早期警告。
      shortageType = "below_safety";
    } else if (withUnconfirmedBefore >= requirement.plannedQuantity) {
      shortageType = "unconfirmed_dependency";
    } else {
      shortageType = "hard_shortage";
    }

    state.confirmed -= requirement.plannedQuantity;
    state.withUnconfirmed -= requirement.plannedQuantity;
    stateByKey.set(key, state);

    lines.push({
      ...requirement,
      onHandBefore: round4(confirmedBefore),
      confirmedInboundBefore: round4(Math.max(0, confirmedBefore - (input.openingByItemKey[key] ?? 0))),
      unconfirmedInboundBefore: round4(Math.max(0, withUnconfirmedBefore - confirmedBefore)),
      confirmedProjectedAfter: round4(state.confirmed),
      projectedWithUnconfirmedAfter: round4(state.withUnconfirmed),
      safetyStock: round4(safetyStock),
      shortageQuantity,
      shortageType,
    });
  }

  return lines;
}

export async function refreshCumulativeMaterialRequirements({
  dateFrom,
  dateTo,
}: {
  dateFrom: Date;
  dateTo: Date;
}) {
  const forecast = await loadMaterialForecast({ dateFrom, dateTo });
  if (forecast.lines.length === 0) return forecast;

  await prisma.$transaction(
    forecast.lines.map((line) =>
      prisma.productionPlanRequirement.update({
        where: { id: line.requirementId },
        data: {
          onHandQuantity: line.onHandBefore,
          confirmedInbound: line.confirmedInboundBefore,
          unconfirmedInbound: line.unconfirmedInboundBefore,
          shortageQuantity: line.shortageQuantity,
          shortageType: line.shortageType,
        },
      }),
    ),
  );

  return forecast;
}

export async function loadMaterialForecast({
  dateFrom,
  dateTo,
}: {
  dateFrom: Date;
  dateTo: Date;
}) {
  const [materials, packaging, rawOpenings, packagingOpenings, purchaseOrders, requirements] =
    await Promise.all([
      prisma.material.findMany({ where: { active: true }, include: { supplier: true } }),
      prisma.packagingMaterial.findMany({ where: { active: true }, include: { supplier: true } }),
      prisma.stockMovement.groupBy({
        by: ["itemId"],
        where: {
          itemType: "raw_material",
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          effectiveDate: { lte: dateFrom },
        },
        _sum: { quantity: true },
      }),
      prisma.stockMovement.groupBy({
        by: ["itemId"],
        where: {
          itemType: "packaging",
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          effectiveDate: { lte: dateFrom },
        },
        _sum: { quantity: true },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          itemType: { in: ["raw_material", "packaging"] },
          status: { in: ["confirmed", "ordered_unconfirmed"] },
          OR: [{ expectedArrivalDate: null }, { expectedArrivalDate: { lte: dateTo } }],
        },
      }),
      prisma.productionPlanRequirement.findMany({
        where: {
          productionPlan: {
            date: { gte: dateFrom, lte: dateTo },
            status: { in: ["draft", "confirmed"] },
          },
        },
        include: { productionPlan: true },
      }),
    ]);

  const items: MaterialForecastItem[] = [
    ...materials.map((m) => ({
      itemType: "raw_material" as const,
      itemId: m.id,
      itemName: m.name,
      unit: m.unit,
      supplierId: m.supplierId,
      supplierName: m.supplier?.name ?? null,
      leadTimeDays: m.leadTimeDays,
      safetyStockQuantity: m.safetyStockQuantity,
      orderLotQty: m.orderLotQty,
      minOrderQty: m.minOrderQty,
    })),
    ...packaging.map((m) => ({
      itemType: "packaging" as const,
      itemId: m.id,
      itemName: m.name,
      unit: m.unit,
      supplierId: m.supplierId,
      supplierName: m.supplier?.name ?? null,
      leadTimeDays: m.leadTimeDays,
      safetyStockQuantity: m.safetyStockQuantity,
      orderLotQty: m.orderLotQty,
      minOrderQty: m.minOrderQty,
    })),
  ];

  const safetyByItemKey: Record<string, number> = {};
  for (const item of items) {
    safetyByItemKey[itemKey(item.itemType, item.itemId)] = item.safetyStockQuantity;
  }

  const openingByItemKey: Record<string, number> = {};
  for (const row of rawOpenings) {
    openingByItemKey[itemKey("raw_material", row.itemId)] = row._sum.quantity ?? 0;
  }
  for (const row of packagingOpenings) {
    openingByItemKey[itemKey("packaging", row.itemId)] = row._sum.quantity ?? 0;
  }

  const inbounds: MaterialForecastInbound[] = purchaseOrders.map((po) => ({
    date: toDateKey(po.expectedArrivalDate ?? dateFrom),
    itemType: po.itemType as MaterialItemType,
    itemId: po.itemId,
    quantity: po.confirmedQuantity ?? po.orderedQuantity,
    status: po.status as MaterialForecastInbound["status"],
  }));

  const requirementInputs: MaterialForecastRequirement[] = requirements.map((r) => ({
    requirementId: r.id,
    productionPlanId: r.productionPlanId,
    date: toDateKey(r.productionPlan.date),
    sortKey: `${r.productionPlan.plannedStartTime}#${r.productionPlanId}#${r.id}`,
    itemType: r.itemType as MaterialItemType,
    itemId: r.itemId,
    itemName: r.itemName,
    unit: r.unit,
    plannedQuantity: r.plannedQuantity,
  }));

  return {
    items,
    lines: buildMaterialForecast({
      requirements: requirementInputs,
      openingByItemKey,
      inbounds,
      safetyByItemKey,
    }),
  };
}

export function itemKey(itemType: MaterialItemType, itemId: string) {
  return `${itemType}:${itemId}`;
}

function compareRequirement(a: MaterialForecastRequirement, b: MaterialForecastRequirement) {
  return (
    a.itemType.localeCompare(b.itemType) ||
    a.itemId.localeCompare(b.itemId) ||
    a.date.localeCompare(b.date) ||
    a.sortKey.localeCompare(b.sortKey)
  );
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
