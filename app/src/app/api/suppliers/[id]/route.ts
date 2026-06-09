import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { SupplierUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.supplier.findUnique({ where: { id } });
  if (!row) return notFound();
  return ok(row);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, SupplierUpdateSchema);
    const after = await prisma.supplier.update({ where: { id }, data: body });
    await audit({ action: "update", entityType: "Supplier", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) return notFound();
  const after = await prisma.supplier.update({ where: { id }, data: { active: false } });
  await audit({ action: "deactivate", entityType: "Supplier", entityId: id, before, after });
  return ok(after);
}
