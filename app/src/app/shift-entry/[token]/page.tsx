import { prisma } from "@/lib/prisma";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, UserRound } from "lucide-react";
import StaffShiftEntryForm from "./staff-shift-entry-form";

export const dynamic = "force-dynamic";

export default async function StaffShiftEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const yearMonth = sp.yearMonth && /^\d{4}-\d{2}$/.test(sp.yearMonth) ? sp.yearMonth : currentYearMonth();

  const employee = await prisma.employee.findFirst({
    where: {
      shiftEntryToken: token,
      shiftEntryEnabled: true,
      active: true,
    },
  });

  if (!employee) {
    return (
      <div className="self-shift-page">
        <header className="self-shift-page-head danger">
          <div className="self-shift-page-title">
            <span className="badge danger">
              <AlertTriangle size={14} aria-hidden="true" />
              URL確認
            </span>
            <h1>シフト入力</h1>
          </div>
        </header>
        <div className="alert danger">この入力URLは利用できません。新しいURLを管理者に確認してください。</div>
      </div>
    );
  }

  const { year, month, lastDay } = monthInfo(yearMonth);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const shifts = await prisma.shift.findMany({
    where: { employeeId: employee.id, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  const activeShifts = shifts.filter((shift) => shift.status !== "off");
  const totalWorkMinutes = activeShifts.reduce(
    (sum, shift) => sum + workMinutes(shift.startTime, shift.endTime, shift.breakMinutes),
    0,
  );
  const weekendShiftCount = activeShifts.filter((shift) => isWeekend(shift.date)).length;
  const customTimeCount = activeShifts.filter(
    (shift) =>
      !isSameShiftTime(shift, {
        startTime: employee.defaultStartTime,
        endTime: employee.defaultEndTime,
        breakMinutes: employee.defaultBreakMinutes,
      }),
  ).length;
  const readinessTone = activeShifts.length > 0 ? "success" : "warn";

  return (
    <div className="self-shift-page">
      <header className={`self-shift-page-head ${readinessTone}`}>
        <div className="self-shift-page-title">
          <span className={`badge ${readinessTone}`}>
            {activeShifts.length > 0 ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <AlertTriangle size={14} aria-hidden="true" />
            )}
            {activeShifts.length > 0 ? "登録あり" : "未登録"}
          </span>
          <h1>シフト入力</h1>
          <div className="self-shift-page-meta">
            <span>
              <UserRound size={14} aria-hidden="true" />
              {employee.name}
            </span>
            <span>
              <CalendarDays size={14} aria-hidden="true" />
              {year}年{month}月
            </span>
          </div>
        </div>
        <div className="self-shift-page-status">
          <span className={`badge ${readinessTone}`}>{activeShifts.length}日</span>
          <strong>
            <Clock size={15} aria-hidden="true" />
            {formatHours(totalWorkMinutes)}
          </strong>
          <small>
            土日 {weekendShiftCount}日 / 時間変更 {customTimeCount}日
          </small>
        </div>
      </header>
      <StaffShiftEntryForm
        key={`${employee.id}:${yearMonth}`}
        token={token}
        employeeName={employee.name}
        yearMonth={yearMonth}
        year={year}
        month={month}
        lastDay={lastDay}
        initialDaySettings={activeShifts.map((shift) => ({
          day: shift.date.getUTCDate(),
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes,
        }))}
        baseStartTime={employee.defaultStartTime}
        baseEndTime={employee.defaultEndTime}
        baseBreakMinutes={employee.defaultBreakMinutes}
      />
    </div>
  );
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthInfo(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, lastDay };
}

function isWeekend(date: Date) {
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function workMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start - breakMinutes);
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  if (hours === 0) return "0h";
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

function isSameShiftTime(
  shift: { startTime: string; endTime: string; breakMinutes: number },
  base: { startTime: string; endTime: string; breakMinutes: number },
) {
  return (
    shift.startTime === base.startTime &&
    shift.endTime === base.endTime &&
    shift.breakMinutes === base.breakMinutes
  );
}
