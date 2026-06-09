import { deactivateProductDailyReportEntry, updateProductDailyReportEntry } from "@/lib/product-daily-report-service";
import { handleError, ok, parseJson } from "@/lib/http";
import { ProductDailyReportEntrySchema } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, ProductDailyReportEntrySchema);
    const row = await updateProductDailyReportEntry(id, body);
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await deactivateProductDailyReportEntry(id);
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
