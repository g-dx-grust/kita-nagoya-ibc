import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as TEMPLATE } from "@/app/api/export/master-template/route";
import { POST } from "@/app/api/import/product-monthly-actuals/route";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Product monthly actual CSV import (integration)", () => {
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

  it("imports rows and upserts by product and yearMonth", async () => {
    const product = await createTestProduct(prisma, { productCode: "CSV-MONTHLY-001" });
    const first = [
      "product_code,year_month,actual_quantity,source_type,note",
      "CSV-MONTHLY-001,2025-05,100,import,初回",
    ].join("\n");

    const firstResponse = await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: first }));
    const firstResult = (await firstResponse.json()) as { imported: number; skipped: number; errors: unknown[] };
    expect(firstResult).toMatchObject({ imported: 1, skipped: 0, errors: [] });

    const second = [
      "product_code,year_month,actual_quantity,source_type,note",
      "CSV-MONTHLY-001,2025-05,130,manual,更新",
    ].join("\n");
    await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: second }));

    const rows = await prisma.productMonthlyActual.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      yearMonth: "2025-05",
      actualQuantity: 130,
      sourceType: "manual",
      note: "更新",
    });
  });

  it("skips rows whose product_code is not registered", async () => {
    const csv = [
      "product_code,year_month,actual_quantity,source_type,note",
      "UNKNOWN,2025-05,100,import,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; skipped: number; errors: { row: number; reason: string }[] };

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2, reason: "product_code not found: UNKNOWN" });
  });

  it("rejects invalid year_month", async () => {
    await createTestProduct(prisma, { productCode: "CSV-MONTHLY-002" });
    const csv = [
      "product_code,year_month,actual_quantity,source_type,note",
      "CSV-MONTHLY-002,2025/05,100,import,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; skipped: number; errors: { reason: string }[] };

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]?.reason).toBe("year_month must be YYYY-MM");
  });

  it("rejects negative actual_quantity", async () => {
    await createTestProduct(prisma, { productCode: "CSV-MONTHLY-003" });
    const csv = [
      "product_code,year_month,actual_quantity,source_type,note",
      "CSV-MONTHLY-003,2025-05,-1,import,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; skipped: number; errors: { reason: string }[] };

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]?.reason).toBe("actual_quantity must be a nonnegative number");
  });

  it("writes an audit log for the import action", async () => {
    await createTestProduct(prisma, { productCode: "CSV-MONTHLY-004" });
    const csv = [
      "product_code,year_month,actual_quantity,source_type,note",
      "CSV-MONTHLY-004,2025-05,100,import,",
    ].join("\n");

    await POST(new Request("http://test.local/api/import/product-monthly-actuals", { method: "POST", body: csv }));
    const audit = await prisma.auditLog.findFirst({ where: { action: "import_product_monthly_actuals" } });

    expect(audit).not.toBeNull();
    expect(audit?.entityType).toBe("ProductMonthlyActual");
    expect(audit?.afterJson).toContain('"imported":1');
  });

  it("exports a product monthly actuals CSV template", async () => {
    const response = await TEMPLATE(new Request("http://test.local/api/export/master-template?type=product-monthly-actuals"));
    const header = (await response.text()).replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.split(",");

    expect(header).toEqual(["product_code", "year_month", "actual_quantity", "source_type", "note"]);
  });
});
