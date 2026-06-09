import { audit } from "@/lib/audit";
import { handleError, notFound, ok } from "@/lib/http";
import { cancelProductionPlanPlannedMovements } from "@/lib/inventory-ledger";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionPlan.findUnique({ where: { id } });
    if (!before) return notFound();
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.productionPlan.update({
        where: { id },
        data: { status: "cancelled" },
      });
      await cancelProductionPlanPlannedMovements(tx, id);
      return updated;
    });
    await audit({ action: "cancel", entityType: "ProductionPlan", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
