import { z } from "zod";

import { handleError, ok, parseJson } from "@/lib/http";
import { applyMonthlyLaborFee } from "@/lib/product-monthly-labor-fee";

const ApplySchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください")
    .optional(),
});

// POST { effectiveFrom? } : 月次手間賃を BillingPrice(売値) へ反映する
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, ApplySchema);
    const row = await applyMonthlyLaborFee(id, body.effectiveFrom);
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
