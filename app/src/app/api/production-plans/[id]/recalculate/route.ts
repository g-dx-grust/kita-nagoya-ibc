import { handleError, ok } from "@/lib/http";
import { recalculateProductionPlan } from "@/lib/plan-engine";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const calc = await recalculateProductionPlan(id);
    const fresh = await prisma.productionPlan.findUnique({
      where: { id },
      include: { product: true, workArea: true, requirements: true },
    });
    return ok({ plan: fresh, ...calc });
  } catch (e) {
    return handleError(e);
  }
}
