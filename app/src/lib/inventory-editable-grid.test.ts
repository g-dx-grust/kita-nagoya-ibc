import { describe, expect, it } from "vitest";
import {
  buildEditableGrid,
  computeGridBalances,
  openingEffectiveDate,
} from "./inventory-editable-grid";

const item = { id: "rm1", code: "RM001", name: "原料A", supplierName: "仕入先A", unit: "kg" };

describe("buildEditableGrid", () => {
  it("自動movementを符号で入荷/使用に振り分ける", () => {
    const grid = buildEditableGrid({
      month: "2026-04",
      items: [item],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-03-31", quantity: 100 }, // 自動繰越
        { itemId: "rm1", effectiveDate: "2026-04-02", quantity: -12.5 }, // 自動使用
        { itemId: "rm1", effectiveDate: "2026-04-03", quantity: 40 }, // 自動入荷
      ],
    });
    const row = grid.rows[0];
    expect(row.openingAuto).toBe(100);
    expect(row.gridOpening).toBe(0);
    const d2 = row.days.find((d) => d.date === "2026-04-02")!;
    expect(d2.autoUsage).toBe(12.5);
    const d3 = row.days.find((d) => d.date === "2026-04-03")!;
    expect(d3.autoInbound).toBe(40);
  });

  it("grid入荷/使用と賞味期限・出荷期限を編集初期値として読み込む", () => {
    const grid = buildEditableGrid({
      month: "2026-04",
      items: [item],
      movements: [
        {
          itemId: "rm1",
          effectiveDate: "2026-04-05",
          quantity: 30,
          gridKind: "inbound",
          expiryDate: "2026-10-01",
          shippingDeadline: "2026-09-20",
        },
        { itemId: "rm1", effectiveDate: "2026-04-06", quantity: -8, gridKind: "usage" },
      ],
    });
    const row = grid.rows[0];
    const d5 = row.days.find((d) => d.date === "2026-04-05")!;
    expect(d5.gridInbound).toBe(30);
    expect(d5.gridExpiry).toBe("2026-10-01");
    expect(d5.gridShipping).toBe("2026-09-20");
    const d6 = row.days.find((d) => d.date === "2026-04-06")!;
    expect(d6.gridUsage).toBe(8); // 使用量は正の量で保持
  });

  it("当月のgrid期首は gridOpening、他月のgrid期首や自動は openingAuto", () => {
    const grid = buildEditableGrid({
      month: "2026-04",
      items: [item],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-03-31", quantity: 50, gridKind: "opening", gridMonth: "2026-04" },
        { itemId: "rm1", effectiveDate: "2026-02-28", quantity: 20, gridKind: "opening", gridMonth: "2026-03" },
        { itemId: "rm1", effectiveDate: "2026-03-15", quantity: 5 }, // 自動繰越
      ],
    });
    const row = grid.rows[0];
    expect(row.gridOpening).toBe(50);
    expect(row.openingAuto).toBe(25); // 20(他月grid期首) + 5(自動)
  });

  it("対象月より後のmovementは含めない", () => {
    const grid = buildEditableGrid({
      month: "2026-04",
      items: [item],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-04-30", quantity: 10, gridKind: "inbound" },
        { itemId: "rm1", effectiveDate: "2026-05-01", quantity: 999, gridKind: "inbound" },
      ],
    });
    const d = grid.rows[0].days.find((x) => x.date === "2026-04-30")!;
    expect(d.gridInbound).toBe(10);
    expect(grid.rows[0].days.every((x) => x.date <= "2026-04-30")).toBe(true);
  });
});

describe("computeGridBalances", () => {
  it("auto+grid の入荷・使用から残と合計を積み上げる", () => {
    const r = computeGridBalances({
      openingAuto: 100,
      gridOpening: 0,
      days: [
        { autoInbound: 0, autoUsage: 12.5, gridInbound: 0, gridUsage: 0 },
        { autoInbound: 40, autoUsage: 0, gridInbound: 10, gridUsage: 0 },
        { autoInbound: 0, autoUsage: 0, gridInbound: 0, gridUsage: 7.5 },
      ],
    });
    expect(r.opening).toBe(100);
    expect(r.balances).toEqual([87.5, 137.5, 130]);
    expect(r.monthEnd).toBe(130);
    expect(r.inboundTotal).toBe(50);
    expect(r.usageTotal).toBe(20);
  });

  it("gridOpening は openingAuto に加算される(加算オーバーレイ)", () => {
    const r = computeGridBalances({
      openingAuto: 30,
      gridOpening: 70,
      days: [{ autoInbound: 0, autoUsage: 0, gridInbound: 0, gridUsage: 0 }],
    });
    expect(r.opening).toBe(100);
    expect(r.monthEnd).toBe(100);
  });

  it("日が無いときは月末残=期首", () => {
    const r = computeGridBalances({ openingAuto: 5, gridOpening: 0, days: [] });
    expect(r.monthEnd).toBe(5);
    expect(r.balances).toEqual([]);
  });
});

describe("openingEffectiveDate", () => {
  it("対象月の前日(前月末)を返す", () => {
    expect(openingEffectiveDate("2026-04")).toBe("2026-03-31");
    expect(openingEffectiveDate("2026-01")).toBe("2025-12-31");
  });
});
