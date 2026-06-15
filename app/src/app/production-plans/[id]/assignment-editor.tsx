"use client";

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

  function updateRow(index: number, patch: Partial<AssignmentRow>) {
    const copy = [...rows];
    copy[index] = { ...copy[index], ...patch };
    setRows(copy);
  }

  async function save() {
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
    <div className="panel">
      {rows.length === 0 ? (
        <div className="empty-state">まだスタッフ配置がありません。</div>
      ) : (
        <table className="nested-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>開始</th>
              <th>終了</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.employeeId}-${index}`}>
                <td>
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
                <td>
                  <input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updateRow(index, { startTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updateRow(index, { endTime: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="row form-actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setRows([
              ...rows,
              {
                employeeId: "",
                startTime: defaultStartTime,
                endTime: defaultEndTime,
              },
            ])
          }
        >
          ＋ スタッフを追加
        </button>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "保存中..." : "スタッフ配置を保存"}
        </button>
      </div>
    </div>
  );
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
