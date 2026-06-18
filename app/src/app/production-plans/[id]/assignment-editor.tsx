"use client";

import { AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { kitagoyaApiPath } from "@/lib/paths";

type EmployeeOption = {
  id: string;
  name: string;
  employmentType: string;
  affiliation: string | null;
};

type AssignmentRow = {
  employeeId: string;
  startTime: string;
  endTime: string;
};

export default function AssignmentEditor({
  planId,
  employees,
  initialAssignments,
  defaultStartTime,
  defaultEndTime,
}: {
  planId: string;
  employees: EmployeeOption[];
  initialAssignments: AssignmentRow[];
  defaultStartTime: string;
  defaultEndTime: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AssignmentRow[]>(initialAssignments);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEmployeeIds = useMemo(() => new Set(rows.map((r) => r.employeeId)), [rows]);
  const duplicateEmployeeIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.employeeId) continue;
      counts.set(row.employeeId, (counts.get(row.employeeId) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([employeeId]) => employeeId));
  }, [rows]);
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        description: employee.affiliation || employmentTypeLabel(employee.employmentType),
        searchText: `${employee.name} ${employee.affiliation ?? ""} ${employmentTypeLabel(employee.employmentType)}`,
      })),
    [employees],
  );
  const validRows = rows.filter((row) => row.employeeId);
  const blankRows = rows.length - validRows.length;
  const invalidTimeRows = rows.filter((row) => row.employeeId && !isTimeRangeValid(row.startTime, row.endTime)).length;
  const duplicateRows = rows.filter((row) => row.employeeId && duplicateEmployeeIds.has(row.employeeId)).length;
  const totalMinutes = validRows.reduce((sum, row) => sum + assignmentMinutes(row.startTime, row.endTime), 0);
  const hasBlockingIssue = invalidTimeRows > 0 || duplicateRows > 0;
  const saveDisabled = busy || hasBlockingIssue;

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  function updateRow(index: number, patch: Partial<AssignmentRow>) {
    clearFeedback();
    const copy = [...rows];
    copy[index] = { ...copy[index], ...patch };
    setRows(copy);
  }

  function addRow() {
    clearFeedback();
    setRows([
      ...rows,
      {
        employeeId: "",
        startTime: defaultStartTime,
        endTime: defaultEndTime,
      },
    ]);
  }

  function removeRow(index: number) {
    clearFeedback();
    setRows(rows.filter((_, i) => i !== index));
  }

  function resetTimesToPlan() {
    clearFeedback();
    setRows(rows.map((row) => ({ ...row, startTime: defaultStartTime, endTime: defaultEndTime })));
  }

  async function save() {
    if (hasBlockingIssue) {
      setError("保存前に重複または時間を確認してください。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-plans/${planId}/assignments`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: rows.filter((r) => r.employeeId).map((r) => ({ ...r, moveAfterPlanId: null })),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(errorLabel(json.error, json.details));
      return;
    }
    setMessage("スタッフ配置を保存しました");
    router.refresh();
  }

  return (
    <div className="panel assignment-editor-panel">
      <div className="assignment-editor-head">
        <div>
          <strong>スタッフ配置</strong>
          <span className="subtext">
            {defaultStartTime} - {defaultEndTime}
          </span>
        </div>
        <div className="assignment-editor-head-actions">
          <button type="button" className="secondary" onClick={resetTimesToPlan} disabled={rows.length === 0}>
            <RefreshCw size={15} aria-hidden="true" />
            予定時間
          </button>
          <button type="button" className="secondary" onClick={addRow}>
            <Plus size={15} aria-hidden="true" />
            追加
          </button>
        </div>
      </div>

      <div className="assignment-summary-grid">
        <div className="metric">
          <span className="metric-label">
            <Users size={15} aria-hidden="true" />
            配置済み
          </span>
          <strong className="metric-value">{validRows.length}人</strong>
        </div>
        <div className="metric">
          <span className="metric-label">
            <Clock size={15} aria-hidden="true" />
            合計時間
          </span>
          <strong className="metric-value">{formatHours(totalMinutes)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">未選択行</span>
          <strong className="metric-value">{blankRows}件</strong>
        </div>
        <div className="metric">
          <span className="metric-label">確認</span>
          <strong className={hasBlockingIssue ? "metric-value warn-value" : "metric-value"}>
            {invalidTimeRows + duplicateRows}件
          </strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <button type="button" onClick={addRow}>
            <Plus size={16} aria-hidden="true" />
            スタッフを追加
          </button>
        </div>
      ) : (
        <div className="table-frame assignment-editor-frame">
          <table className="nested-table assignment-editor-table">
            <thead>
              <tr>
                <th>スタッフ</th>
                <th>開始</th>
                <th>終了</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const invalidTime = !!row.employeeId && !isTimeRangeValid(row.startTime, row.endTime);
                const duplicate = !!row.employeeId && duplicateEmployeeIds.has(row.employeeId);
                const ok = !!row.employeeId && !invalidTime && !duplicate;
                return (
                  <tr key={`${row.employeeId}-${index}`} className={invalidTime || duplicate ? "row-needs-action" : ""}>
                    <td data-label="スタッフ">
                      <SearchableCombobox
                        value={row.employeeId}
                        options={employeeOptions.map((option) => ({
                          ...option,
                          disabled: selectedEmployeeIds.has(option.value) && option.value !== row.employeeId,
                        }))}
                        emptyOptionLabel="選択"
                        placeholder="スタッフ名・所属で検索"
                        onChange={(employeeId) => updateRow(index, { employeeId })}
                      />
                    </td>
                    <td data-label="開始">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => updateRow(index, { startTime: e.target.value })}
                        aria-invalid={invalidTime}
                      />
                    </td>
                    <td data-label="終了">
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateRow(index, { endTime: e.target.value })}
                        aria-invalid={invalidTime}
                      />
                    </td>
                    <td data-label="状態">
                      {!row.employeeId && <span className="badge muted">未選択</span>}
                      {duplicate && (
                        <span className="badge danger">
                          <AlertTriangle size={13} aria-hidden="true" />
                          重複
                        </span>
                      )}
                      {invalidTime && (
                        <span className="badge danger">
                          <AlertTriangle size={13} aria-hidden="true" />
                          時間確認
                        </span>
                      )}
                      {ok && (
                        <span className="badge success">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          OK
                        </span>
                      )}
                    </td>
                    <td data-label="" className="action-cell">
                      <button type="button" className="secondary" onClick={() => removeRow(index)}>
                        <Trash2 size={15} aria-hidden="true" />
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="assignment-savebar">
        <div>
          <strong>{validRows.length}人を保存</strong>
          <span>{hasBlockingIssue ? "確認が必要な行があります" : "保存できます"}</span>
        </div>
        <button type="button" onClick={save} disabled={saveDisabled}>
          {busy ? "保存中..." : "スタッフ配置を保存"}
        </button>
      </div>
    </div>
  );
}

