import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMaterialRequirements } from "@/lib/calculations";
import { loadProductBom } from "@/lib/plan-engine";
import { BomReplaceSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial, createTestProduct } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("BOM validity period (integration)", () => {
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

  it("loads the BOM row active for today by default", async () => {
    const { product, currentMaterial } = await createVersionedBom();

    vi.setSystemTime(new Date("2026-05-28T00:00:00.000Z"));
    const bom = await loadProductBom(product.id);
    vi.useRealTimers();

    expect(bom).toHaveLength(1);
    expect(bom[0]?.itemId).toBe(currentMaterial.id);
  });

  it("loads a different BOM version when effectiveDate changes", async () => {
    const { product, futureMaterial } = await createVersionedBom();

    const bom = await loadProductBom(product.id, new Date("2026-06-15"));

    expect(bom).toHaveLength(1);
    expect(bom[0]?.itemId).toBe(futureMaterial.id);
    expect(bom[0]?.quantityPerUnit).toBe(0.2);
  });

  it("excludes rows outside the effective period", async () => {
    const { product, expiredMaterial } = await createVersionedBom();

    const bom = await loadProductBom(product.id, new Date("2026-05-28"));

    expect(bom.map((item) => item.itemId)).not.toContain(expiredMaterial.id);
  });

  it("passes only active effective BOM rows into material requirement calculation", async () => {
    const { product, currentMaterial } = await createVersionedBom();
    const bom = await loadProductBom(product.id, new Date("2026-05-28"));

    const lines = computeMaterialRequirements({
      quantity: 100,
      bom,
      inventory: {
        [currentMaterial.id]: { onHand: 100, confirmedInbound: 0, unconfirmedInbound: 0 },
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.itemId).toBe(currentMaterial.id);
    expect(lines[0]?.plannedQuantity).toBe(10);
  });

  it("rejects reversed validity dates in BOM replacement input", () => {
    const parsed = BomReplaceSchema.safeParse({
      items: [
        {
          itemType: "raw_material",
          itemId: "material-id",
          quantityPerUnit: 0.1,
          unit: "kg",
          validFrom: "2026-12-31",
          validTo: "2026-01-01",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  async function createVersionedBom() {
    const product = await createTestProduct(prisma);
    const currentMaterial = await createTestMaterial(prisma, { standardUnitPrice: 100 });
    const futureMaterial = await createTestMaterial(prisma, { standardUnitPrice: 200 });
    const expiredMaterial = await createTestMaterial(prisma, { standardUnitPrice: 300 });

    await prisma.productBomItem.createMany({
      data: [
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: currentMaterial.id,
          quantityPerUnit: 0.1,
          unit: "kg",
          validFrom: new Date("2026-01-01"),
          validTo: new Date("2026-06-01"),
        },
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: futureMaterial.id,
          quantityPerUnit: 0.2,
          unit: "kg",
          validFrom: new Date("2026-06-01"),
          validTo: null,
        },
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: expiredMaterial.id,
          quantityPerUnit: 0.3,
          unit: "kg",
          validFrom: new Date("2025-01-01"),
          validTo: new Date("2026-01-01"),
        },
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: currentMaterial.id,
          quantityPerUnit: 0.4,
          unit: "kg",
          active: false,
          validFrom: new Date("2026-01-01"),
          validTo: null,
        },
      ],
    });

    return { product, currentMaterial, futureMaterial, expiredMaterial };
  }
});
