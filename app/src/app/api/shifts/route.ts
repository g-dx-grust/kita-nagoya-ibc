import { audit } from "@/lib/audit";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange } from "@/lib/schedule";
import { ShiftBulkReplaceSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const [start, end] = dayRange(date);
    const employees = await prisma.employee.findMany({
      where: { active: true },
      include: { shifts: { where: { date: { gte: start, lt: end } } } },
      orderBy: { name: "asc" },
    });
    return ok(
      employees.map((employee) => ({
        employee,
        shift: employee.shifts[0] ?? null,
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await parseJson(req, ShiftBulkReplaceSchema);
    const employeeDefaults = dedupeEmployeeDefaults(body.employeeDefaults ?? []);
    const invalidDefault = employeeDefaults.find((row) => !isValidTimeRange(row));
    if (invalidDefault) return badRequest("invalid_default_work_time", invalidDefault);

    const invalid = body.shifts.find((shift) => shift.status !== "off" && !isValidTimeRange(shift));
    if (invalid) return badRequest("invalid_time_range", invalid);

    const employeeIds = [
      ...new Set([
        ...body.shifts.map((shift) => shift.employeeId),
        ...employeeDefaults.map((defaults) => defaults.employeeId),
      ]),
    ];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, active: true },
    });
    if (employees.length !== employeeIds.length) {
      return badRequest("employee_not_found_or_inactive");
    }

    const [start, end] = dayRange(body.date);
    const before = await prisma.shift.findMany({ where: { date: { gte: start, lt: end } } });

    const rows = await prisma.$transaction(async (tx) => {
      await Promise.all(
        employeeDefaults.map((defaults) =>
          tx.employee.update({
            where: { id: defaults.employeeId },
            data: {
              defaultStartTime: defaults.startTime,
              defaultEndTime: defaults.endTime,
              defaultBreakMinutes: defaults.breakMinutes,
            },
          }),
        ),
      );
      await tx.shift.deleteMany({ where: { date: { gte: start, lt: end } } });
      if (body.shifts.length > 0) {
        await tx.shift.createMany({
          data: body.shifts.map((shift) => ({
            employeeId: shift.employeeId,
            date: start,
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakMinutes: shift.breakMinutes,
            status: shift.status,
            shiftPatternId: shift.shiftPatternId ?? null,
          })),
        });
      }
      return tx.shift.findMany({
        where: { date: { gte: start, lt: end } },
        include: { employee: true },
        orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
      });
    });

    await audit({
      action: "replace_shifts",
      entityType: "Shift",
      entityId: body.date,
      before,
      after: rows,
    });
    return ok({ shifts: rows });
  } catch (e) {
    return handleError(e);
  }
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function dedupeEmployeeDefaults<T extends { employeeId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.employeeId, row);
  return [...map.values()];
}
