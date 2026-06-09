import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductMonthlyActualUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.productMonthlyActual.findUnique({ where: { id }, include: { product: true } });
  return row ? ok(row) : notFound();
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productMonthlyActual.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, ProductMonthlyActualUpdateSchema);
    const after = await prisma.productMonthlyActual.update({
      where: { id },
      data: body,
      include: { product: true },
    });
    await audit({
      action: "update",
      entityType: "ProductMonthlyActual",
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
  const { id } = await ctx.params;
  const before = await prisma.productMonthlyActual.findUnique({ where: { id } });
  if (!before) return notFound();
  await prisma.productMonthlyActual.delete({ where: { id } });
  await audit({ action: "delete", entityType: "ProductMonthlyActual", entityId: id, before });
  return ok({ id });
}
