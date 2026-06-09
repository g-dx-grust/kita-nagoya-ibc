// Sample integration test. Copy this pattern for Phase 1-1 onwards.
// Verifies: CRUD on Product, soft-delete via active flag, alias propagation.

import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { getTestPrisma, disconnectTestPrisma } from "../helpers/prisma";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestWorkArea } from "../helpers/factories";

describe("Product CRUD (integration)", () => {
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

  it("creates a product with the default work area", async () => {
    const wa = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: wa.id });

    const read = await prisma.product.findUnique({
      where: { id: product.id },
      include: { defaultWorkArea: true },
    });

    expect(read).not.toBeNull();
    expect(read?.officialName).toBe(product.officialName);
    expect(read?.defaultWorkArea?.id).toBe(wa.id);
    expect(read?.active).toBe(true);
    expect(read?.productionType).toBe("stock");
  });

  it("updates a product's display name", async () => {
    const p = await createTestProduct(prisma);

    await prisma.product.update({
      where: { id: p.id },
      data: { displayName: "更新後" },
    });

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.displayName).toBe("更新後");
  });

  it("soft-deletes a product by flipping active", async () => {
    const p = await createTestProduct(prisma);

    await prisma.product.update({
      where: { id: p.id },
      data: { active: false },
    });

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.active).toBe(false);

    const activeOnly = await prisma.product.findMany({ where: { active: true } });
    expect(activeOnly).toHaveLength(0);
  });

  it("attaches an alias and resolves the product by alias", async () => {
    const p = await createTestProduct(prisma);
    await prisma.productAlias.create({ data: { productId: p.id, aliasName: "旧A" } });

    const matched = await prisma.product.findFirst({
      where: { aliases: { some: { aliasName: "旧A" } } },
    });

    expect(matched?.id).toBe(p.id);
  });

  it("cascades alias deletion when the product is removed", async () => {
    const p = await createTestProduct(prisma);
    await prisma.productAlias.create({ data: { productId: p.id, aliasName: "旧B" } });

    await prisma.product.delete({ where: { id: p.id } });

    const orphans = await prisma.productAlias.findMany({ where: { productId: p.id } });
    expect(orphans).toHaveLength(0);
  });

  it("rejects duplicate productCode", async () => {
    const code = `DUP_${Date.now().toString(36)}`;
    await createTestProduct(prisma, { productCode: code });
    await expect(createTestProduct(prisma, { productCode: code })).rejects.toThrow();
  });
});
