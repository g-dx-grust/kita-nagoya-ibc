import {
  computeProductionDuration,
  type DurationInput,
} from "@/lib/calculations";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { getCapacity } from "@/lib/plan-engine";
import { CalcDurationSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, CalcDurationSchema);
    const upph = await resolveCapacity(body);
    if (upph == null) {
      return badRequest("capacity_not_found", {
        productId: body.productId,
        workAreaId: body.workAreaId,
      });
    }
    const input: DurationInput = {
      quantity: body.quantity,
      unitsPerPersonHour: upph,
      peopleCount: body.peopleCount,
      startTime: body.startTime,
      breakWindows: await loadActiveBreakWindows(),
      baselineEndTime: body.baselineEndTime,
    };
    return ok({ ...computeProductionDuration(input), unitsPerPersonHour: upph });
  } catch (e) {
    return handleError(e);
  }
}

async function resolveCapacity(body: {
  unitsPerPersonHour?: number;
  productId?: string;
  workAreaId?: string;
}): Promise<number | null> {
  if (body.unitsPerPersonHour != null) return body.unitsPerPersonHour;
  if (!body.productId || !body.workAreaId) return null;
  const cap = await getCapacity(body.productId, body.workAreaId);
  return cap?.unitsPerPersonHour ?? null;
}