function isTimeRangeValid(startTime: string, endTime: string): boolean {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return Number.isFinite(start) && Number.isFinite(end) && start < end;
}

function assignmentMinutes(startTime: string, endTime: string): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

function formatHours(minutes: number) {
  if (minutes === 0) return "0h";
  const hours = minutes / 60;
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

function errorLabel(error: string | undefined, details: unknown) {
  if (error === "duplicate_employee_in_plan") return "同じ予定に同じスタッフが重複しています。";
  if (error === "invalid_time_range") return "終了時刻は開始時刻より後にしてください。";
  if (error === "employee_not_found_or_inactive") {
    return "無効または存在しないスタッフが含まれています。";
  }
  if (error === "employee_not_scheduled") {
    return "対象日のシフトに入っていないスタッフは配置できません。先にシフトを登録してください。";
  }
  if (error === "employee_assignment_outside_shift") {
    const d = details as { employee?: string; shift?: { startTime?: string; endTime?: string } } | undefined;
    return `${d?.employee ?? "スタッフ"} の勤務時間 (${d?.shift?.startTime ?? ""}-${d?.shift?.endTime ?? ""}) を超えています。`;
  }
  if (error === "employee_assignment_overlap") {
    const d = details as
      | {
          employee?: string;
          otherPlan?: { product?: string; workArea?: string; startTime?: string; endTime?: string };
        }
      | undefined;
    return `${d?.employee ?? "スタッフ"} は同じ時間帯に ${d?.otherPlan?.workArea ?? "別作業"} / ${
      d?.otherPlan?.product ?? "別予定"
    } (${d?.otherPlan?.startTime ?? ""}-${d?.otherPlan?.endTime ?? ""}) に配置済みです。`;
  }
  return "スタッフ配置の保存に失敗しました。";
}

function employmentTypeLabel(value: string) {
  if (value === "full_time") return "社員";
  if (value === "part_time") return "パート";
  if (value === "temporary") return "派遣";
  return value;
}
