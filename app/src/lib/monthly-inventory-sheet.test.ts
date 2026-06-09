import { describe, expect, it } from "vitest";
import { buildMonthlyInventorySheet } from "./monthly-inventory-sheet";

describe("buildMonthlyInventorySheet", () => {
  it("前月繰越、日別入荷、使用量、残、月末残を台帳から組み立てる", () => {
    const sheet = buildMonthlyInventorySheet({
      month: "2026-04",
      items: [{ id: "rm1", code: "RM001", name: "原料A", supplierName: "仕入先A", unit: "kg" }],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-03-31", quantity: 100, movementType: "opening" },
        { itemId: "rm1", effectiveDate: "2026-04-01", quantity: -12.5, movementType: "actual_consume" },
        { itemId: "rm1", effectiveDate: "2026-04-02", quantity: 40, movementType: "inbound" },
        { itemId: "rm1", effectiveDate: "2026-04-30", quantity: -7.5, movementType: "actual_consume" },
      ],
    });

    const row = sheet.rows[0];
    expect(row.openingQuantity).toBe(100);
    expect(row.days[0]).toMatchObject({
      date: "2026-04-01",
      usageQuantity: 12.5,
      inboundQuantity: 0,
      balanceQuantity: 87.5,
    });
    expect(row.days[1]).toMatchObject({
      date: "2026-04-02",
      usageQuantity: 0,
      inboundQuantity: 40,
      balanceQuantity: 127.5,
    });
    expect(row.usageTotalQuantity).toBe(20);
    expect(row.inboundTotalQuantity).toBe(40);
    expect(row.monthEndQuantity).toBe(120);
  });

  it("対象月より後の台帳は月次表に含めない", () => {
    const sheet = buildMonthlyInventorySheet({
      month: "2026-04",
      items: [{ id: "rm1", code: "RM001", name: "原料A", unit: "kg" }],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-04-30", quantity: 10 },
        { itemId: "rm1", effectiveDate: "2026-05-01", quantity: 999 },
      ],
    });

    expect(sheet.rows[0].monthEndQuantity).toBe(10);
  });

  it("入庫の賞味期限・出荷期限を該当日のセルに反映する", () => {
    const sheet = buildMonthlyInventorySheet({
      month: "2026-04",
      items: [{ id: "rm1", code: "RM001", name: "原料A", unit: "kg" }],
      movements: [
        {
          itemId: "rm1",
          effectiveDate: "2026-04-02",
          quantity: 40,
          movementType: "inbound",
          expiryDate: "2026-10-01",
          shippingDeadline: "2026-09-20",
        },
      ],
    });

    const cell = sheet.rows[0].days.find((d) => d.date === "2026-04-02");
    expect(cell?.expiryDate).toBe("2026-10-01");
    expect(cell?.shippingDeadline).toBe("2026-09-20");
    // 期限の無い日は null のまま。
    expect(sheet.rows[0].days.find((d) => d.date === "2026-04-01")?.expiryDate).toBeNull();
  });

  it("同日に複数ロットが入ったら最も早い期限を残す", () => {
    const sheet = buildMonthlyInventorySheet({
      month: "2026-04",
      items: [{ id: "rm1", code: "RM001", name: "原料A", unit: "kg" }],
      movements: [
        { itemId: "rm1", effectiveDate: "2026-04-02", quantity: 10, expiryDate: "2026-10-01" },
        { itemId: "rm1", effectiveDate: "2026-04-02", quantity: 10, expiryDate: "2026-08-15" },
      ],
    });

    const cell = sheet.rows[0].days.find((d) => d.date === "2026-04-02");
    expect(cell?.expiryDate).toBe("2026-08-15");
  });
});
