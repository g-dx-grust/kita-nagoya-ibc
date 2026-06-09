import { audit } from "@/lib/audit";
import { handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { BillingPriceUpdateSchema } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.billingPrice.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, BillingPriceUpdateSchema);
    const row = await prisma.billingPrice.update({
      where: { id },
      data: {
        unitPrice: body.unitPrice,
        unit: body.unit,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        billingTarget: body.billingTarget,
        externalCode: body.externalCode ?? null,
        note: body.note ?? null,
      },
    });
    await audit({ action: "update", entityType: "BillingPrice", entityId: id, before, after: row });
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.billingPrice.findUnique({ where: { id } });
    if (!before) return notFound();
    await prisma.billingPrice.delete({ where: { id } });
    await audit({ action: "delete", entityType: "BillingPrice", entityId: id, before });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
