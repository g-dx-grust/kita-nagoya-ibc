import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange } from "@/lib/schedule";
import { StaffShiftEntrySaveSchema } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const employee = await prisma.employee.findFirst({
      where: {
        shiftEntryToken: token,
        shiftEntryEnabled: true,
        active: true,
      },
    });
    if (!employee) return notFound();

    const body = await parseJson(req, StaffShiftEntrySaveSchema);
    const shiftTime = {
      startTime: body.startTime ?? "09:00",
      endTime: body.endTime ?? "17:00",
      breakMinutes: body.breakMinutes ?? 60,
    };
    if (!isValidTimeRange(shiftTime)) {
      return badRequest("invalid_time_range");
    }

    const { year, month } = parseYearMonth(body.yearMonth);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const workingDays = [...new Set(body.workingDays)].sort((a, b) => a - b);
    const outOfMonth = workingDays.find((day) => day < 1 || day > lastDay);
    if (outOfMonth) return badRequest("day_out_of_month", { day: outOfMonth });

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const before = await prisma.shift.findMany({
      where: { employeeId: employee.id, date: { gte: start, lt: end } },
    });

    const after = await prisma.$transaction(async (tx) => {
      await tx.shift.deleteMany({
        where: { employeeId: employee.id, date: { gte: start, lt: end } },
      });
      if (workingDays.length > 0) {
        await tx.shift.createMany({
          data: workingDays.map((day) => ({
            employeeId: employee.id,
            date: new Date(Date.UTC(year, month - 1, day)),
            startTime: shiftTime.startTime,
            endTime: shiftTime.endTime,
            breakMinutes: shiftTime.breakMinutes,
            status: "draft",
          })),
        });
      }
      return tx.shift.findMany({
        where: { employeeId: employee.id, date: { gte: start, lt: end } },
        orderBy: { date: "asc" },
      });
    });

    await audit({
      action: "self_replace_shifts_month",
      entityType: "Shift",
      entityId: `${employee.id}:${body.yearMonth}`,
      before,
      after: { count: after.length },
    });

    return ok({ yearMonth: body.yearMonth, employeeId: employee.id, count: after.length });
  } catch (e) {
    return handleError(e);
  }
}

function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
}
