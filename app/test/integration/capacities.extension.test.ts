import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CapacityUpsertSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Production capacity source extension (integration)", () => {
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

  it("defaults sourceType to MANUAL and locked to false", async () => {
    const capacity = await createCapacity();

    expect(capacity.sourceType).toBe("MANUAL");
    expect(capacity.locked).toBe(false);
    expect(capacity.active).toBe(true);
  });

  it("accepts all sourceType values", async () => {
    const sourceTypes = ["MANUAL", "DAILY_REPORT_MEDIAN"] as const;

    for (const sourceType of sourceTypes) {
      const capacity = await createCapacity({ sourceType });
      expect(capacity.sourceType).toBe(sourceType);
    }
  });

  it("stores locked as true", async () => {
    const capacity = await createCapacity({ locked: true });

    expect(capacity.locked).toBe(true);
  });

  it("keeps reviewStatus independent from sourceType", async () => {
    const capacity = await createCapacity({
      sourceType: "DAILY_REPORT_MEDIAN",
      reviewStatus: "confirmed",
    });

    expect(capacity.sourceType).toBe("DAILY_REPORT_MEDIAN");
    expect(capacity.reviewStatus).toBe("confirmed");
  });

  it("accepts valid ranges and rejects reversed validity dates", async () => {
    const capacity = await createCapacity({
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
    });

    expect(capacity.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(capacity.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");

    const parsed = CapacityUpsertSchema.safeParse({
      productId: "product-id",
      workAreaId: "work-area-id",
      unitsPerPersonHour: 100,
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });
    expect(parsed.success).toBe(false);
  });

  async function createCapacity(
    data: Partial<{
      sourceType: "MANUAL" | "DAILY_REPORT_MEDIAN";
      locked: boolean;
      reviewStatus: string;
      validFrom: Date | null;
      validTo: Date | null;
    }> = {},
  ) {
    const product = await createTestProduct(prisma);
    const workArea = await createTestWorkArea(prisma);
    return prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 100,
        standardPeople: 2,
        ...data,
      },
    });
  }
});
