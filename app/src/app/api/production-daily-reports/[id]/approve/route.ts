import { z } from "zod";

import { handleError, ok, parseJson } from "@/lib/http";
import { approveProductDailyReportEntry } from "@/lib/product-daily-report-service";

const ApproveSchema = z.object({
  approvedBy: z.string().max(80).nullish(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, ApproveSchema);
    const row = await approveProductDailyReportEntry(id, body.approvedBy);
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
