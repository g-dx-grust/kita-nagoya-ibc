import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/suppliers/route";
import { SupplierCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestSupplier } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Supplier master extension (integration)", () => {
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

  it("allows null validity dates", async () => {
    const supplier = await createTestSupplier(prisma, { validFrom: null, validTo: null });

    expect(supplier.validFrom).toBeNull();
    expect(supplier.validTo).toBeNull();
  });

  it("rejects reversed validity dates", () => {
    const parsed = SupplierCreateSchema.safeParse({
      name: "有効期間逆転仕入先",
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });

    expect(parsed.success).toBe(false);
  });

  it("returns validity dates from the list API", async () => {
    const supplier = await createTestSupplier(prisma, {
      validFrom: new Date("2026-01-01"),
      validTo: null,
    });

    const response = await GET();
    const rows = (await response.json()) as Array<{
      id: string;
      validFrom: string | null;
      validTo: string | null;
    }>;
    const row = rows.find((r) => r.id === supplier.id);

    expect(row?.validFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(row?.validTo).toBeNull();
  });
});
