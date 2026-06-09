import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/materials/route";
import { MaterialCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Material master extension (integration)", () => {
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
    const material = await createTestMaterial(prisma);

    expect(material.safetyStockQuantity).toBe(0);
    expect(material.orderLotQty).toBeNull();
    expect(material.minOrderQty).toBeNull();
  });

  it("accepts a validity range when validFrom is before validTo", async () => {
    const material = await createTestMaterial(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
    });

    expect(material.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(material.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects a validity range when validFrom is after validTo", () => {
    const parsed = MaterialCreateSchema.safeParse({
      materialCode: "M_VALID_REVERSED",
      name: "有効期間逆転原料",
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects negative quantity fields", () => {
    const parsed = MaterialCreateSchema.safeParse({
      materialCode: "M_NEGATIVE",
      name: "負数原料",
      safetyStockQuantity: -1,
      orderLotQty: -1,
      minOrderQty: -1,
    });

    expect(parsed.success).toBe(false);
  });

  it("returns the extension fields from the list API", async () => {
    const material = await createTestMaterial(prisma, {
      safetyStockQuantity: 5,
      orderLotQty: 10,
      minOrderQty: 20,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    });

    const response = await GET(new Request("http://test.local/api/materials"));
    const rows = (await response.json()) as Array<{
      id: string;
      safetyStockQuantity: number;
      orderLotQty: number | null;
      minOrderQty: number | null;
      validFrom: string | null;
      validTo: string | null;
    }>;
    const row = rows.find((r) => r.id === material.id);

    expect(row).toMatchObject({
      safetyStockQuantity: 5,
      orderLotQty: 10,
      minOrderQty: 20,
      validTo: null,
    });
    expect(row?.validFrom).toBe("2026-01-01T00:00:00.000Z");
  });
});
