import { audit } from "@/lib/audit";
import { badRequest, created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange } from "@/lib/schedule";
import { EmployeeCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const rows = await prisma.employee.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { name: "asc" },
  });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, EmployeeCreateSchema);
    const data = {
      ...body,
      defaultStartTime: body.defaultStartTime ?? "09:00",
      defaultEndTime: body.defaultEndTime ?? "17:00",
      defaultBreakMinutes: body.defaultBreakMinutes ?? 60,
    };
    if (!isValidTimeRange({ startTime: data.defaultStartTime, endTime: data.defaultEndTime })) {
      return badRequest("invalid_default_work_time");
    }
    const row = await prisma.employee.create({ data });
    await audit({ action: "create", entityType: "Employee", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
