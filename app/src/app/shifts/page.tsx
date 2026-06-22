import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Table2,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import ShiftEditor from "./shift-editor";
import ShiftChangeRequestPanel, { type ShiftChangeRequestRow } from "./shift-change-request-panel";
import ShiftMonthEditor from "./shift-month-editor";
import CsvImport from "../masters/csv-import";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { normalizeShiftChangeDays, type ShiftChangeDay } from "@/lib/shift-change-request";

export const dynamic = "force-dynamic";

type ShiftFlowCard = {
  label: string;
  count: number | string;
  detail: string;
  href: string;
  tone: "info" | "warn" | "success";
  Icon: LucideIcon;
};

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
  const todayString = toDateInputValue(today);

  if (sp.date) {
    const date = sp.date;
    const [start, end] = dayRange(date);
    const ym = date.slice(0, 7);
    const [rows, pendingRequests] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        include: { shifts: { where: { date: { gte: start, lt: end } } } },
        orderBy: { name: "asc" },
      }),
      prisma.shiftChangeRequest.findMany({
        where: { status: "pending", yearMonth: ym },
        include: { employee: true },
        orderBy: { requestedAt: "asc" },
      }),
    ]);
    const pendingRequestRows = pendingRequests.map(toShiftChangeRequestRow);
    const dayRows = rows.map((employee) => ({
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
    }));
    const dayPresentCount = dayRows.filter((row) => row.shift && row.shift.status !== "off").length;
    const dayOffCount = dayRows.length - dayPresentCount;
    const dayDraftCount = dayRows.filter((row) => row.shift?.status === "draft").length;
    const invalidShiftCount = dayRows.filter(
      (row) =>
        !!row.shift &&
        row.shift.status !== "off" &&
        !isValidWorkTime(row.shift.startTime, row.shift.endTime, row.shift.breakMinutes),
    ).length;
    const invalidDefaultCount = dayRows.filter(
      (row) =>
        !isValidWorkTime(
          row.employee.defaultStartTime,
          row.employee.defaultEndTime,
          row.employee.defaultBreakMinutes,
        ),
    ).length;
    const dayEstimatedMinutes = dayRows.reduce((sum, row) => {
      if (!row.shift || row.shift.status === "off") return sum;
      return sum + Math.max(0, diffMinutes(row.shift.startTime, row.shift.endTime) - row.shift.breakMinutes);
    }, 0);
    const dayNeedsReviewCount =
      (dayPresentCount === 0 ? 1 : 0) +
      dayDraftCount +
      invalidShiftCount +
      invalidDefaultCount +
      (pendingRequestRows.length > 0 ? 1 : 0);
    const dayTone = dayNeedsReviewCount > 0 ? "warn" : "success";
    const monthHref = kitagoyaPath(`/shifts?yearMonth=${ym}`);
    const allocateHref = kitagoyaPath(`/production-plans/allocate?date=${date}`);
    const dayNextAction =
      pendingRequestRows.length > 0
        ? { label: "修正申請を確認", href: "#shift-change-requests" }
        : dayPresentCount === 0
        ? { label: "出勤者を登録", href: "#shift-day-editor" }
        : dayNeedsReviewCount > 0
          ? { label: "要確認を修正", href: "#shift-day-editor" }
          : { label: "当日割り当て", href: allocateHref };
    const dayFlowCards: ShiftFlowCard[] = [
      {
        label: "対象日",
        count: date === todayString ? "今日" : date.slice(5).replace("-", "/"),
        detail: date,
        href: "#shift-day-date",
        tone: "info",
        Icon: CalendarDays,
      },
      {
        label: "出勤者",
        count: dayPresentCount,
        detail: `休み ${dayOffCount}人 / ${formatHours(dayEstimatedMinutes)}`,
        href: "#shift-day-editor",
        tone: dayPresentCount > 0 ? "success" : "warn",
        Icon: Users,
      },
      {
        label: "要確認",
        count: dayNeedsReviewCount,
        detail: `仮 ${dayDraftCount} / 申請 ${pendingRequestRows.length}`,
        href: "#shift-day-editor",
        tone: dayNeedsReviewCount > 0 ? "warn" : "success",
        Icon: AlertTriangle,
      },
      {
        label: "修正申請",
        count: pendingRequestRows.length,
        detail: "管理者確認",
        href: "#shift-change-requests",
        tone: pendingRequestRows.length > 0 ? "warn" : "success",
        Icon: ClipboardCheck,
      },
      {
        label: "割り当て",
        count: dayNeedsReviewCount === 0 && dayPresentCount > 0 ? "OK" : "要",
        detail: "当日人員割り当て",
        href: allocateHref,
        tone: dayNeedsReviewCount === 0 && dayPresentCount > 0 ? "success" : "info",
        Icon: ClipboardCheck,
      },
    ];

    return (
      <>
        <div className="page-title-row">
          <h1>シフト ・ 日単位 ({date})</h1>
          <div className="page-title-actions">
            <Link className="button-link secondary-link gap-2" href={monthHref}>
              <Table2 className="h-4 w-4" />
              月単位に戻る
            </Link>
            <Link className="button-link secondary-link gap-2" href={allocateHref}>
              <Users className="h-4 w-4" />
              当日割り当て
            </Link>
          </div>
        </div>
        <div className={`shift-flow-command ${dayTone}`}>
          <div className="shift-flow-title">
            {dayTone === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span className={`badge ${dayTone}`}>
              {dayNeedsReviewCount > 0 ? `要確認 ${dayNeedsReviewCount}` : "確認済み"}
            </span>
            <strong>日単位シフトの確認フロー</strong>
            <span className="subtext">
              出勤 {dayPresentCount}人 / 休み {dayOffCount}人 / 見込 {formatHours(dayEstimatedMinutes)}
            </span>
          </div>
          <Link className="shift-flow-next" href={dayNextAction.href}>
            次: {dayNextAction.label}
          </Link>
        </div>
        <ShiftFlowGrid cards={dayFlowCards} />
        <ShiftChangeRequestPanel requests={pendingRequestRows} />
        <form id="shift-day-date" className="panel toolbar anchor-offset" method="GET">
          <label>
            <span>対象日</span>
            <input name="date" type="date" defaultValue={date} />
          </label>
          <button type="submit" className="secondary">
            表示
          </button>
        </form>
        <div id="shift-day-editor" className="anchor-offset">
          <ShiftEditor date={date} rows={dayRows} />
        </div>
      </>
    );
  }

  const yearMonth =
    sp.yearMonth ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const { year, month, lastDay } = monthInfo(yearMonth);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [employees, shifts, pendingRequests] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.shift.findMany({ where: { date: { gte: start, lt: end }, employee: { active: true } } }),
    prisma.shiftChangeRequest.findMany({
      where: { status: "pending", yearMonth },
      include: { employee: true },
      orderBy: { requestedAt: "asc" },
    }),
  ]);
  const pendingRequestRows = pendingRequests.map(toShiftChangeRequestRow);
  const presentShiftCount = shifts.filter((shift) => shift.status !== "off").length;
  const totalShiftCells = employees.length * lastDay;
  const registeredDayCount = new Set(
    shifts.filter((shift) => shift.status !== "off").map((shift) => shift.date.getUTCDate()),
  ).size;
  const daysWithoutStaff = Math.max(0, lastDay - registeredDayCount);
  const employeeIdsWithShift = new Set(
    shifts.filter((shift) => shift.status !== "off").map((shift) => shift.employeeId),
  );
  const employeesWithoutShift = employees.filter((employee) => !employeeIdsWithShift.has(employee.id)).length;
  const totalWorkMinutes = shifts.reduce((sum, shift) => {
    if (shift.status === "off") return sum;
    return sum + Math.max(0, diffMinutes(shift.startTime, shift.endTime) - shift.breakMinutes);
  }, 0);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const focusDay = yearMonth === todayString.slice(0, 7) ? todayString : firstDay;
  const monthReviewCount =
    (presentShiftCount === 0 ? 1 : 0) +
    (daysWithoutStaff > 0 ? 1 : 0) +
    (employeesWithoutShift > 0 ? 1 : 0) +
    (pendingRequestRows.length > 0 ? 1 : 0);
  const monthTone = monthReviewCount > 0 ? "warn" : "success";
  const monthNextAction = pendingRequestRows.length > 0
    ? { label: "修正申請を確認", href: "#shift-change-requests" }
    : presentShiftCount === 0
    ? { label: "月シフトを登録", href: "#shift-month-editor" }
    : monthReviewCount > 0
      ? { label: "要確認を確認", href: "#shift-month-editor" }
      : { label: "日単位で調整", href: kitagoyaPath(`/shifts?date=${focusDay}`) };
  const monthFlowCards: ShiftFlowCard[] = [
    {
      label: "対象月",
      count: yearMonth,
      detail: `${lastDay}日 / ${employees.length}人`,
      href: "#shift-month-editor",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "出勤セル",
      count: presentShiftCount,
      detail: `${presentShiftCount} / ${totalShiftCells}`,
      href: "#shift-month-editor",
      tone: presentShiftCount > 0 ? "success" : "warn",
      Icon: Users,
    },
    {
      label: "未登録日",
      count: daysWithoutStaff,
      detail: `出勤日 ${registeredDayCount}日`,
      href: "#shift-month-editor",
      tone: daysWithoutStaff > 0 ? "warn" : "success",
      Icon: AlertTriangle,
    },
    {
      label: "日単位",
      count: focusDay.slice(8),
      detail: "個別時刻調整",
      href: kitagoyaPath(`/shifts?date=${focusDay}`),
      tone: "info",
      Icon: Table2,
    },
    {
      label: "修正申請",
      count: pendingRequestRows.length,
      detail: "管理者確認",
      href: "#shift-change-requests",
      tone: pendingRequestRows.length > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "割り当て",
      count: monthReviewCount === 0 ? "OK" : "要",
      detail: focusDay,
      href: kitagoyaPath(`/production-plans/allocate?date=${focusDay}`),
      tone: monthReviewCount === 0 ? "success" : "info",
      Icon: ClipboardCheck,
    },
    {
      label: "CSV取込",
      count: "取込",
      detail: "出勤表CSV",
      href: "#shift-csv-import",
      tone: presentShiftCount > 0 ? "info" : "warn",
      Icon: Upload,
    },
  ];

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
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/shifts?date=${focusDay}`)}>
            <Table2 className="h-4 w-4" />
            日単位画面
          </Link>
          <Link className="button-link secondary-link gap-2" href="#shift-csv-import">
            <Upload className="h-4 w-4" />
            CSV取り込み
          </Link>
        </div>
      </div>
      <div className={`shift-flow-command ${monthTone}`}>
        <div className="shift-flow-title">
          {monthTone === "success" ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span className={`badge ${monthTone}`}>
            {monthReviewCount > 0 ? `要確認 ${monthReviewCount}` : "確認済み"}
          </span>
          <strong>月次シフトの確認フロー</strong>
          <span className="subtext">
            出勤セル {presentShiftCount} / {totalShiftCells} / 勤務時間 {formatHours(totalWorkMinutes)}
          </span>
        </div>
        <Link className="shift-flow-next" href={monthNextAction.href}>
          次: {monthNextAction.label}
        </Link>
      </div>
      <ShiftFlowGrid cards={monthFlowCards} />
      <ShiftChangeRequestPanel requests={pendingRequestRows} />
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
      <div id="shift-month-editor" className="anchor-offset">
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
      </div>

      <div id="shift-csv-import" className="panel after-table anchor-offset">
        <div className="toolbar flush-top">
          <strong>シフトCSV取り込み（前月15日公開の出勤表）</strong>
          <HelpTooltip text="従業員はマスター登録済みの正式名称で照合します。未登録の名称行はスキップされ、従業員マスターの基本勤務時間は上書きされません。" />
        </div>
        <CsvImport endpoint={kitagoyaApiPath("/import/shifts")} templateType="shifts" />
      </div>
    </>
  );
}

function ShiftFlowGrid({ cards }: { cards: ShiftFlowCard[] }) {
  return (
    <div className="shift-flow-grid" aria-label="シフト確認フロー">
      {cards.map(({ label, count, detail, href, tone, Icon }) => (
        <Link key={label} className={`shift-flow-card ${tone}`} href={href}>
          <span>
            <Icon size={15} aria-hidden="true" />
            {label}
          </span>
          <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
          <small>{detail}</small>
        </Link>
      ))}
    </div>
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

function isValidWorkTime(startTime: string, endTime: string, breakMinutes: number) {
  return breakMinutes >= 0 && diffMinutes(startTime, endTime) - breakMinutes > 0;
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toShiftChangeRequestRow(request: {
  id: string;
  yearMonth: string;
  requestedAt: Date;
  currentDaysJson: unknown;
  requestedDaysJson: unknown;
  employee: { name: string };
}): ShiftChangeRequestRow {
  return {
    id: request.id,
    employeeName: request.employee.name,
    yearMonth: request.yearMonth,
    requestedAt: request.requestedAt.toISOString().slice(0, 16).replace("T", " "),
    currentDays: parseShiftChangeDays(request.currentDaysJson),
    requestedDays: parseShiftChangeDays(request.requestedDaysJson),
  };
}

function parseShiftChangeDays(value: unknown): ShiftChangeDay[] {
  let rows: unknown;
  try {
    rows = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return normalizeShiftChangeDays(
    rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const candidate = row as Partial<ShiftChangeDay>;
      if (
        typeof candidate.day !== "number" ||
        typeof candidate.startTime !== "string" ||
        typeof candidate.endTime !== "string" ||
        typeof candidate.breakMinutes !== "number"
      ) {
        return [];
      }
      return [
        {
          day: candidate.day,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          breakMinutes: candidate.breakMinutes,
        },
      ];
    }),
  );
}
