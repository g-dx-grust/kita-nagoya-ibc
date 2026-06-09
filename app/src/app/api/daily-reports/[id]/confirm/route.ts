import { confirmDailyReport } from "@/lib/daily-report-service";
import { handleError, ok } from "@/lib/http";

// Confirm a daily report: snapshot consumption to the stock ledger and mark
// the production plan completed. Replaces the previous "planned" reservation.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await confirmDailyReport(id);
    return ok(result.report);
  } catch (e) {
    return handleError(e);
  }
}
