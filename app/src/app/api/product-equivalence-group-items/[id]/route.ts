import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductEquivalenceGroupItemUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await prisma.productEquivalenceGroupItem.findUnique({
      where: { id },
      include: { group: true, product: true },
    });
    return row ? ok(row) : notFound();
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productEquivalenceGroupItem.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, ProductEquivalenceGroupItemUpdateSchema);
    const after = await prisma.productEquivalenceGroupItem.update({
      where: { id },
      data: body,
      include: { group: true, product: true },
    });
    await audit({
      action: "update",
      entityType: "ProductEquivalenceGroupItem",
      entityId: id,
      before,
      after,
    });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productEquivalenceGroupItem.findUnique({ where: { id } });
    if (!before) return notFound();
    await prisma.productEquivalenceGroupItem.delete({ where: { id } });
    await audit({
      action: "delete",
      entityType: "ProductEquivalenceGroupItem",
      entityId: id,
      before,
    });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
