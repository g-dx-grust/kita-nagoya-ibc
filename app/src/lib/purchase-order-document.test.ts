import { describe, expect, it } from "vitest";
import {
  buildDocumentRows,
  renderPurchaseOrderPdf,
  renderPurchaseOrderXlsx,
  type PurchaseOrderDocumentInput,
} from "./purchase-order-document";

const input: PurchaseOrderDocumentInput = {
  purchaseOrder: {
    id: "po_123456789",
    code: "PO-12345678",
    status: "ordered_unconfirmed",
    urgency: "CRITICAL",
    orderedQuantity: 12.5,
    unitPrice: 120,
    shortageDate: new Date("2026-06-02T00:00:00.000Z"),
    recommendedOrderDate: new Date("2026-05-29T00:00:00.000Z"),
    note: "午前着希望",
    createdAt: new Date("2026-05-28T00:00:00.000Z"),
  },
  item: { code: "M-001", name: "テスト原料", unit: "kg" },
  supplier: { name: "北小屋商事", contact: "purchasing@example.test" },
  generatedAt: new Date("2026-05-28T12:00:00.000Z"),
  isProvisional: false,
};

describe("purchase order document", () => {
  it("builds Japanese document rows with amount and urgency labels", () => {
    const rows = buildDocumentRows(input);

    expect(rows.title).toBe("発注書");
    expect(rows.header).toContainEqual({ label: "仕入先名", value: "北小屋商事" });
    expect(rows.header).toContainEqual({ label: "緊急度", value: "緊急" });
    expect(rows.itemTable.rows[0]).toEqual(["M-001", "テスト原料", "12.5", "kg", "120", "1500"]);
    expect(rows.footer).toContainEqual({ label: "備考", value: "午前着希望" });
  });

  it("uses provisional title for draft purchase orders", () => {
    const rows = buildDocumentRows({ ...input, isProvisional: true });

    expect(rows.title).toBe("仮発注書");
  });

  it("omits the case column when casePackQty is unset (raw material kg)", () => {
    const rows = buildDocumentRows(input);

    expect(rows.itemTable.columns).not.toContain("ケース数(ケース)");
    expect(rows.itemTable.columns).toEqual(["品目コード", "品目名", "数量", "単位", "単価", "金額"]);
  });

  it("adds a ceil-ed case column when casePackQty is set (packaging)", () => {
    const rows = buildDocumentRows({
      ...input,
      purchaseOrder: { ...input.purchaseOrder, orderedQuantity: 50 },
      item: { code: "P-001", name: "テスト資材袋", unit: "枚", casePackQty: 24 },
    });

    // 列にケース数が追加され、基本単位の数量列も残っている。
    expect(rows.itemTable.columns).toContain("ケース数(ケース)");
    const caseIdx = rows.itemTable.columns.indexOf("ケース数(ケース)");
    const qtyIdx = rows.itemTable.columns.indexOf("数量");
    const row = rows.itemTable.rows[0];
    // 50 枚 / 24入 = 2.08... → 切り上げ 3 ケース。基本単位 50 はそのまま。
    expect(row[caseIdx]).toBe("3");
    expect(row[qtyIdx]).toBe("50");
    // 単価・金額列はケース列の後ろ。
    expect(rows.itemTable.columns.slice(-2)).toEqual(["単価", "金額"]);
  });

  it("renders xlsx bytes", () => {
    const bytes = renderPurchaseOrderXlsx(input);

    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("renders pdf bytes starting with %PDF for Japanese names without throwing", async () => {
    const bytes = await renderPurchaseOrderPdf(input);
    const header = Buffer.from(bytes.subarray(0, 5)).toString("utf8");

    expect(header).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("renders pdf with a packaging case column without throwing", async () => {
    const bytes = await renderPurchaseOrderPdf({
      ...input,
      purchaseOrder: { ...input.purchaseOrder, orderedQuantity: 600 },
      item: { code: "P-002", name: "テスト資材袋", unit: "袋", casePackQty: 24 },
      supplier: { name: "北小屋商事", contact: "tel:000" },
    });
    const header = Buffer.from(bytes.subarray(0, 5)).toString("utf8");

    expect(header).toBe("%PDF-");
  });
});
