import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ShiftBreakUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await prisma.shiftBreak.findUnique({ where: { id }, include: { pattern: true } });
    return row ? ok(row) : notFound();
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.shiftBreak.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, ShiftBreakUpdateSchema);
    const after = await prisma.shiftBreak.update({
      where: { id },
      data: body,
      include: { pattern: true },
    });
    await audit({ action: "update", entityType: "ShiftBreak", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.shiftBreak.findUnique({ where: { id } });
    if (!before) return notFound();
    const after = await prisma.shiftBreak.update({ where: { id }, data: { active: false } });
    await audit({ action: "deactivate", entityType: "ShiftBreak", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
