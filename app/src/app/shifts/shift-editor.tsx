"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";

type EmployeeRow = {
  employee: {
    id: string;
    name: string;
    employmentType: string;
    affiliation: string | null;
    defaultStartTime: string;
    defaultEndTime: string;
    defaultBreakMinutes: number;
  };
  shift: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
    status: string;
  } | null;
};

type ShiftRow = {
  employeeId: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: "draft" | "confirmed" | "off";
};

type EmployeeDefaultRow = {
  employeeId: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

export default function ShiftEditor({ date, rows }: { date: string; rows: EmployeeRow[] }) {
  const router = useRouter();
  const [employeeDefaults, setEmployeeDefaults] = useState<EmployeeDefaultRow[]>(
    rows.map((row) => ({
      employeeId: row.employee.id,
      startTime: row.employee.defaultStartTime,
      endTime: row.employee.defaultEndTime,
      breakMinutes: row.employee.defaultBreakMinutes,
    })),
  );
  const [items, setItems] = useState<ShiftRow[]>(
    rows.map((row) => ({
      employeeId: row.employee.id,
      enabled: !!row.shift && row.shift.status !== "off",
      startTime: row.shift?.startTime ?? row.employee.defaultStartTime,
      endTime: row.shift?.endTime ?? row.employee.defaultEndTime,
      breakMinutes: row.shift?.breakMinutes ?? row.employee.defaultBreakMinutes,
      status: (row.shift?.status as ShiftRow["status"] | undefined) ?? "confirmed",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const presentCount = useMemo(
    () => items.filter((item) => item.enabled && item.status !== "off").length,
    [items],
  );
  const filteredRows = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
          matchesQuery(query, [
            row.employee.name,
            row.employee.affiliation,
            employmentTypeLabel(row.employee.employmentType),
          ]),
        ),
    [rows, query],
  );

  function update(index: number, patch: Partial<ShiftRow>) {
    const copy = [...items];
    copy[index] = { ...copy[index], ...patch };
    setItems(copy);
  }

  function updateDefault(index: number, patch: Partial<EmployeeDefaultRow>) {
    const copy = [...employeeDefaults];
    copy[index] = { ...copy[index], ...patch };
    setEmployeeDefaults(copy);
  }

  function applyDefaultToShift(index: number) {
    const defaults = employeeDefaults[index];
    update(index, {
      enabled: true,
      startTime: defaults.startTime,
      endTime: defaults.endTime,
      breakMinutes: defaults.breakMinutes,
      status: items[index].status === "off" ? "confirmed" : items[index].status,
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const shifts = items.map((item) => ({
      employeeId: item.employeeId,
      startTime: item.startTime,
      endTime: item.endTime,
      breakMinutes: item.breakMinutes,
      status: item.enabled ? item.status : "off",
    }));
    const res = await fetch(kitagoyaApiPath("/shifts"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, employeeDefaults, shifts }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        json.error === "invalid_time_range" || json.error === "invalid_default_work_time"
          ? "終了時刻は開始時刻より後にしてください。"
          : "保存に失敗しました。",
      );
      return;
    }
    setMessage("基本勤務時間とシフトを保存しました");
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <strong>出勤者 {presentCount}人</strong>
        <input
          className="filter-search"
          type="search"
          placeholder="スタッフ名・所属で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="シフトスタッフを検索"
        />
        <div className="spacer" />
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "保存中..." : "シフトを保存"}
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <table>
        <thead>
          <tr>
            <th>出勤</th>
            <th>スタッフ</th>
            <th>開始</th>
            <th>終了</th>
            <th>休憩(分)</th>
            <th>状態</th>
            <th>基本開始</th>
            <th>基本終了</th>
            <th>基本休憩</th>
            <th>基本反映</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map(({ row, index }) => {
            const item = items[index];
            const defaults = employeeDefaults[index];
            return (
              <tr key={row.employee.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) =>
                      update(index, {
                        enabled: e.target.checked,
                        status: e.target.checked ? "confirmed" : "off",
                      })
                    }
                  />
                </td>
                <td>
                  <strong>{row.employee.name}</strong>
                  {row.employee.affiliation && <div className="subtext">{row.employee.affiliation}</div>}
                </td>
                <td>
                  <input
                    type="time"
                    value={item.startTime}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { startTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={item.endTime}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { endTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={item.breakMinutes}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { breakMinutes: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <select
                    value={item.enabled ? item.status : "off"}
                    onChange={(e) => {
                      const status = e.target.value as ShiftRow["status"];
                      update(index, { status, enabled: status !== "off" });
                    }}
                  >
                    <option value="confirmed">確定</option>
                    <option value="draft">仮</option>
                    <option value="off">休み</option>
                  </select>
                </td>
                <td>
                  <input
                    type="time"
                    value={defaults.startTime}
                    onChange={(e) => updateDefault(index, { startTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={defaults.endTime}
                    onChange={(e) => updateDefault(index, { endTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={defaults.breakMinutes}
                    onChange={(e) => updateDefault(index, { breakMinutes: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button type="button" className="secondary mini" onClick={() => applyDefaultToShift(index)}>
                    反映
                  </button>
                </td>
              </tr>
            );
          })}
          {filteredRows.length === 0 && (
            <tr>
              <td colSpan={10} className="muted">
                条件に一致するスタッフがいません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function employmentTypeLabel(value: string) {
  if (value === "full_time") return "社員";
  if (value === "part_time") return "パート";
  if (value === "temporary") return "派遣";
  return value;
}
