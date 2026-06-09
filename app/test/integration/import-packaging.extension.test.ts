import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/import/packaging-materials/route";
import { cleanupAll } from "../helpers/cleanup";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Packaging CSV import extension (integration)", () => {
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

  it("imports packaging extension columns", async () => {
    const csv = [
      "material_code,name,kind,unit,standard_unit_price,lead_time_days,note,safety_stock_quantity,order_lot_qty,min_order_qty,valid_from,valid_to",
      "PKCSV001,CSV資材,bag,枚,5,7,,500,1000,2000,2026-01-01,",
    ].join("\n");

    const response = await POST(
      new Request("http://test.local/api/import/packaging-materials", {
        method: "POST",
        body: csv,
      }),
    );
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const packaging = await prisma.packagingMaterial.findUnique({
      where: { materialCode: "PKCSV001" },
    });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(packaging).toMatchObject({
      safetyStockQuantity: 500,
      orderLotQty: 1000,
      minOrderQty: 2000,
    });
    expect(packaging?.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects negative extension quantities", async () => {
    const csv = [
      "material_code,name,kind,unit,safety_stock_quantity",
      "PKCSV_BAD,不正CSV資材,bag,枚,-1",
    ].join("\n");

    const response = await POST(
      new Request("http://test.local/api/import/packaging-materials", {
        method: "POST",
        body: csv,
      }),
    );
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const packaging = await prisma.packagingMaterial.findUnique({
      where: { materialCode: "PKCSV_BAD" },
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(packaging).toBeNull();
  });
});
