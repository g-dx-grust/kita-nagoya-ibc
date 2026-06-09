import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { MaterialUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.material.findUnique({ where: { id }, include: { supplier: true } });
  return row ? ok(row) : notFound();
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.material.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, MaterialUpdateSchema);
    const after = await prisma.material.update({ where: { id }, data: body });
    await audit({ action: "update", entityType: "Material", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.material.findUnique({ where: { id } });
  if (!before) return notFound();
  const after = await prisma.material.update({ where: { id }, data: { active: false } });
  await audit({ action: "deactivate", entityType: "Material", entityId: id, before, after });
  return ok(after);
}
