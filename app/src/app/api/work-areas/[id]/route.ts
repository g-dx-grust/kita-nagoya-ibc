import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { WorkAreaUpdateSchema } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.workArea.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, WorkAreaUpdateSchema);
    const after = await prisma.workArea.update({ where: { id }, data: body });
    await audit({ action: "update", entityType: "WorkArea", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.workArea.findUnique({ where: { id } });
  if (!before) return notFound();
  const after = await prisma.workArea.update({ where: { id }, data: { active: false } });
  await audit({ action: "deactivate", entityType: "WorkArea", entityId: id, before, after });
  return ok(after);
}
