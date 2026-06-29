import { handleError, ok, parseJson } from "@/lib/http";
import { adoptMonthlyPlanningRun } from "@/lib/monthly-planning-run-service";
import { MonthlyPlanningRunAdoptSchema } from "@/lib/schemas";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, MonthlyPlanningRunAdoptSchema);
    const result = await adoptMonthlyPlanningRun(id, body);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
