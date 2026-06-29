import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enqueueDemandReplanEvent } from "@/lib/replan-service";
import { ProductDemandUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.productDemand.findUnique({ where: { id }, include: { product: true } });
  return row ? ok(row) : notFound();
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productDemand.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, ProductDemandUpdateSchema);
    const after = await prisma.productDemand.update({
      where: { id },
      data: {
        ...body,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        productionDueDate:
          body.productionDueDate === undefined
            ? undefined
            : body.productionDueDate
              ? new Date(body.productionDueDate)
              : null,
      },
      include: { product: true },
    });
    await audit({ action: "update", entityType: "ProductDemand", entityId: id, before, after });
    const replanEvent = await enqueueDemandReplanEvent({
      eventType: "demand_updated",
      demand: after,
      before,
      action: "update",
    });
    return ok({ ...after, replanEventId: replanEvent?.id ?? null, replanJobId: replanEvent?.jobs[0]?.id ?? null });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.productDemand.findUnique({ where: { id } });
  if (!before) return notFound();
  const after = await prisma.productDemand.update({ where: { id }, data: { status: "cancelled" } });
  await audit({ action: "cancel", entityType: "ProductDemand", entityId: id, before, after });
  const replanEvent = await enqueueDemandReplanEvent({
    eventType: "demand_updated",
    demand: after,
    before,
    action: "delete",
  });
  return ok({ ...after, replanEventId: replanEvent?.id ?? null, replanJobId: replanEvent?.jobs[0]?.id ?? null });
}
