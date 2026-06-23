"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";

type Employee = {
  id: string;
  name: string;
  affiliation: string | null;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultBreakMinutes: number;
};
type ShiftCell = { startTime: string; endTime: string; breakMinutes: number; status: string };
type CellMap = Record<string, ShiftCell>;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function ShiftMonthEditor({
  yearMonth,
  year,
  month,
  lastDay,
  employees,
  cells,
}: {
  yearMonth: string;
  year: number;
  month: number;
  lastDay: number;
  employees: Employee[];
  cells: CellMap;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const days = useMemo(() => {
    const list: { day: number; weekday: string; isWeekend: boolean }[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      list.push({ day: d, weekday: WEEKDAYS[w], isWeekend: w === 0 || w === 6 });
    }
    return list;
  }, [year, month, lastDay]);

  const employeeStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        dayCount: number;
        customTimeCount: number;
        workMinutes: number;
      }
    >();
    for (const employee of employees) {
      let dayCount = 0;
      let customTimeCount = 0;
      let workMinutes = 0;
      for (const day of days) {
        const cell = cells[`${employee.id}#${day.day}`];
        if (!isPresentCell(cell)) continue;
        dayCount += 1;
        workMinutes += Math.max(0, diffMinutes(cell.startTime, cell.endTime) - cell.breakMinutes);
        if (hasCustomTime(cell, employee)) customTimeCount += 1;
      }
      stats.set(employee.id, { dayCount, customTimeCount, workMinutes });
    }
    return stats;
  }, [cells, days, employees]);

  const monthStats = useMemo(() => {
    let registeredCount = 0;
    let customTimeCount = 0;
    let workMinutes = 0;
    for (const employee of employees) {
      const stats = employeeStats.get(employee.id);
      registeredCount += stats?.dayCount ?? 0;
      customTimeCount += stats?.customTimeCount ?? 0;
      workMinutes += stats?.workMinutes ?? 0;
    }
    return { registeredCount, customTimeCount, workMinutes };
  }, [employeeStats, employees]);

  const visibleEmployees = useMemo(
    () =>
      employees.filter((employee) =>
        matchesQuery(query, [
          employee.name,
          employee.affiliation,
          employee.defaultStartTime,
          employee.defaultEndTime,
        ]),
      ),
    [employees, query],
  );

  function changeMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(kitagoyaPath(`/shifts?yearMonth=${ym}`));
  }

  return (
    <>
      <div className="panel shift-month-view-panel">
        <div className="shift-month-nav">
          <button type="button" className="secondary" onClick={() => changeMonth(-1)}>
            ← 前月
          </button>
          <strong>
            {year}年{month}月
          </strong>
          <button type="button" className="secondary" onClick={() => changeMonth(1)}>
            翌月 →
          </button>
        </div>
        <div className="shift-month-view-summary" aria-label="月次シフト概要">
          <span className="badge info">勤務登録 {monthStats.registeredCount}件</span>
          <span className="badge info">時間変更 {monthStats.customTimeCount}件</span>
          <span className="badge muted">見込 {formatMinutesAsHours(monthStats.workMinutes)}</span>
          <span className="badge muted">閲覧専用</span>
        </div>
      </div>

      <div className="panel shift-month-filter-panel shift-month-view-filter-panel">
        <div className="shift-month-filter-head">
          <span className="muted">入力済みシフトの確認</span>
        </div>
        <div className="shift-month-filter-body">
          <input
            className="filter-search"
            type="search"
            placeholder="スタッフ名・所属で検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="シフトスタッフを検索"
          />
          <span className="filter-count">
            表示 {visibleEmployees.length} / {employees.length} 人
          </span>
        </div>
      </div>

      <div className="month-grid-wrap">
        <div className="shift-scroll-hint">横スクロールで日付ごとのシフトを確認できます。</div>
        <table className="month-grid shift-month-view-table">
          <thead>
            <tr>
              <th className="sticky-col">スタッフ</th>
              {days.map((day) => (
                <th key={day.day} className={day.isWeekend ? "weekend" : ""}>
                  {day.day}
                  <div className="subtext">{day.weekday}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee) => {
              const stats = employeeStats.get(employee.id);
              return (
                <tr key={employee.id}>
                  <td className="sticky-col">
                    <div>
                      <strong>{employee.name}</strong>
                    </div>
                    <div className="subtext">
                      {employee.affiliation ?? "—"} ・ {stats?.dayCount ?? 0}日
                    </div>
                    {(stats?.customTimeCount ?? 0) > 0 && (
                      <div className="shift-row-badges">
                        <span className="badge info">時間変更 {stats?.customTimeCount}件</span>
                      </div>
                    )}
                  </td>
                  {days.map((day) => {
                    const cell = cells[`${employee.id}#${day.day}`];
                    const present = isPresentCell(cell);
                    const customTime = present && hasCustomTime(cell, employee);
                    return (
                      <td
                        key={day.day}
                        className={[
                          day.isWeekend ? "weekend" : "",
                          "shift-cell",
                          present ? "on" : "",
                          customTime ? "has-time" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        title={buildCellTitle(employee, month, day.day, day.weekday, cell)}
                      >
                        {present && (
                          <span className="shift-cell-inner">
                            <span className="shift-cell-mark">○</span>
                            {customTime && <span className="shift-cell-time">{formatShiftRange(cell)}</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {visibleEmployees.length === 0 && (
              <tr>
                <td colSpan={lastDay + 1} className="muted">
                  条件に一致するスタッフがいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function isPresentCell(cell: ShiftCell | undefined): cell is ShiftCell {
  return !!cell && cell.status !== "off";
}

function hasCustomTime(cell: ShiftCell, employee: Employee) {
  return (
    cell.startTime !== employee.defaultStartTime ||
    cell.endTime !== employee.defaultEndTime ||
    cell.breakMinutes !== employee.defaultBreakMinutes
  );
}

function buildCellTitle(
  employee: Employee,
  month: number,
  day: number,
  weekday: string,
  cell: ShiftCell | undefined,
) {
  if (!isPresentCell(cell)) return `${employee.name} / ${month}/${day} (${weekday}) / 休み`;
  return `${employee.name} / ${month}/${day} (${weekday}) / ${cell.startTime}-${cell.endTime} / 休憩 ${cell.breakMinutes}分`;
}

function diffMinutes(start: string, end: string) {
  const startMinutes = parseTimeMinutes(start);
  const endMinutes = parseTimeMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return endMinutes - startMinutes;
}

function parseTimeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function formatShiftRange(cell: ShiftCell) {
  return `${formatShiftTime(cell.startTime)}-${formatShiftTime(cell.endTime)}`;
}

function formatShiftTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  if (minute === 0) return `${hour}`;
  if (minute === 30) return `${hour}.5`;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
}
