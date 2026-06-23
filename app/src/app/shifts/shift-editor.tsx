"use client";

import { useMemo, useState } from "react";
import { employmentTypeLabel } from "@/lib/labels";
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

type ShiftViewRow = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: string;
};

export default function ShiftEditor({ rows }: { date: string; rows: EmployeeRow[] }) {
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);

  const items = useMemo<ShiftViewRow[]>(
    () =>
      rows.map((row) => ({
        enabled: !!row.shift && row.shift.status !== "off",
        startTime: row.shift?.startTime ?? row.employee.defaultStartTime,
        endTime: row.shift?.endTime ?? row.employee.defaultEndTime,
        breakMinutes: row.shift?.breakMinutes ?? row.employee.defaultBreakMinutes,
        status: row.shift?.status ?? "off",
      })),
    [rows],
  );

  const presentCount = useMemo(
    () => items.filter((item) => item.enabled && item.status !== "off").length,
    [items],
  );

  const rowReviews = useMemo(
    () =>
      items.map((item) => {
        const isWorking = item.enabled && item.status !== "off";
        const invalidShift = isWorking && !isValidWorkTime(item.startTime, item.endTime, item.breakMinutes);
        const isDraft = isWorking && item.status === "draft";
        const calculatedWorkMinutes = workMinutesFor(item.startTime, item.endTime, item.breakMinutes);
        const workMinutes = isWorking && Number.isFinite(calculatedWorkMinutes) ? Math.max(0, calculatedWorkMinutes) : 0;

        return {
          invalidShift,
          isDraft,
          isOff: !isWorking,
          workMinutes,
          needsReview: invalidShift || isDraft,
        };
      }),
    [items],
  );

  const reviewSummary = useMemo(
    () =>
      rowReviews.reduce(
        (summary, review) => ({
          offCount: summary.offCount + (review.isOff ? 1 : 0),
          draftCount: summary.draftCount + (review.isDraft ? 1 : 0),
          invalidShiftCount: summary.invalidShiftCount + (review.invalidShift ? 1 : 0),
          needsReviewCount: summary.needsReviewCount + (review.needsReview ? 1 : 0),
          estimatedWorkMinutes: summary.estimatedWorkMinutes + review.workMinutes,
        }),
        {
          offCount: 0,
          draftCount: 0,
          invalidShiftCount: 0,
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

  return (
    <div className="panel shift-day-panel">
      <div className="shift-day-command">
        <div className="shift-day-command-title">
          <strong>日別シフト確認</strong>
          <span className={`badge ${reviewSummary.needsReviewCount > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsReviewCount > 0 ? `確認あり ${reviewSummary.needsReviewCount}人` : "確認済み"}
          </span>
          <span className="badge muted">閲覧専用</span>
        </div>
        <div className="shift-day-checks">
          <span className="badge info">出勤 {presentCount}人</span>
          <span className="badge muted">休み {reviewSummary.offCount}人</span>
          <span className={`badge ${reviewSummary.draftCount > 0 ? "warn" : "muted"}`}>
            仮 {reviewSummary.draftCount}人
          </span>
          <span className={`badge ${reviewSummary.invalidShiftCount > 0 ? "danger" : "muted"}`}>
            時刻確認 {reviewSummary.invalidShiftCount}件
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
          確認ありのみ
        </label>
      </div>

      <div className="table-frame shift-day-frame">
        <table className="shift-day-table">
          <thead>
            <tr>
              <th>勤務</th>
              <th>スタッフ</th>
              <th>開始</th>
              <th>終了</th>
              <th>休憩(分)</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ row, index }) => {
              const item = items[index];
              const review = rowReviews[index];
              return (
                <tr key={row.employee.id} className={`shift-day-row ${review?.needsReview ? "row-needs-action" : ""}`}>
                  <td data-label="勤務">
                    <span className={`shift-day-presence ${item.enabled ? "on" : "off"}`}>
                      {item.enabled ? "○" : "—"}
                    </span>
                  </td>
                  <td data-label="スタッフ" className="shift-day-staff-cell">
                    <strong>{row.employee.name}</strong>
                    {row.employee.affiliation && <div className="subtext">{row.employee.affiliation}</div>}
                    <div className="shift-day-row-badges">
                      {review?.isDraft && <span className="badge warn">仮</span>}
                      {review?.invalidShift && <span className="badge danger">時刻確認</span>}
                    </div>
                  </td>
                  <td data-label="開始">{item.enabled ? item.startTime : "—"}</td>
                  <td data-label="終了">{item.enabled ? item.endTime : "—"}</td>
                  <td data-label="休憩(分)">{item.enabled ? item.breakMinutes : "—"}</td>
                  <td data-label="状態">{statusLabel(item.enabled ? item.status : "off")}</td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr className="shift-day-empty-row">
                <td colSpan={6} className="muted">
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

function statusLabel(status: string) {
  if (status === "draft") return "仮";
  if (status === "confirmed") return "確定";
  if (status === "off") return "休み";
  return status;
}

function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}
