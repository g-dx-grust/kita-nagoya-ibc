import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { BomReplaceSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound();
    const items = await prisma.productBomItem.findMany({ where: { productId: id } });
    return ok({ productId: id, items });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound();
    const body = await parseJson(req, BomReplaceSchema);
    const before = await prisma.productBomItem.findMany({ where: { productId: id } });

    const after = await prisma.$transaction(async (tx) => {
      await tx.productBomItem.deleteMany({ where: { productId: id } });
      if (body.items.length > 0) {
        await tx.productBomItem.createMany({
          data: body.items.map((i) => ({ ...i, productId: id })),
        });
      }
      return tx.productBomItem.findMany({ where: { productId: id } });
    });

    await audit({
      action: "replace_bom",
      entityType: "ProductBom",
      entityId: id,
      before,
      after,
    });
    return ok({ productId: id, items: after });
  } catch (e) {
    return handleError(e);
  }
}
