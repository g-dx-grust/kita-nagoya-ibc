export type ProductPlanningProduct = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order" | "both";
  unit: string;
  safetyStockQuantity: number;
  standardProductionLotSize: number;
};

export type ProductPlanningDemand = {
  productId: string;
  dueDate: string;
  quantity: number;
  demandType: "order" | "shipment" | "forecast";
};

export type ProductPlanningSuggestion = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: ProductPlanningProduct["productionType"];
  unit: string;
  onHandQuantity: number;
  confirmedInboundQuantity: number;
  unconfirmedInboundQuantity: number;
  plannedProductionQuantity: number;
  openDemandQuantity: number;
  safetyStockQuantity: number;
  shortageQuantity: number;
  shortageType: ProductShortageType;
  suggestedQuantity: number;
  reason: string;
};

export type ProductShortageType = "none" | "hard_shortage" | "unconfirmed_dependency";

export function computeProductPlanningSuggestions(input: {
  products: ProductPlanningProduct[];
  onHandByProductId: Record<string, number>;
  plannedProductionByProductId: Record<string, number>;
  confirmedInboundByProductId?: Record<string, number>;
  unconfirmedInboundByProductId?: Record<string, number>;
  demands: ProductPlanningDemand[];
}): ProductPlanningSuggestion[] {
  const demandByProduct = new Map<string, number>();
  for (const demand of input.demands) {
    demandByProduct.set(
      demand.productId,
      (demandByProduct.get(demand.productId) ?? 0) + demand.quantity,
    );
  }

  return input.products
    .map((product) => {
      const onHand = input.onHandByProductId[product.productId] ?? 0;
      const planned = input.plannedProductionByProductId[product.productId] ?? 0;
      const confirmedInbound = input.confirmedInboundByProductId?.[product.productId] ?? 0;
      const unconfirmedInbound = input.unconfirmedInboundByProductId?.[product.productId] ?? 0;
      const demand = demandByProduct.get(product.productId) ?? 0;
      const targetAfterDemand =
        product.productionType === "make_to_order" ? 0 : product.safetyStockQuantity;
      const targetQuantity = demand + targetAfterDemand;
      const confirmedAvailable = onHand + planned + confirmedInbound;
      const withUnconfirmed = confirmedAvailable + unconfirmedInbound;
      const shortage = Math.max(0, targetQuantity - confirmedAvailable);
      const shortageType: ProductShortageType =
        shortage <= 0
          ? "none"
          : withUnconfirmed >= targetQuantity
            ? "unconfirmed_dependency"
            : "hard_shortage";
      const suggested =
        shortage <= 0 || shortageType === "unconfirmed_dependency"
          ? 0
          : product.productionType === "make_to_order"
            ? round4(shortage)
            : roundUpToLot(shortage, product.standardProductionLotSize);

      return {
        productId: product.productId,
        productCode: product.productCode,
        productName: product.productName,
        productionType: product.productionType,
        unit: product.unit,
        onHandQuantity: round4(onHand),
        confirmedInboundQuantity: round4(confirmedInbound),
        unconfirmedInboundQuantity: round4(unconfirmedInbound),
        plannedProductionQuantity: round4(planned),
        openDemandQuantity: round4(demand),
        safetyStockQuantity: round4(product.safetyStockQuantity),
        shortageQuantity: round4(shortage),
        shortageType,
        suggestedQuantity: round4(suggested),
        reason:
          shortage <= 0
            ? "在庫と予定生産で不足なし"
            : shortageType === "unconfirmed_dependency"
              ? "未確定入荷込みなら不足なし"
            : product.productionType === "make_to_order"
              ? "受注生産のため不足分をそのまま提案"
              : product.standardProductionLotSize > 0
                ? `在庫生産のため標準ロット ${product.standardProductionLotSize}${product.unit} 単位で提案`
                : "在庫生産のため不足分を提案",
      };
    })
    .filter((suggestion) => suggestion.suggestedQuantity > 0 || suggestion.shortageType !== "none")
    .sort((a, b) => a.productCode.localeCompare(b.productCode, "ja"));
}

function roundUpToLot(quantity: number, lotSize: number) {
  if (lotSize <= 0) return round4(quantity);
  return Math.ceil(quantity / lotSize) * lotSize;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
