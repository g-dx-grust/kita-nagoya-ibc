import * as XLSX from "xlsx";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial, createTestPurchaseOrder, createTestSupplier } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("PurchaseOrder document generation", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("status=draft の PO で発注書 Excel が出力できる（仮発注）", async () => {
    const order = await createDocumentOrder("draft");
    const response = await documentRequest(order.id, "xlsx");
    const rows = await readWorkbookRows(response);

    expect(response.status).toBe(200);
    expect(rows[0][0]).toBe("仮発注書");
  });

  it("status=ordered_unconfirmed の PO で発注書 Excel が出力できる", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    const response = await documentRequest(order.id, "xlsx");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
  });

  it("status=ordered_unconfirmed の PO で発注書 PDF が出力できる", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    const response = await documentRequest(order.id, "pdf");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("Excel の bytes が妥当（empty でない、Excel header マジックバイト）", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    const response = await documentRequest(order.id, "xlsx");
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("PDF の bytes が妥当（PDF header %PDF-）", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    const response = await documentRequest(order.id, "pdf");
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });

  it("同じ PO で 2 回出力しても副作用なし（冪等）", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    await documentRequest(order.id, "xlsx");
    await documentRequest(order.id, "xlsx");
    const saved = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    const auditCount = await prisma.auditLog.count({
      where: { action: "generate_purchase_order_document", entityId: order.id },
    });

    expect(saved.status).toBe("ordered_unconfirmed");
    expect(auditCount).toBe(2);
  });

  it("仕入先名・品目名・数量・単価がテンプレに正しく差し込まれる", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed");
    const response = await documentRequest(order.id, "xlsx");
    const rows = await readWorkbookRows(response);
    const flat = rows.flat().map(String);

    expect(flat).toContain("テスト仕入先");
    expect(flat).toContain("テスト発注原料");
    expect(flat).toContain("12");
    expect(flat).toContain("250");
  });

  it("status=candidate の PO は出力不可（400 を返す）", async () => {
    const order = await createDocumentOrder("candidate");
    const response = await documentRequest(order.id, "xlsx");

    expect(response.status).toBe(400);
  });

  it("active=false の PO は出力不可", async () => {
    const order = await createDocumentOrder("ordered_unconfirmed", false);
    const response = await documentRequest(order.id, "xlsx");

    expect(response.status).toBe(400);
  });

  async function createDocumentOrder(status: string, active = true) {
    const supplier = await createTestSupplier(prisma, { name: "テスト仕入先" });
    const material = await createTestMaterial(prisma, {
      name: "テスト発注原料",
      materialCode: `DOC-${Math.random().toString(36).slice(2, 8)}`,
      standardUnitPrice: 250,
      supplierId: supplier.id,
      active,
    });
    return createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 12,
      status: status as any,
      supplierId: supplier.id,
      urgency: "CRITICAL",
      shortageDate: new Date("2026-06-03T00:00:00.000Z"),
      recommendedOrderDate: new Date("2026-05-28T00:00:00.000Z"),
    });
  }

  async function documentRequest(id: string, format: "xlsx" | "pdf") {
    const { GET } = await import("@/app/api/purchase-orders/[id]/document/route");
    return GET(new Request(`http://localhost/api/purchase-orders/${id}/document?format=${format}`), {
      params: Promise.resolve({ id }),
    });
  }

  async function readWorkbookRows(response: Response) {
    const bytes = await response.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  }
});
