import { describe, expect, it } from "vitest";
import {
  aggregateMonthlySuggestions,
  computeMonthlyProductionSchedule,
  spreadMonthlyStockSuggestions,
  type MonthlyProductionSuggestion,
  type MonthlyPlanningProduct,
} from "./monthly-production-schedule";

const stockProduct: MonthlyPlanningProduct = {
  productId: "p1",
  productCode: "P001",
  productName: "在庫商品",
  productionType: "stock",
  unit: "袋",
  safetyStockQuantity: 200,
  standardProductionLotSize: 500,
};

describe("computeMonthlyProductionSchedule", () => {
  it("現在庫、需要、安全在庫を見て不足日の前に月間生産候補を置く", () => {
    const result = computeMonthlyProductionSchedule({
      products: [stockProduct],
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      productionLeadDays: 2,
      onHandByProductId: { p1: 300 },
      demands: [{ productId: "p1", dueDate: "2026-05-10", quantity: 400, demandType: "shipment" }],
      existingProductions: [],
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      scheduleDate: "2026-05-08",
      dueDate: "2026-05-10",
      shortageQuantity: 300,
      suggestedQuantity: 500,
      projectedOnHandAfterSuggestion: 400,
    });
  });

  it("日報確定後の製品入庫などで現在庫が足りていれば候補を出さない", () => {
    const result = computeMonthlyProductionSchedule({
      products: [stockProduct],
      dateFrom: "2026-05-21",
      dateTo: "2026-05-31",
      onHandByProductId: { p1: 900 },
      demands: [{ productId: "p1", dueDate: "2026-05-25", quantity: 500, demandType: "shipment" }],
      existingProductions: [],
    });

    expect(result.suggestions).toHaveLength(0);
    expect(result.productSummaries[0].endingProjectedOnHandQuantity).toBe(400);
  });

  it("既存の未完了生産予定を加味して追加候補を減らす", () => {
    const result = computeMonthlyProductionSchedule({
      products: [stockProduct],
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      onHandByProductId: { p1: 200 },
      demands: [{ productId: "p1", dueDate: "2026-05-20", quantity: 1000, demandType: "shipment" }],
      existingProductions: [{ productId: "p1", date: "2026-05-15", quantity: 500 }],
    });

    expect(result.suggestions[0].shortageQuantity).toBe(500);
    expect(result.suggestions[0].suggestedQuantity).toBe(500);
  });

  it("受注生産は標準ロットに丸めず不足分をそのまま提案する", () => {
    const result = computeMonthlyProductionSchedule({
      products: [
        {
          ...stockProduct,
          productId: "p2",
          productCode: "P002",
          productName: "受注商品",
          productionType: "make_to_order",
          safetyStockQuantity: 999,
          standardProductionLotSize: 500,
        },
      ],
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      onHandByProductId: {},
      demands: [{ productId: "p2", dueDate: "2026-05-06", quantity: 240, demandType: "order" }],
      existingProductions: [],
    });

    expect(result.suggestions[0].suggestedQuantity).toBe(240);
  });

  it("期限超過の未処理需要は計画開始日に寄せる", () => {
    const result = computeMonthlyProductionSchedule({
      products: [stockProduct],
      dateFrom: "2026-05-21",
      dateTo: "2026-05-31",
      productionLeadDays: 1,
      onHandByProductId: { p1: 0 },
      demands: [{ productId: "p1", dueDate: "2026-05-15", quantity: 100, demandType: "order" }],
      existingProductions: [],
    });

    expect(result.suggestions[0].scheduleDate).toBe("2026-05-21");
    expect(result.suggestions[0].dueDate).toBe("2026-05-21");
  });
});

describe("aggregateMonthlySuggestions", () => {
  it("同じ日・同じ商品の候補を生成単位にまとめる", () => {
    const result = computeMonthlyProductionSchedule({
      products: [stockProduct],
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      productionLeadDays: 0,
      onHandByProductId: { p1: 200 },
      demands: [
        { productId: "p1", dueDate: "2026-05-10", quantity: 400, demandType: "shipment" },
        { productId: "p1", dueDate: "2026-05-10", quantity: 600, demandType: "shipment" },
      ],
      existingProductions: [],
    });

    const aggregated = aggregateMonthlySuggestions(result.suggestions);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].scheduleDate).toBe("2026-05-10");
    expect(aggregated[0].suggestedQuantity).toBe(1000);
  });
});

describe("spreadMonthlyStockSuggestions", () => {
  const baseSuggestion: MonthlyProductionSuggestion = {
    productId: "p1",
    productCode: "P001",
    productName: "在庫商品",
    productionType: "stock",
    unit: "袋",
    dueDate: "2026-05-01",
    scheduleDate: "2026-05-01",
    demandQuantity: 1000,
    existingProductionQuantity: 0,
    safetyStockQuantity: 0,
    startingOnHandQuantity: 0,
    projectedOnHandBeforeDemand: 0,
    projectedOnHandBeforeSuggestion: 0,
    projectedOnHandAfterSuggestion: 1000,
    shortageQuantity: 1000,
    suggestedQuantity: 1000,
    schedulePriority: null,
    reason: "前々月前年比予測",
  };

  it("前年同月の日別実績比率で在庫生産の月間数量を分散する", () => {
    const result = spreadMonthlyStockSuggestions([baseSuggestion], {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      historicalDailyActuals: [
        { productId: "p1", date: "2025-05-02", quantity: 100 },
        { productId: "p1", date: "2025-05-12", quantity: 300 },
        { productId: "p1", date: "2025-05-20", quantity: 100 },
      ],
    });

    expect(result.map((row) => [row.scheduleDate, row.suggestedQuantity])).toEqual([
      ["2026-05-02", 200],
      ["2026-05-12", 600],
      ["2026-05-20", 200],
    ]);
    expect(result.every((row) => row.reason.includes("前年同月の日別実績比率"))).toBe(true);
  });

  it("日別実績がない在庫生産は標準ロット単位で月内へ等間隔に分散する", () => {
    const result = spreadMonthlyStockSuggestions(
      [{ ...baseSuggestion, suggestedQuantity: 1500, shortageQuantity: 1500 }],
      {
        dateFrom: "2026-05-01",
        dateTo: "2026-05-31",
        chunkQuantityByProductId: { p1: 500 },
      },
    );

    expect(result.map((row) => [row.scheduleDate, row.suggestedQuantity])).toEqual([
      ["2026-05-01", 500],
      ["2026-05-11", 500],
      ["2026-05-21", 500],
    ]);
  });

  it("受注生産は指定日に必要数量を作るため分散しない", () => {
    const orderSuggestion = {
      ...baseSuggestion,
      productId: "p2",
      productionType: "make_to_order" as const,
      scheduleDate: "2026-05-10",
      dueDate: "2026-05-10",
      suggestedQuantity: 240,
    };

    const result = spreadMonthlyStockSuggestions([orderSuggestion], {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      chunkQuantityByProductId: { p2: 500 },
    });

    expect(result).toEqual([orderSuggestion]);
  });
});
