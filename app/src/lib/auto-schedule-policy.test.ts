import { describe, expect, it } from "vitest";
import {
  autoScheduleRoleRank,
  compareAutoScheduleItems,
  sortCapacitiesForProductionType,
  sortUsableCapacitiesForProductionType,
} from "./auto-schedule-policy";

describe("auto schedule policy", () => {
  it("受注生産を在庫生産より先に並べる", () => {
    const rows = [
      { productionType: "stock", productCode: "S", originalIndex: 0 },
      { productionType: "make_to_order", productCode: "O2", schedulePriority: 2, originalIndex: 1 },
      { productionType: "make_to_order", productCode: "O1", schedulePriority: 1, originalIndex: 2 },
    ].sort(compareAutoScheduleItems);

    expect(rows.map((row) => row.productCode)).toEqual(["O1", "O2", "S"]);
  });

  it("受注生産は受注優先の部屋、在庫生産は在庫優先の部屋を選ぶ", () => {
    expect(autoScheduleRoleRank("make_to_order", "ORDER_PRIMARY")).toBeLessThan(
      autoScheduleRoleRank("make_to_order", "STOCK_PRIMARY"),
    );
    expect(autoScheduleRoleRank("stock", "STOCK_PRIMARY")).toBeLessThan(
      autoScheduleRoleRank("stock", "ORDER_PRIMARY"),
    );
  });

  it("同じ商品能力が複数部屋にある場合、商品区分に合う役割だけを候補にする", () => {
    const capacities = [
      { workAreaId: "general", candidatePriority: 1, workArea: { autoScheduleRole: "ORDER_PRIMARY", displayOrder: 1, name: "一般" } },
      { workAreaId: "stock", candidatePriority: 1, workArea: { autoScheduleRole: "STOCK_PRIMARY", displayOrder: 2, name: "在庫" } },
      { workAreaId: "shared", candidatePriority: 1, workArea: { autoScheduleRole: "SHARED", displayOrder: 3, name: "共用" } },
    ];

    expect(sortCapacitiesForProductionType(capacities, "make_to_order").map((c) => c.workAreaId)).toEqual([
      "general",
    ]);
    expect(sortCapacitiesForProductionType(capacities, "stock").map((c) => c.workAreaId)).toEqual(["stock"]);
  });

  it("手動上書き用には除外以外の部屋を役割順に返す", () => {
    const capacities = [
      { workAreaId: "excluded", workArea: { autoScheduleRole: "EXCLUDED", displayOrder: 0, name: "除外" } },
      { workAreaId: "order", workArea: { autoScheduleRole: "ORDER_PRIMARY", displayOrder: 1, name: "受注" } },
      { workAreaId: "stock", workArea: { autoScheduleRole: "STOCK_PRIMARY", displayOrder: 2, name: "在庫" } },
    ];

    expect(sortUsableCapacitiesForProductionType(capacities, "stock").map((c) => c.workAreaId)).toEqual([
      "stock",
      "order",
    ]);
  });
});
