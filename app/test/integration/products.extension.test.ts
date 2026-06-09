import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProductCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Product forecast extension (integration)", () => {
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

  it("defaults forecastMethod to MANUAL and allows a null equivalenceGroupId", async () => {
    const product = await createTestProduct(prisma);

    expect(product.forecastMethod).toBe("MANUAL");
    expect(product.equivalenceGroupId).toBeNull();
  });

  it("accepts all forecastMethod enum values", async () => {
    const methods = ["MANUAL", "YEAR_RATIO", "SALES_INPUT", "NONE"] as const;

    for (const forecastMethod of methods) {
      const product = await createTestProduct(prisma, { forecastMethod });
      expect(product.forecastMethod).toBe(forecastMethod);
    }
  });

  it("accepts a validity range when validFrom is before validTo", async () => {
    const product = await createTestProduct(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
    });

    expect(product.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(product.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects a validity range when validFrom is after validTo", () => {
    const parsed = ProductCreateSchema.safeParse({
      productCode: "P_VALID_REVERSED",
      officialName: "有効期間逆転商品",
      productionType: "stock",
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });

    expect(parsed.success).toBe(false);
  });

  it("allows validTo to be null for an open-ended validity period", async () => {
    const product = await createTestProduct(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: null,
    });

    expect(product.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(product.validTo).toBeNull();
  });

  it("allows validFrom to be null when the start date is unspecified", async () => {
    const product = await createTestProduct(prisma, {
      validFrom: null,
      validTo: new Date("2026-12-31"),
    });

    expect(product.validFrom).toBeNull();
    expect(product.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});
