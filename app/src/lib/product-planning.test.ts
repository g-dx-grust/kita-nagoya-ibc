import { describe, expect, it } from "vitest";
import { computeProductPlanningSuggestions } from "./product-planning";

describe("computeProductPlanningSuggestions", () => {
  it("在庫生産は安全在庫と標準ロットを見て推奨数量を丸める", () => {
    const suggestions = computeProductPlanningSuggestions({
      products: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          safetyStockQuantity: 200,
          standardProductionLotSize: 500,
        },
      ],
      onHandByProductId: { p1: 200 },
      plannedProductionByProductId: { p1: 1000 },
      demands: [{ productId: "p1", dueDate: "2026-05-25", quantity: 1100, demandType: "shipment" }],
    });

    expect(suggestions[0].shortageQuantity).toBe(100);
    expect(suggestions[0].suggestedQuantity).toBe(500);
  });

  it("受注生産は不足分をそのまま提案する", () => {
    const suggestions = computeProductPlanningSuggestions({
      products: [
        {
          productId: "p2",
          productCode: "P002",
          productName: "商品B",
          productionType: "make_to_order",
          unit: "袋",
          safetyStockQuantity: 999,
          standardProductionLotSize: 500,
        },
      ],
      onHandByProductId: {},
      plannedProductionByProductId: {},
      demands: [{ productId: "p2", dueDate: "2026-05-25", quantity: 240, demandType: "order" }],
    });

    expect(suggestions[0].shortageQuantity).toBe(240);
    expect(suggestions[0].suggestedQuantity).toBe(240);
    expect(suggestions[0].shortageType).toBe("hard_shortage");
  });

  it("未確定入荷込みで足りる場合は unconfirmed_dependency を返す", () => {
    const suggestions = computeProductPlanningSuggestions({
      products: [
        {
          productId: "p3",
          productCode: "P003",
          productName: "商品C",
          productionType: "stock",
          unit: "袋",
          safetyStockQuantity: 0,
          standardProductionLotSize: 100,
        },
      ],
      onHandByProductId: { p3: 50 },
      plannedProductionByProductId: {},
      unconfirmedInboundByProductId: { p3: 70 },
      demands: [{ productId: "p3", dueDate: "2026-05-25", quantity: 100, demandType: "shipment" }],
    });

    expect(suggestions[0].shortageQuantity).toBe(50);
    expect(suggestions[0].shortageType).toBe("unconfirmed_dependency");
    expect(suggestions[0].suggestedQuantity).toBe(0);
  });

  it("未確定入荷込みでも足りない場合は hard_shortage を返す", () => {
    const suggestions = computeProductPlanningSuggestions({
      products: [
        {
          productId: "p4",
          productCode: "P004",
          productName: "商品D",
          productionType: "stock",
          unit: "袋",
          safetyStockQuantity: 0,
          standardProductionLotSize: 100,
        },
      ],
      onHandByProductId: { p4: 50 },
      plannedProductionByProductId: {},
      unconfirmedInboundByProductId: { p4: 20 },
      demands: [{ productId: "p4", dueDate: "2026-05-25", quantity: 100, demandType: "shipment" }],
    });

    expect(suggestions[0].shortageQuantity).toBe(50);
    expect(suggestions[0].shortageType).toBe("hard_shortage");
    expect(suggestions[0].suggestedQuantity).toBe(100);
  });
});
