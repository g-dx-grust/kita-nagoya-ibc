import { handleError, ok, parseJson } from "@/lib/http";
import { scheduleProductDemand } from "@/lib/product-demand-scheduling";
import { ProductDemandScheduleSchema } from "@/lib/schemas";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = req.headers.get("content-length") === "0"
      ? {}
      : await parseJson(req, ProductDemandScheduleSchema);
    const result = await scheduleProductDemand(id, body);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
