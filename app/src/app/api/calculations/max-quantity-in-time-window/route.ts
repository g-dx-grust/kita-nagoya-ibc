import { computeMaxQuantityInTimeWindow } from "@/lib/calculations";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { getCapacity } from "@/lib/plan-engine";
import { CalcMaxQuantitySchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, CalcMaxQuantitySchema);
    const upph = await resolve(body);
    if (upph == null) return badRequest("capacity_not_found");
    return ok({
      ...computeMaxQuantityInTimeWindow({
        unitsPerPersonHour: upph,
        peopleCount: body.peopleCount,
        startTime: body.startTime,
        endTime: body.endTime,
        breakWindows: await loadActiveBreakWindows(),
        requestedQuantity: body.requestedQuantity,
      }),
      unitsPerPersonHour: upph,
    });
  } catch (e) {
    return handleError(e);
  }
}

async function resolve(body: {
  unitsPerPersonHour?: number;
  productId?: string;
  workAreaId?: string;
}): Promise<number | null> {
  if (body.unitsPerPersonHour != null) return body.unitsPerPersonHour;
  if (!body.productId || !body.workAreaId) return null;
  const cap = await getCapacity(body.productId, body.workAreaId);
  return cap?.unitsPerPersonHour ?? null;
}
