import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WorkAreaCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Work area equipment extension (integration)", () => {
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

  it("defaults equipmentKind to ROOM", async () => {
    const workArea = await createTestWorkArea(prisma);

    expect(workArea.equipmentKind).toBe("ROOM");
    expect(workArea.concurrentOperationAllowed).toBe(true);
  });

  it("accepts all equipmentKind values", async () => {
    const kinds = ["ROOM", "LINE", "MACHINE", "OTHER"] as const;

    for (const equipmentKind of kinds) {
      const workArea = await createTestWorkArea(prisma, { equipmentKind });
      expect(workArea.equipmentKind).toBe(equipmentKind);
    }
  });

  it("stores concurrentOperationAllowed as false", async () => {
    const workArea = await createTestWorkArea(prisma, {
      equipmentKind: "MACHINE",
      concurrentOperationAllowed: false,
    });

    expect(workArea.concurrentOperationAllowed).toBe(false);
  });

  it("accepts a validity range when validFrom is before validTo", async () => {
    const workArea = await createTestWorkArea(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
    });

    expect(workArea.validFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(workArea.validTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects reversed validity dates", () => {
    const parsed = WorkAreaCreateSchema.safeParse({
      name: "有効期間逆転作業場所",
      areaType: "internal",
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });

    expect(parsed.success).toBe(false);
  });
});
