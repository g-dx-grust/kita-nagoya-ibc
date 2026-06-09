import { computeRequiredPeople } from "@/lib/calculations";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { getCapacity } from "@/lib/plan-engine";
import { CalcRequiredPeopleSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, CalcRequiredPeopleSchema);
    let upph = body.unitsPerPersonHour;
    if (upph == null && body.productId && body.workAreaId) {
      upph = (await getCapacity(body.productId, body.workAreaId))?.unitsPerPersonHour;
    }
    if (upph == null) return badRequest("capacity_not_found");
    return ok({
      ...computeRequiredPeople({
        quantity: body.quantity,
        unitsPerPersonHour: upph,
        startTime: body.startTime,
        endTime: body.endTime,
        breakWindows: await loadActiveBreakWindows(),
        availablePeople: body.availablePeople,
      }),
      unitsPerPersonHour: upph,
    });
  } catch (e) {
    return handleError(e);
  }
}
