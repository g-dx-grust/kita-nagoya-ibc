import { audit } from "@/lib/audit";
import { handleError, notFound, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionCapacity.findUnique({ where: { id } });
    if (!before) return notFound();
    await prisma.productionCapacity.delete({ where: { id } });
    await audit({ action: "delete", entityType: "ProductionCapacity", entityId: id, before });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
