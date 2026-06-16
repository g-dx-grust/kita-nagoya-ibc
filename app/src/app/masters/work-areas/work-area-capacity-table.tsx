"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { areaTypeLabel, autoScheduleRoleLabel, equipmentKindLabel } from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";
import MasterEditButton from "../master-edit-button";
import { workAreaFields } from "./work-area-fields";

type WorkAreaRow = {
  id: string;
  name: string;
  areaType: string;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  maxPeopleCount: number;
  externalFlag: boolean;
  displayOrder: number;
  equipmentKind: string;
  autoScheduleRole: string;
  concurrentOperationAllowed: boolean;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
};

export default function WorkAreaCapacityTable({ rows }: { rows: WorkAreaRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(rows.map((row) => [row.id, row.maxPeopleCount])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(query, [
          row.name,
          areaTypeLabel(row.areaType),
          equipmentKindLabel(row.equipmentKind),
          autoScheduleRoleLabel(row.autoScheduleRole),
          row.externalFlag ? "外注" : "自社",
          row.concurrentOperationAllowed ? "同時稼働可" : "同時稼働不可",
          row.note,
        ]),
      ),
    [rows, query],
  );

  function resetSearch() {
    setQuery("");
  }

  async function save(row: WorkAreaRow) {
    setSavingId(row.id);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/work-areas/${row.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxPeopleCount: values[row.id] }),
    });
    setSavingId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "保存失敗");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {error && <div className="alert danger">{error}</div>}
      <div className="filter-bar">
        <input
          className="filter-search"
          type="search"
          placeholder="場所名・種別・設備・メモで検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="作業場所を検索"
        />
        <button type="button" className="secondary" onClick={resetSearch} disabled={!query}>
          条件クリア
        </button>
        <span className="filter-count">
          {filteredRows.length} / {rows.length} 件
        </span>
      </div>
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>種別</th>
              <th>設備</th>
              <th>自動予定</th>
              <th>同時稼働</th>
              <th>標準開始</th>
              <th>標準終了</th>
              <th>最大配置人数</th>
              <th>外注</th>
              <th>表示順</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{areaTypeLabel(row.areaType)}</td>
                <td>{equipmentKindLabel(row.equipmentKind)}</td>
                <td>{autoScheduleRoleLabel(row.autoScheduleRole)}</td>
                <td>{row.concurrentOperationAllowed ? "可" : "不可"}</td>
                <td>{row.defaultStartTime ?? "-"}</td>
                <td>{row.defaultEndTime ?? "-"}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={values[row.id] ?? row.maxPeopleCount}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        [row.id]: Number(event.target.value),
                      })
                    }
                  />
                </td>
                <td>{row.externalFlag ? "○" : "-"}</td>
                <td className="right">{row.displayOrder}</td>
                <td>
                  {row.validFrom ?? "-"}
                  {" 〜 "}
                  {row.validTo ?? "-"}
                </td>
                <td>
                  <div className="table-actions">
                    <button type="button" onClick={() => save(row)} disabled={savingId === row.id}>
                      保存
                    </button>
                    <MasterEditButton
                      endpoint={kitagoyaApiPath(`/work-areas/${row.id}`)}
                      fields={workAreaFields}
                      initialValues={{
                        name: row.name,
                        areaType: row.areaType,
                        defaultStartTime: row.defaultStartTime,
                        defaultEndTime: row.defaultEndTime,
                        maxPeopleCount: row.maxPeopleCount,
                        displayOrder: row.displayOrder,
                        equipmentKind: row.equipmentKind,
                        autoScheduleRole: row.autoScheduleRole,
                        concurrentOperationAllowed: row.concurrentOperationAllowed,
                        externalFlag: row.externalFlag,
                        validFrom: row.validFrom,
                        validTo: row.validTo,
                        note: row.note,
                      }}
                      label={`作業場所「${row.name}」`}
                    />
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/work-areas/${row.id}`)}
                      label={`作業場所「${row.name}」`}
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
