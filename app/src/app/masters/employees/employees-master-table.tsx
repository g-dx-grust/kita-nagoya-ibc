"use client";

import { useMemo, useState } from "react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { employmentTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";
import MasterEditButton from "../master-edit-button";
import type { MasterField } from "../master-form";
import ShiftEntryLinkButton from "./shift-entry-link-button";

export type EmployeeRow = {
  id: string;
  name: string;
  employmentType: string;
  affiliation: string | null;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultBreakMinutes: number;
  shiftEntryToken: string | null;
  shiftEntryEnabled: boolean;
  note: string | null;
};

export default function EmployeesMasterTable({
  rows,
  fields,
}: {
  rows: EmployeeRow[];
  fields: MasterField[];
}) {
  const [query, setQuery] = useState("");
  const [employmentType, setEmploymentType] = useState("");

  const employmentTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.employmentType))),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (employmentType === "" || r.employmentType === employmentType) &&
          matchesQuery(query, [r.name, r.affiliation, employmentTypeLabel(r.employmentType), r.note]),
      ),
    [rows, query, employmentType],
  );

  const hasActiveFilters = !!(query || employmentType);

  function resetFilters() {
    setQuery("");
    setEmploymentType("");
  }

  return (
    <>
      <CollapsiblePanel
        title="表内検索・絞り込み"
        summary={`${filtered.length} / ${rows.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="氏名・所属で検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="従業員を検索"
          />
          <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
            <option value="">雇用区分: すべて</option>
            {employmentTypes.map((value) => (
              <option key={value} value={value}>
                {employmentTypeLabel(value)}
              </option>
            ))}
          </select>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filtered.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>雇用区分</th>
              <th>所属</th>
              <th>基本勤務</th>
              <th>本人入力URL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{employmentTypeLabel(r.employmentType)}</td>
                <td>{r.affiliation ?? "—"}</td>
                <td>
                  {r.defaultStartTime}-{r.defaultEndTime} / 休憩 {r.defaultBreakMinutes}分
                </td>
                <td>
                  <ShiftEntryLinkButton
                    employeeId={r.id}
                    employeeName={r.name}
                    initialToken={r.shiftEntryToken}
                    enabled={r.shiftEntryEnabled}
                  />
                </td>
                <td>
                  <div className="table-actions">
                    <MasterEditButton
                      endpoint={kitagoyaApiPath(`/employees/${r.id}`)}
                      fields={fields}
                      initialValues={{
                        name: r.name,
                        employmentType: r.employmentType,
                        affiliation: r.affiliation,
                        defaultStartTime: r.defaultStartTime,
                        defaultEndTime: r.defaultEndTime,
                        defaultBreakMinutes: r.defaultBreakMinutes,
                        shiftEntryEnabled: r.shiftEntryEnabled,
                        note: r.note,
                      }}
                      label={`従業員「${r.name}」`}
                    />
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/employees/${r.id}`)}
                      label={`従業員「${r.name}」`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
