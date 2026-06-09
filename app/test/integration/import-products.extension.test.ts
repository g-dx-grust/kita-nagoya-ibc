import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/import/products/route";
import { GET as TEMPLATE } from "@/app/api/export/master-template/route";
import { cleanupAll } from "../helpers/cleanup";
import { createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Product CSV import extension (integration)", () => {
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

  it("imports extension columns and resolves equivalence_group_name", async () => {
    await createTestWorkArea(prisma, { name: "CSV部屋" });
    const group = await prisma.productEquivalenceGroup.create({ data: { name: "CSV統合" } });
    const csv = [
      "product_code,official_name,display_name,production_type,safety_stock_quantity,standard_production_lot_size,unit,pack_size_g,pack_count,category,default_work_area_name,billing_enabled,note,aliases,forecast_method,equivalence_group_name,valid_from,valid_to",
      "CSV001,CSV商品,CSV表示,stock,10,20,袋,50,12,通常,CSV部屋,true,,旧名,YEAR_RATIO,CSV統合,2026-01-01,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/products", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const product = await prisma.product.findUnique({ where: { productCode: "CSV001" } });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(product).toMatchObject({
      forecastMethod: "YEAR_RATIO",
      equivalenceGroupId: group.id,
    });
    expect(product?.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps old CSV files compatible when extension columns are absent", async () => {
    const csv = [
      "product_code,official_name,display_name,production_type,safety_stock_quantity,standard_production_lot_size,unit,pack_size_g,pack_count,category,default_work_area_name,billing_enabled,note,aliases",
      "CSV002,旧CSV商品,,stock,0,0,袋,,,,,true,,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/products", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number };
    const product = await prisma.product.findUnique({ where: { productCode: "CSV002" } });

    expect(result.imported).toBe(1);
    expect(product?.forecastMethod).toBe("MANUAL");
  });

  it("rejects invalid enum rows and warns on unknown equivalence groups", async () => {
    const csv = [
      "product_code,official_name,production_type,forecast_method,equivalence_group_name",
      "CSV_BAD,不正商品,stock,BAD,",
      "CSV_WARN,警告商品,stock,NONE,存在しない統合",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/products", { method: "POST", body: csv }));
    const result = (await response.json()) as {
      imported: number;
      errors: unknown[];
      warnings: unknown[];
    };
    const bad = await prisma.product.findUnique({ where: { productCode: "CSV_BAD" } });
    const warned = await prisma.product.findUnique({ where: { productCode: "CSV_WARN" } });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(bad).toBeNull();
    expect(warned?.equivalenceGroupId).toBeNull();
  });

  it("adds product extension columns to the CSV template tail", async () => {
    const response = await TEMPLATE(new Request("http://test.local/api/export/master-template?type=products"));
    const text = await response.text();
    const header = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.split(",");

    expect(header?.slice(-4)).toEqual([
      "forecast_method",
      "equivalence_group_name",
      "valid_from",
      "valid_to",
    ]);
  });
});
