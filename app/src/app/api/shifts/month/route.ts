import { audit } from "@/lib/audit";
import {
  changedEmployeeDefaultWorkTimes,
  updateEmployeeDefaultWorkTimes,
} from "@/lib/employee-default-work-times";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange } from "@/lib/schedule";
import { ShiftMonthReplaceSchema } from "@/lib/schemas";

// PUT /api/shifts/month
// 月単位の一括 replace。指定年月の全 Shift を一旦削除し、cells を再投入する。
// 送られなかった (employeeId, day) は削除 = オフ。
export async function PUT(req: Request) {
  try {
    const body = await parseJson(req, ShiftMonthReplaceSchema);
    const employeeDefaults = dedupeEmployeeDefaults(body.employeeDefaults ?? []);
    const invalidDefault = employeeDefaults.find((row) => !isValidTimeRange(row));
    if (invalidDefault) return badRequest("invalid_default_work_time", invalidDefault);

    const { year, month } = parseYearMonth(body.yearMonth);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

    // 検証: day が月内に収まるか, employee 全部 active, 時刻範囲が正しいか
    const outOfMonth = body.cells.find((c) => c.day < 1 || c.day > lastDay);
    if (outOfMonth) return badRequest("day_out_of_month", outOfMonth);

    const ids = [
      ...new Set([
        ...body.cells.map((c) => c.employeeId),
        ...employeeDefaults.map((defaults) => defaults.employeeId),
      ]),
    ];
    const employeeMap = new Map<
      string,
      { defaultStartTime: string; defaultEndTime: string; defaultBreakMinutes: number }
    >();
    let employees: {
      id: string;
      defaultStartTime: string;
      defaultEndTime: string;
      defaultBreakMinutes: number;
    }[] = [];
    if (ids.length > 0) {
      employees = await prisma.employee.findMany({
        where: { id: { in: ids }, active: true },
      });
      if (employees.length !== ids.length) return badRequest("employee_not_found_or_inactive");
      for (const employee of employees) {
        employeeMap.set(employee.id, {
          defaultStartTime: employee.defaultStartTime,
          defaultEndTime: employee.defaultEndTime,
          defaultBreakMinutes: employee.defaultBreakMinutes,
        });
      }
    }

    // zod の `.default()` は TS 上 optional 扱いになるのでここで強制的に値を確定する。
    const defs = {
      startTime: body.defaults.startTime ?? "09:00",
      endTime: body.defaults.endTime ?? "17:00",
      breakMinutes: body.defaults.breakMinutes ?? 60,
      status: body.defaults.status ?? "confirmed",
    };
    if (!isValidTimeRange(defs)) return badRequest("invalid_time_range", defs);

    const before = await prisma.shift.findMany({
      where: { date: { gte: start, lt: end } },
    });
    const beforeMap = new Map(
      before.map((s) => [
        `${s.employeeId}#${s.date.getUTCDate()}`,
        s,
      ]),
    );
    const employeeDefaultMap = new Map(employeeDefaults.map((defaults) => [defaults.employeeId, defaults]));
    const cells: {
      employeeId: string;
      day: number;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      status: string;
      shiftPatternId: string | null;
    }[] = body.cells.map((c) => {
      const existing = beforeMap.get(`${c.employeeId}#${c.day}`);
      const employeeDefault = employeeDefaultMap.get(c.employeeId);
      const employee = employeeMap.get(c.employeeId);
      return {
        employeeId: c.employeeId,
        day: c.day,
        startTime:
          c.startTime ??
          employeeDefault?.startTime ??
          existing?.startTime ??
          employee?.defaultStartTime ??
          defs.startTime,
        endTime:
          c.endTime ??
          employeeDefault?.endTime ??
          existing?.endTime ??
          employee?.defaultEndTime ??
          defs.endTime,
        breakMinutes:
          c.breakMinutes ??
          employeeDefault?.breakMinutes ??
          existing?.breakMinutes ??
          employee?.defaultBreakMinutes ??
          defs.breakMinutes,
        status: c.status ?? existing?.status ?? defs.status,
        shiftPatternId: c.shiftPatternId ?? existing?.shiftPatternId ?? null,
      };
    });
    const invalid = cells.find((c) => c.status !== "off" && !isValidTimeRange(c));
    if (invalid) return badRequest("invalid_time_range", invalid);

    // (employeeId, day) 重複排除: 後勝ち。
    const dedup = new Map<string, (typeof cells)[number]>();
    for (const c of cells) dedup.set(`${c.employeeId}#${c.day}`, c);
    const changedEmployeeDefaults = changedEmployeeDefaultWorkTimes(employeeDefaults, employees);

    const after = await prisma.$transaction(
      async (tx) => {
        await updateEmployeeDefaultWorkTimes(tx, changedEmployeeDefaults);
        await tx.shift.deleteMany({ where: { date: { gte: start, lt: end } } });
        const data = [...dedup.values()].map((c) => ({
          employeeId: c.employeeId,
          date: new Date(Date.UTC(year, month - 1, c.day)),
          startTime: c.startTime,
          endTime: c.endTime,
          breakMinutes: c.breakMinutes,
          status: c.status,
          shiftPatternId: c.shiftPatternId,
        }));
        if (data.length > 0) await tx.shift.createMany({ data });
        return tx.shift.findMany({
          where: { date: { gte: start, lt: end } },
          orderBy: [{ date: "asc" }, { employeeId: "asc" }],
        });
      },
      { timeout: 15_000 },
    );

    await audit({
      action: "replace_shifts_month",
      entityType: "Shift",
      entityId: body.yearMonth,
      before,
      after: { count: after.length },
    });

    return ok({ yearMonth: body.yearMonth, count: after.length });
  } catch (e) {
    return handleError(e);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ym = url.searchParams.get("yearMonth");
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return badRequest("yearMonth required");
    const { year, month } = parseYearMonth(ym);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const [employees, shifts] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.shift.findMany({ where: { date: { gte: start, lt: end }, employee: { active: true } } }),
    ]);
    return ok({ yearMonth: ym, employees, shifts });
  } catch (e) {
    return handleError(e);
  }
}

function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

function dedupeEmployeeDefaults<T extends { employeeId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.employeeId, row);
  return [...map.values()];
}
