import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { SpecialDemandEventUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await prisma.specialDemandEvent.findUnique({
      where: { id },
      include: { product: true },
    });
    return row ? ok(row) : notFound();
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.specialDemandEvent.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, SpecialDemandEventUpdateSchema);
    const after = await prisma.specialDemandEvent.update({
      where: { id },
      data: body,
      include: { product: true },
    });
    await audit({
      action: "update",
      entityType: "SpecialDemandEvent",
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
    const before = await prisma.specialDemandEvent.findUnique({ where: { id } });
    if (!before) return notFound();
    const after = await prisma.specialDemandEvent.update({
      where: { id },
      data: { active: false, status: "CANCELLED" },
    });
    await audit({
      action: "deactivate",
      entityType: "SpecialDemandEvent",
      entityId: id,
      before,
      after,
    });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
