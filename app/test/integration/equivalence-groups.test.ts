import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as DELETE_GROUP, GET as GET_GROUP } from "@/app/api/product-equivalence-groups/[id]/route";
import { GET as LIST_GROUPS } from "@/app/api/product-equivalence-groups/route";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Product equivalence groups (integration)", () => {
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

  it("creates a group, adds a product, lists it, and soft-deletes the group", async () => {
    const product = await createTestProduct(prisma);
    const group = await prisma.productEquivalenceGroup.create({
      data: { name: "規格変更テスト", calculationMode: "SUM_AS_SAME_PRODUCT" },
    });
    await prisma.productEquivalenceGroupItem.create({
      data: { groupId: group.id, productId: product.id },
    });

    const listResponse = await LIST_GROUPS(new Request("http://test.local/api/product-equivalence-groups"));
    const groups = (await listResponse.json()) as Array<{ id: string; items: unknown[] }>;
    expect(groups.find((g) => g.id === group.id)?.items).toHaveLength(1);

    const deleteResponse = await DELETE_GROUP(new Request("http://test.local"), {
      params: Promise.resolve({ id: group.id }),
    });
    const deleted = (await deleteResponse.json()) as { active: boolean };
    expect(deleted.active).toBe(false);
  });

  it("can retrieve products through Product.equivalenceGroupId", async () => {
    const group = await prisma.productEquivalenceGroup.create({
      data: { name: "商品逆引きテスト" },
    });
    const product = await createTestProduct(prisma, {
      equivalenceGroup: { connect: { id: group.id } },
    });

    const response = await GET_GROUP(new Request("http://test.local"), {
      params: Promise.resolve({ id: group.id }),
    });
    const read = (await response.json()) as { products: Array<{ id: string }> };

    expect(read.products.map((p) => p.id)).toContain(product.id);
  });

  it("allows one product to belong to multiple group item rows", async () => {
    const product = await createTestProduct(prisma);
    const groupA = await prisma.productEquivalenceGroup.create({ data: { name: "グループA" } });
    const groupB = await prisma.productEquivalenceGroup.create({ data: { name: "グループB" } });

    await prisma.productEquivalenceGroupItem.create({
      data: { groupId: groupA.id, productId: product.id },
    });
    await prisma.productEquivalenceGroupItem.create({
      data: { groupId: groupB.id, productId: product.id },
    });

    const memberships = await prisma.productEquivalenceGroupItem.findMany({
      where: { productId: product.id },
    });
    expect(memberships).toHaveLength(2);
  });
});
