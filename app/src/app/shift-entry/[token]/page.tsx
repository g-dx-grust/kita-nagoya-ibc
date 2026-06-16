import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
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
        <h1>シフト入力</h1>
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
  const firstShift = activeShifts[0];

  return (
    <div className="self-shift-page">
      <div className="toolbar">
        <h1>シフト入力</h1>
        <div className="spacer" />
        <Link href={kitagoyaPath("/")}>管理画面へ</Link>
      </div>
      <StaffShiftEntryForm
        token={token}
        employeeName={employee.name}
        yearMonth={yearMonth}
        year={year}
        month={month}
        lastDay={lastDay}
        initialWorkingDays={activeShifts.map((shift) => shift.date.getUTCDate())}
        initialStartTime={firstShift?.startTime ?? employee.defaultStartTime}
        initialEndTime={firstShift?.endTime ?? employee.defaultEndTime}
        initialBreakMinutes={firstShift?.breakMinutes ?? employee.defaultBreakMinutes}
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
