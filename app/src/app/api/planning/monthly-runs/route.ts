import { handleError, ok } from "@/lib/http";
import { listMonthlyPlanningRuns } from "@/lib/monthly-planning-run-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const yearMonth = url.searchParams.get("yearMonth") ?? url.searchParams.get("ym");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(100, Math.max(1, Number(limitParam) || 20)) : 20;
    const runs = await listMonthlyPlanningRuns({ yearMonth, limit });
    return ok({ rowCount: runs.length, runs });
  } catch (e) {
    return handleError(e);
  }
}
