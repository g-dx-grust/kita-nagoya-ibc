import { upsertDailyReportDraft } from "@/lib/daily-report-service";
import { created, handleError, parseJson } from "@/lib/http";
import { z } from "zod";

const Schema = z.object({
  actualStartTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  actualEndTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  actualBreakMinutes: z.number().int().min(0).optional(),
  actualPeopleCount: z.number().positive().optional(),
  actualQuantity: z.number().nonnegative().optional(),
  note: z.string().nullish(),
  consumptions: z
    .array(
      z.object({
        itemType: z.enum(["raw_material", "packaging"]),
        itemId: z.string(),
        actualQuantity: z.number().nonnegative(),
        unitPriceSnapshot: z.number().nonnegative().default(0),
      }),
    )
    .default([]),
});

// Create or replace the draft daily report attached to a production plan.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, Schema);
    const result = await upsertDailyReportDraft(id, body);
    return created(result);
  } catch (e) {
    return handleError(e);
  }
}
