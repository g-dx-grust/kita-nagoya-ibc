"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";

type Employee = {
  id: string;
  name: string;
  affiliation: string | null;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultBreakMinutes: number;
};
type CellState = "present" | "off";
type CellMap = Record<
  string,
  { startTime: string; endTime: string; breakMinutes: number; status: string }
>;
type DefaultWorkTime = { startTime: string; endTime: string; breakMinutes: number };

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

  const [bulkStart, setBulkStart] = useState("09:00");
  const [bulkEnd, setBulkEnd] = useState("17:00");
  const [bulkBreak, setBulkBreak] = useState(60);
  const [employeeDefaults, setEmployeeDefaults] = useState<Record<string, DefaultWorkTime>>(
    Object.fromEntries(
      employees.map((employee) => [
        employee.id,
        {
          startTime: employee.defaultStartTime,
          endTime: employee.defaultEndTime,
          breakMinutes: employee.defaultBreakMinutes,
        },
      ]),
    ),
  );

  // grid[employeeId][day] = "present" | "off"
  const initialGrid: Record<string, Record<number, CellState>> = useMemo(() => {
    const g: Record<string, Record<number, CellState>> = {};
    for (const e of employees) {
      g[e.id] = {};
      for (let d = 1; d <= lastDay; d++) {
        const found = cells[`${e.id}#${d}`];
        g[e.id][d] = found && found.status !== "off" ? "present" : "off";
      }
    }
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth]);

  const [grid, setGrid] = useState(initialGrid);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const days = useMemo(() => {
    const list: { day: number; weekday: string; isWeekend: boolean }[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      list.push({ day: d, weekday: WEEKDAYS[w], isWeekend: w === 0 || w === 6 });
    }
    return list;
  }, [year, month, lastDay]);

  function toggle(empId: string, day: number) {
    setGrid((prev) => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [day]: prev[empId][day] === "present" ? "off" : "present",
      },
    }));
  }

  function fillEmployee(empId: string, weekdaysOnly: boolean) {
    setGrid((prev) => {
      const next = { ...prev, [empId]: { ...prev[empId] } };
      for (const d of days) {
        if (weekdaysOnly && d.isWeekend) continue;
        next[empId][d.day] = "present";
      }
      return next;
    });
  }
  function clearEmployee(empId: string) {
    setGrid((prev) => {
      const next = { ...prev, [empId]: { ...prev[empId] } };
      for (let d = 1; d <= lastDay; d++) next[empId][d] = "off";
      return next;
    });
  }
  function fillColumn(day: number) {
    setGrid((prev) => {
      const next: typeof prev = {};
      for (const e of employees) {
        const allOn = employees.every((emp) => prev[emp.id][day] === "present");
        next[e.id] = { ...prev[e.id], [day]: allOn ? "off" : "present" };
      }
      return next;
    });
  }
  function fillAllWeekdays() {
    setGrid((prev) => {
      const next: typeof prev = {};
      for (const e of employees) {
        next[e.id] = { ...prev[e.id] };
        for (const d of days) {
          if (!d.isWeekend) next[e.id][d.day] = "present";
        }
      }
      return next;
    });
  }
  function clearAll() {
    setGrid((prev) => {
      const next: typeof prev = {};
      for (const e of employees) {
        next[e.id] = {};
        for (let d = 1; d <= lastDay; d++) next[e.id][d] = "off";
      }
      return next;
    });
  }
  function updateEmployeeDefault(empId: string, patch: Partial<DefaultWorkTime>) {
    setEmployeeDefaults((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], ...patch },
    }));
  }
  function applyBulkDefaults() {
    setEmployeeDefaults((prev) => {
      const next: typeof prev = {};
      for (const e of employees) {
        next[e.id] = {
          ...(prev[e.id] ?? {
            startTime: e.defaultStartTime,
            endTime: e.defaultEndTime,
            breakMinutes: e.defaultBreakMinutes,
          }),
          startTime: bulkStart,
          endTime: bulkEnd,
          breakMinutes: bulkBreak,
        };
      }
      return next;
    });
  }

  const totalCells = employees.length * lastDay;
  const presentCount = useMemo(
    () =>
      employees.reduce(
        (sum, e) =>
          sum + days.reduce((acc, d) => acc + (grid[e.id][d.day] === "present" ? 1 : 0), 0),
        0,
      ),
    [grid, employees, days],
  );
  const visibleEmployees = useMemo(
    () =>
      employees.filter((employee) =>
        matchesQuery(query, [employee.name, employee.affiliation, employee.defaultStartTime, employee.defaultEndTime]),
      ),
    [employees, query],
  );

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const cellsPayload: {
      employeeId: string;
      day: number;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      status: "confirmed";
    }[] = [];
    for (const e of employees) {
      const defaults = employeeDefaults[e.id];
      for (let d = 1; d <= lastDay; d++) {
        if (grid[e.id][d] === "present") {
          cellsPayload.push({
            employeeId: e.id,
            day: d,
            startTime: defaults.startTime,
            endTime: defaults.endTime,
            breakMinutes: defaults.breakMinutes,
            status: "confirmed",
          });
        }
      }
    }
    const res = await fetch(kitagoyaApiPath("/shifts/month"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth,
        defaults: {
          startTime: bulkStart,
          endTime: bulkEnd,
          breakMinutes: bulkBreak,
          status: "confirmed",
        },
        employeeDefaults: employees.map((employee) => ({
          employeeId: employee.id,
          startTime: employeeDefaults[employee.id].startTime,
          endTime: employeeDefaults[employee.id].endTime,
          breakMinutes: employeeDefaults[employee.id].breakMinutes,
        })),
        cells: cellsPayload,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        json.error === "invalid_time_range" || json.error === "invalid_default_work_time"
          ? "終了時刻は開始時刻より後にしてください。"
          : `保存に失敗しました: ${json.error ?? "unknown"}`,
      );
      return;
    }
    setMessage(`${json.count} 件のシフトと基本勤務時間を保存しました`);
    router.refresh();
  }

  function changeMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(kitagoyaPath(`/shifts?yearMonth=${ym}`));
  }

  return (
    <>
      <div className="panel toolbar">
        <button type="button" className="secondary" onClick={() => changeMonth(-1)}>
          ← 前月
        </button>
        <strong>{year}年{month}月</strong>
        <button type="button" className="secondary" onClick={() => changeMonth(1)}>
          翌月 →
        </button>
        <div className="spacer" />
        <label>
          <span>一括 基本開始</span>
          <input type="time" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
        </label>
        <label>
          <span>一括 基本終了</span>
          <input type="time" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
        </label>
        <label>
          <span>一括 休憩(分)</span>
          <input
            type="number"
            min={0}
            step={5}
            value={bulkBreak}
            onChange={(e) => setBulkBreak(Number(e.target.value))}
          />
        </label>
        <button type="button" className="secondary" onClick={applyBulkDefaults}>
          全員の基本に反映
        </button>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "保存中..." : "月一括保存"}
        </button>
      </div>

      <div className="panel toolbar">
        <span className="muted">
          出勤セル {presentCount} / {totalCells}
        </span>
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
        <div className="spacer" />
        <button type="button" className="secondary" onClick={fillAllWeekdays}>
          全員の平日を出勤
        </button>
        <button type="button" className="secondary" onClick={clearAll}>
          全てクリア
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="month-grid-wrap">
        <table className="month-grid">
          <thead>
            <tr>
              <th className="sticky-col">スタッフ</th>
              <th>基本開始</th>
              <th>基本終了</th>
              <th>休憩</th>
              {days.map((d) => (
                <th
                  key={d.day}
                  className={d.isWeekend ? "weekend" : ""}
                  onClick={() => fillColumn(d.day)}
                  title="クリックで列を切替"
                  style={{ cursor: "pointer" }}
                >
                  {d.day}
                  <div className="subtext">{d.weekday}</div>
                </th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((e) => {
              const row = grid[e.id];
              const defaults = employeeDefaults[e.id];
              const dayCount = days.reduce(
                (a, d) => a + (row[d.day] === "present" ? 1 : 0),
                0,
              );
              return (
                <tr key={e.id}>
                  <td className="sticky-col">
                    <div>
                      <strong>{e.name}</strong>
                    </div>
                    <div className="subtext">
                      {e.affiliation ?? "—"} ・ {dayCount}日
                    </div>
                  </td>
                  <td className="shift-default-cell">
                    <input
                      type="time"
                      value={defaults.startTime}
                      onChange={(event) => updateEmployeeDefault(e.id, { startTime: event.target.value })}
                    />
                  </td>
                  <td className="shift-default-cell">
                    <input
                      type="time"
                      value={defaults.endTime}
                      onChange={(event) => updateEmployeeDefault(e.id, { endTime: event.target.value })}
                    />
                  </td>
                  <td className="shift-default-cell">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={defaults.breakMinutes}
                      onChange={(event) =>
                        updateEmployeeDefault(e.id, { breakMinutes: Number(event.target.value) })
                      }
                    />
                  </td>
                  {days.map((d) => {
                    const on = row[d.day] === "present";
                    return (
                      <td
                        key={d.day}
                        className={`${d.isWeekend ? "weekend" : ""} cell-toggle ${on ? "on" : ""}`}
                        onClick={() => toggle(e.id, d.day)}
                        title={`${e.name} / ${month}/${d.day} (${d.weekday})`}
                      >
                        {on ? "○" : ""}
                      </td>
                    );
                  })}
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button
                        type="button"
                        className="secondary mini"
                        onClick={() => fillEmployee(e.id, true)}
                        title="平日全部出勤"
                      >
                        平日
                      </button>
                      <button
                        type="button"
                        className="secondary mini"
                        onClick={() => fillEmployee(e.id, false)}
                        title="全日出勤"
                      >
                        全日
                      </button>
                      <button
                        type="button"
                        className="secondary mini"
                        onClick={() => clearEmployee(e.id)}
                      >
                        休
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleEmployees.length === 0 && (
              <tr>
                <td colSpan={lastDay + 5} className="muted">
                  条件に一致するスタッフがいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        ・セルクリックで出勤/休を切替。列の日付ヘッダーをクリックすると全員の出勤を一括切替できます。<br />
        ・基本開始/終了/休憩は従業員ごとの基本勤務時間として保存され、月一括保存した出勤セルの時刻にも反映されます。<br />
        ・個別に時刻を変えたい日は、保存後{" "}
        <Link href={kitagoyaPath(`/shifts?date=${year}-${String(month).padStart(2, "0")}-01`)}>日単位画面</Link>{" "}
        から調整してください。<br />
        ・月一括保存を押すと、その月の他のシフト記録は <strong>セル選択された出勤者だけに置き換わります</strong>。
      </p>
    </>
  );
}
