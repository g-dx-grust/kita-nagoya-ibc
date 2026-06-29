import { handleError, ok } from "@/lib/http";
import { getMonthlyPlanningRunPreview } from "@/lib/monthly-planning-run-service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const preview = await getMonthlyPlanningRunPreview(id);
    return ok(preview);
  } catch (e) {
    return handleError(e);
  }
}
