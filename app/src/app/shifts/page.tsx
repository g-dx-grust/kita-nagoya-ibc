import Link from "next/link";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import ShiftEditor from "./shift-editor";
import ShiftMonthEditor from "./shift-month-editor";
import CsvImport from "../masters/csv-import";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

// `/shifts` のデフォルトは「月モード」(Excel出勤表と同じレイアウト)。
// 日単位で時刻調整したい場合は ?date=YYYY-MM-DD を渡すか、月モードの行から
// 日単位画面へ遷移する。
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = new Date();

  if (sp.date) {
    const date = sp.date;
    const [start, end] = dayRange(date);
    const rows = await prisma.employee.findMany({
      where: { active: true },
      include: { shifts: { where: { date: { gte: start, lt: end } } } },
      orderBy: { name: "asc" },
    });
    const ym = date.slice(0, 7);
    return (
      <>
        <h1>シフト ・ 日単位 ({date})</h1>
        <div className="toolbar">
          <Link href={kitagoyaPath(`/shifts?yearMonth=${ym}`)}>← 月単位に戻る</Link>
        </div>
        <form className="panel toolbar" method="GET">
          <label>
            <span>対象日</span>
            <input name="date" type="date" defaultValue={date} />
          </label>
          <button type="submit" className="secondary">
            表示
          </button>
        </form>
        <ShiftEditor
          date={date}
          rows={rows.map((employee) => ({
            employee: {
              id: employee.id,
              name: employee.name,
              employmentType: employee.employmentType,
              affiliation: employee.affiliation,
              defaultStartTime: employee.defaultStartTime,
              defaultEndTime: employee.defaultEndTime,
              defaultBreakMinutes: employee.defaultBreakMinutes,
            },
            shift: employee.shifts[0]
              ? {
                  startTime: employee.shifts[0].startTime,
                  endTime: employee.shifts[0].endTime,
                  breakMinutes: employee.shifts[0].breakMinutes,
                  status: employee.shifts[0].status,
                }
              : null,
          }))}
        />
      </>
    );
  }

  const yearMonth =
    sp.yearMonth ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const { year, month, lastDay } = monthInfo(yearMonth);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [employees, shifts] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.shift.findMany({ where: { date: { gte: start, lt: end }, employee: { active: true } } }),
  ]);
  const presentShiftCount = shifts.filter((shift) => shift.status !== "off").length;
  const totalShiftCells = employees.length * lastDay;
  const registeredDayCount = new Set(
    shifts.filter((shift) => shift.status !== "off").map((shift) => shift.date.getUTCDate()),
  ).size;
  const totalWorkMinutes = shifts.reduce((sum, shift) => {
    if (shift.status === "off") return sum;
    return sum + Math.max(0, diffMinutes(shift.startTime, shift.endTime) - shift.breakMinutes);
  }, 0);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;

  const cellMap: Record<
    string,
    { startTime: string; endTime: string; breakMinutes: number; status: string }
  > = {};
  for (const s of shifts) {
    const d = s.date.getUTCDate();
    cellMap[`${s.employeeId}#${d}`] = {
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes,
      status: s.status,
    };
  }

  return (
    <>
      <div className="page-title-row">
        <h1>シフト ・ 月単位 ({yearMonth})</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?date=${firstDay}`)}>
            日単位画面
          </Link>
        </div>
      </div>
      <div className="shift-summary-grid">
        <div className="metric">
          <div className="metric-label">対象月</div>
          <div className="metric-value">{yearMonth}</div>
        </div>
        <div className="metric">
          <div className="metric-label">スタッフ</div>
          <div className="metric-value">{employees.length} 人</div>
        </div>
        <div className="metric">
          <div className="metric-label">出勤セル</div>
          <div className="metric-value">
            {presentShiftCount} / {totalShiftCells}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">出勤日数</div>
          <div className="metric-value">{registeredDayCount} 日</div>
        </div>
        <div className="metric">
          <div className="metric-label">勤務時間合計</div>
          <div className="metric-value">{formatHours(totalWorkMinutes)}</div>
        </div>
      </div>
      <ShiftMonthEditor
        key={yearMonth}
        yearMonth={yearMonth}
        year={year}
        month={month}
        lastDay={lastDay}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          affiliation: e.affiliation,
          defaultStartTime: e.defaultStartTime,
          defaultEndTime: e.defaultEndTime,
          defaultBreakMinutes: e.defaultBreakMinutes,
        }))}
        cells={cellMap}
      />

      <div className="panel after-table">
        <div className="toolbar flush-top">
          <strong>シフトCSV取り込み（前月15日公開の出勤表）</strong>
          <HelpTooltip text="従業員はマスター登録済みの正式名称で照合します。未登録の名称行はスキップされ、従業員マスターの基本勤務時間は上書きされません。" />
        </div>
        <CsvImport endpoint={kitagoyaApiPath("/import/shifts")} templateType="shifts" />
      </div>
    </>
  );
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function monthInfo(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { year: y, month: m, lastDay };
}

function diffMinutes(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}
