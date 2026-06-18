"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { employmentTypeLabel } from "@/lib/labels";
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
  const [reviewOnly, setReviewOnly] = useState(false);

  const presentCount = useMemo(
    () => items.filter((item) => item.enabled && item.status !== "off").length,
    [items],
  );

  const rowReviews = useMemo(
    () =>
      items.map((item, index) => {
        const defaults = employeeDefaults[index];
        const isWorking = item.enabled && item.status !== "off";
        const invalidShift = isWorking && !isValidWorkTime(item.startTime, item.endTime, item.breakMinutes);
        const invalidDefault = !isValidWorkTime(defaults.startTime, defaults.endTime, defaults.breakMinutes);
        const isDraft = isWorking && item.status === "draft";
        const isOff = !isWorking;
        const calculatedWorkMinutes = workMinutesFor(item.startTime, item.endTime, item.breakMinutes);
        const workMinutes = isWorking && Number.isFinite(calculatedWorkMinutes) ? Math.max(0, calculatedWorkMinutes) : 0;

        return {
          invalidShift,
          invalidDefault,
          isDraft,
          isOff,
          workMinutes,
          needsReview: invalidShift || invalidDefault || isDraft || isOff,
        };
      }),
    [employeeDefaults, items],
  );

  const reviewSummary = useMemo(
    () =>
      rowReviews.reduce(
        (summary, review) => ({
          offCount: summary.offCount + (review.isOff ? 1 : 0),
          draftCount: summary.draftCount + (review.isDraft ? 1 : 0),
          invalidShiftCount: summary.invalidShiftCount + (review.invalidShift ? 1 : 0),
          invalidDefaultCount: summary.invalidDefaultCount + (review.invalidDefault ? 1 : 0),
          needsReviewCount: summary.needsReviewCount + (review.needsReview ? 1 : 0),
          estimatedWorkMinutes: summary.estimatedWorkMinutes + review.workMinutes,
        }),
        {
          offCount: 0,
          draftCount: 0,
          invalidShiftCount: 0,
          invalidDefaultCount: 0,
          needsReviewCount: 0,
          estimatedWorkMinutes: 0,
        },
      ),
    [rowReviews],
  );

  const filteredRows = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row, index }) => {
          const matches = matchesQuery(query, [
            row.employee.name,
            row.employee.affiliation,
            employmentTypeLabel(row.employee.employmentType),
          ]);
          return matches && (!reviewOnly || rowReviews[index]?.needsReview);
        }),
    [rows, query, reviewOnly, rowReviews],
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
    <div className="panel shift-day-panel">
      <div className="shift-day-command">
        <div className="shift-day-command-title">
          <strong>日別シフト確認</strong>
          <span className={`badge ${reviewSummary.needsReviewCount > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsReviewCount > 0 ? `要確認 ${reviewSummary.needsReviewCount}人` : "整備済み"}
          </span>
        </div>
        <div className="shift-day-checks">
          <span className="badge info">出勤 {presentCount}人</span>
          <span className={`badge ${reviewSummary.offCount > 0 ? "muted" : "success"}`}>
            休み {reviewSummary.offCount}人
          </span>
          <span className={`badge ${reviewSummary.draftCount > 0 ? "warn" : "success"}`}>
            仮 {reviewSummary.draftCount}人
          </span>
          <span className={`badge ${reviewSummary.invalidShiftCount > 0 ? "danger" : "success"}`}>
            時刻要確認 {reviewSummary.invalidShiftCount}件
          </span>
          <span className={`badge ${reviewSummary.invalidDefaultCount > 0 ? "warn" : "success"}`}>
            基本時間要確認 {reviewSummary.invalidDefaultCount}件
          </span>
          <span className="badge muted">見込 {formatMinutesAsHours(reviewSummary.estimatedWorkMinutes)}</span>
        </div>
      </div>

      <div className="toolbar shift-day-toolbar">
        <strong>
          表示 {filteredRows.length}人 / 全{rows.length}人
        </strong>
        <input
          className="filter-search"
          type="search"
          placeholder="スタッフ名・所属で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="シフトスタッフを検索"
        />
        <label className="filter-check">
          <input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} />
          要確認のみ
        </label>
        <div className="spacer" />
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "保存中..." : "シフトを保存"}
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="table-frame shift-day-frame">
        <table className="shift-day-table">
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
            const review = rowReviews[index];
            return (
              <tr key={row.employee.id} className={`shift-day-row ${review?.needsReview ? "row-needs-action" : ""}`}>
                <td data-label="出勤">
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
                <td data-label="スタッフ" className="shift-day-staff-cell">
                  <strong>{row.employee.name}</strong>
                  {row.employee.affiliation && <div className="subtext">{row.employee.affiliation}</div>}
                  <div className="shift-day-row-badges">
                    {review?.isOff && <span className="badge muted">休み</span>}
                    {review?.isDraft && <span className="badge warn">仮</span>}
                    {review?.invalidShift && <span className="badge danger">時刻要確認</span>}
                    {review?.invalidDefault && <span className="badge warn">基本時間要確認</span>}
                  </div>
                </td>
                <td data-label="開始">
                  <input
                    type="time"
                    value={item.startTime}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { startTime: e.target.value })}
                  />
                </td>
                <td data-label="終了">
                  <input
                    type="time"
                    value={item.endTime}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { endTime: e.target.value })}
                  />
                </td>
                <td data-label="休憩(分)">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={item.breakMinutes}
                    disabled={!item.enabled}
                    onChange={(e) => update(index, { breakMinutes: Number(e.target.value) })}
                  />
                </td>
                <td data-label="状態">
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
                <td data-label="基本開始">
                  <input
                    type="time"
                    value={defaults.startTime}
                    onChange={(e) => updateDefault(index, { startTime: e.target.value })}
                  />
                </td>
                <td data-label="基本終了">
                  <input
                    type="time"
                    value={defaults.endTime}
                    onChange={(e) => updateDefault(index, { endTime: e.target.value })}
                  />
                </td>
                <td data-label="基本休憩">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={defaults.breakMinutes}
                    onChange={(e) => updateDefault(index, { breakMinutes: Number(e.target.value) })}
                  />
                </td>
                <td data-label="基本反映" className="shift-day-action-cell">
                  <button type="button" className="secondary mini" onClick={() => applyDefaultToShift(index)}>
                    反映
                  </button>
                </td>
              </tr>
            );
          })}
          {filteredRows.length === 0 && (
            <tr className="shift-day-empty-row">
              <td colSpan={10} className="muted">
                条件に一致するスタッフがいません。
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function parseTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function workMinutesFor(startTime: string, endTime: string, breakMinutes: number) {
  const start = parseTimeMinutes(startTime);
  const end = parseTimeMinutes(endTime);
  if (start === null || end === null || !Number.isFinite(breakMinutes)) return 0;
  return end - start - breakMinutes;
}

function isValidWorkTime(startTime: string, endTime: string, breakMinutes: number) {
  if (breakMinutes < 0) return false;
  return workMinutesFor(startTime, endTime, breakMinutes) > 0;
}

function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}
