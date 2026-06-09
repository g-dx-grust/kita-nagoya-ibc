import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/packaging-materials/route";
import { PackagingCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestPackagingMaterial } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Packaging material master extension (integration)", () => {
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

  it("defaults safetyStockQuantity to 0 and allows null order quantities", async () => {
    const packaging = await createTestPackagingMaterial(prisma);

    expect(packaging.safetyStockQuantity).toBe(0);
    expect(packaging.orderLotQty).toBeNull();
    expect(packaging.minOrderQty).toBeNull();
  });

  it("accepts a validity range when validFrom is before validTo", async () => {
    const packaging = await createTestPackagingMaterial(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
    });

    expect(packaging.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(packaging.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects a validity range when validFrom is after validTo", () => {
    const parsed = PackagingCreateSchema.safeParse({
      materialCode: "PK_VALID_REVERSED",
      name: "有効期間逆転資材",
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects negative quantity fields", () => {
    const parsed = PackagingCreateSchema.safeParse({
      materialCode: "PK_NEGATIVE",
      name: "負数資材",
      safetyStockQuantity: -1,
      orderLotQty: -1,
      minOrderQty: -1,
    });

    expect(parsed.success).toBe(false);
  });

  it("returns the extension fields from the list API", async () => {
    const packaging = await createTestPackagingMaterial(prisma, {
      safetyStockQuantity: 500,
      orderLotQty: 1000,
      minOrderQty: 2000,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    });

    const response = await GET(new Request("http://test.local/api/packaging-materials"));
    const rows = (await response.json()) as Array<{
      id: string;
      safetyStockQuantity: number;
      orderLotQty: number | null;
      minOrderQty: number | null;
      validFrom: string | null;
      validTo: string | null;
    }>;
    const row = rows.find((r) => r.id === packaging.id);

    expect(row).toMatchObject({
      safetyStockQuantity: 500,
      orderLotQty: 1000,
      minOrderQty: 2000,
      validTo: null,
    });
    expect(row?.validFrom).toBe("2026-01-01T00:00:00.000Z");
  });
});
