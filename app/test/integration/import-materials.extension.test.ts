import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/import/materials/route";
import { GET as TEMPLATE } from "@/app/api/export/master-template/route";
import { cleanupAll } from "../helpers/cleanup";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Material CSV import extension (integration)", () => {
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

  it("imports material extension columns", async () => {
    const csv = [
      "material_code,name,unit,standard_unit_price,lead_time_days,shelf_life_managed,note,safety_stock_quantity,order_lot_qty,min_order_qty,valid_from,valid_to",
      "RMCSV001,CSV原料,kg,100,3,false,,5,10,20,2026-01-01,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/materials", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const material = await prisma.material.findUnique({ where: { materialCode: "RMCSV001" } });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(material).toMatchObject({
      safetyStockQuantity: 5,
      orderLotQty: 10,
      minOrderQty: 20,
    });
    expect(material?.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps old material CSV files compatible", async () => {
    const csv = [
      "material_code,name,unit,standard_unit_price,lead_time_days,shelf_life_managed,note",
      "RMCSV002,旧CSV原料,kg,100,3,false,",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/materials", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number };
    const material = await prisma.material.findUnique({ where: { materialCode: "RMCSV002" } });

    expect(result.imported).toBe(1);
    expect(material?.safetyStockQuantity).toBe(0);
  });

  it("rejects negative extension quantities", async () => {
    const csv = [
      "material_code,name,unit,safety_stock_quantity",
      "RMCSV_BAD,不正CSV原料,kg,-1",
    ].join("\n");

    const response = await POST(new Request("http://test.local/api/import/materials", { method: "POST", body: csv }));
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const material = await prisma.material.findUnique({ where: { materialCode: "RMCSV_BAD" } });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(material).toBeNull();
  });

  it("adds material and packaging extension columns to template tails", async () => {
    const materialResponse = await TEMPLATE(new Request("http://test.local/api/export/master-template?type=materials"));
    const packagingResponse = await TEMPLATE(new Request("http://test.local/api/export/master-template?type=packaging"));
    const materialHeader = (await materialResponse.text()).replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.split(",");
    const packagingHeader = (await packagingResponse.text()).replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.split(",");

    expect(materialHeader?.slice(-5)).toEqual([
      "safety_stock_quantity",
      "order_lot_qty",
      "min_order_qty",
      "valid_from",
      "valid_to",
    ]);
    expect(packagingHeader?.slice(-5)).toEqual(materialHeader?.slice(-5));
  });
});
