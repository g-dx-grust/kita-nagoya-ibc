"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
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
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (needsReviewOnly && !needsReview(row)) return false;
        return matchesQuery(query, [
          row.name,
          areaTypeLabel(row.areaType),
          equipmentKindLabel(row.equipmentKind),
          autoScheduleRoleLabel(row.autoScheduleRole),
          row.externalFlag ? "外注" : "自社",
          row.concurrentOperationAllowed ? "同時稼働可" : "同時稼働不可",
          row.note,
        ]);
      }),
    [rows, query, needsReviewOnly],
  );

  const reviewSummary = useMemo(() => {
    const missingStandardTime = rows.filter((row) => !hasStandardTime(row)).length;
    const invalidPeople = rows.filter((row) => row.maxPeopleCount < 1).length;
    const excluded = rows.filter((row) => row.autoScheduleRole === "EXCLUDED").length;
    const concurrentBlocked = rows.filter((row) => !row.concurrentOperationAllowed).length;
    const externalMismatch = rows.filter(hasExternalMismatch).length;
    const needsAction = rows.filter(needsReview).length;
    return {
      missingStandardTime,
      invalidPeople,
      excluded,
      concurrentBlocked,
      externalMismatch,
      needsAction,
    };
  }, [rows]);

  const hasActiveFilters = !!(query || needsReviewOnly);

  function resetSearch() {
    setQuery("");
    setNeedsReviewOnly(false);
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
      <div className="work-area-master-command">
        <div className="work-area-master-command-title">
          <span className={`badge ${reviewSummary.needsAction > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsAction > 0 ? "確認が必要" : "整備済み"}
          </span>
          <strong>作業場所整備</strong>
          <span className="subtext">{rows.length}件</span>
        </div>
        <div className="work-area-master-checks">
          <span className={`badge ${reviewSummary.missingStandardTime > 0 ? "warn" : "success"}`}>
            標準時間なし {reviewSummary.missingStandardTime}
          </span>
          <span className={`badge ${reviewSummary.invalidPeople > 0 ? "warn" : "success"}`}>
            人数要確認 {reviewSummary.invalidPeople}
          </span>
          <span className={`badge ${reviewSummary.excluded > 0 ? "warn" : "success"}`}>
            自動予定除外 {reviewSummary.excluded}
          </span>
          <span className={`badge ${reviewSummary.concurrentBlocked > 0 ? "warn" : "success"}`}>
            同時稼働不可 {reviewSummary.concurrentBlocked}
          </span>
          <span className={`badge ${reviewSummary.externalMismatch > 0 ? "warn" : "success"}`}>
            外注設定差異 {reviewSummary.externalMismatch}
          </span>
        </div>
      </div>
      <CollapsiblePanel
        title="表内検索・絞り込み"
        summary={`${filteredRows.length} / ${rows.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="場所名・種別・設備・メモで検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="作業場所を検索"
          />
          <label className="filter-check">
            <input
              type="checkbox"
              checked={needsReviewOnly}
              onChange={(event) => setNeedsReviewOnly(event.target.checked)}
            />
            要確認のみ
          </label>
          <button type="button" className="secondary" onClick={resetSearch} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filteredRows.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      <div className="table-frame standard-list-frame work-area-master-frame">
        <table className="standard-list-table work-area-master-table">
          <colgroup>
            <col className="work-area-name-col" />
            <col className="work-area-type-col" />
            <col className="work-area-equipment-col" />
            <col className="work-area-role-col" />
            <col className="work-area-concurrent-col" />
            <col className="work-area-time-col" />
            <col className="work-area-time-col" />
            <col className="work-area-people-col" />
            <col className="work-area-external-col" />
            <col className="work-area-order-col" />
            <col className="work-area-validity-col" />
            <col className="work-area-action-col" />
          </colgroup>
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
            {filteredRows.length === 0 ? (
              <tr>
                <td className="work-area-empty-cell" colSpan={12}>
                  条件に一致する作業場所はありません。
                </td>
              </tr>
            ) : null}
            {filteredRows.map((row) => {
              const missingStandardTime = !hasStandardTime(row);
              const invalidPeople = row.maxPeopleCount < 1;
              const excluded = row.autoScheduleRole === "EXCLUDED";
              const concurrentBlocked = !row.concurrentOperationAllowed;
              const externalMismatch = hasExternalMismatch(row);
              const rowNeedsReview = needsReview(row);
              return (
                <tr key={row.id} className={`work-area-master-row${rowNeedsReview ? " row-needs-action" : ""}`}>
                  <td className="wrap-cell work-area-name-cell" data-label="名称">
                    {row.name}
                    {rowNeedsReview && (
                      <div className="work-area-master-row-badges">
                        {missingStandardTime && <span className="badge warn">標準時間なし</span>}
                        {invalidPeople && <span className="badge warn">人数要確認</span>}
                        {excluded && <span className="badge warn">自動予定除外</span>}
                        {concurrentBlocked && <span className="badge warn">同時稼働不可</span>}
                        {externalMismatch && <span className="badge warn">外注設定差異</span>}
                      </div>
                    )}
                  </td>
                  <td data-label="種別">
                    <span className={`badge ${areaTypeBadgeClass(row.areaType)}`}>
                      {areaTypeLabel(row.areaType)}
                    </span>
                  </td>
                  <td data-label="設備">{equipmentKindLabel(row.equipmentKind)}</td>
                  <td className="wrap-cell" data-label="自動予定">
                    <span className={`badge ${autoScheduleRoleBadgeClass(row.autoScheduleRole)}`}>
                      {autoScheduleRoleLabel(row.autoScheduleRole)}
                    </span>
                  </td>
                  <td data-label="同時稼働">
                    <span className={`badge ${row.concurrentOperationAllowed ? "success" : "muted"}`}>
                      {row.concurrentOperationAllowed ? "可" : "不可"}
                    </span>
                  </td>
                  <td data-label="標準開始">{row.defaultStartTime ?? "-"}</td>
                  <td data-label="標準終了">{row.defaultEndTime ?? "-"}</td>
                  <td data-label="最大配置人数">
                    <input
                      className="work-area-people-input"
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
                  <td data-label="外注">{row.externalFlag ? "○" : "-"}</td>
                  <td className="right" data-label="表示順">
                    {row.displayOrder}
                  </td>
                  <td data-label="有効期間">
                    {row.validFrom ?? "-"}
                    {" 〜 "}
                    {row.validTo ?? "-"}
                  </td>
                  <td className="action-cell" data-label="操作">
                    <div className="table-actions">
                      <button
                        type="button"
                        onClick={() => save(row)}
                        disabled={savingId === row.id}
                      >
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
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function needsReview(row: WorkAreaRow) {
  return (
    !hasStandardTime(row) ||
    row.maxPeopleCount < 1 ||
    row.autoScheduleRole === "EXCLUDED" ||
    !row.concurrentOperationAllowed ||
    hasExternalMismatch(row)
  );
}

function hasStandardTime(row: WorkAreaRow) {
  return Boolean(row.defaultStartTime && row.defaultEndTime);
}

function hasExternalMismatch(row: WorkAreaRow) {
  return (
    (row.areaType === "external" && !row.externalFlag) ||
    (row.areaType !== "external" && row.externalFlag)
  );
}

function areaTypeBadgeClass(value: string) {
  switch (value) {
    case "internal":
      return "info";
    case "external":
      return "warn";
    case "warehouse":
      return "muted";
    default:
      return "muted";
  }
}

function autoScheduleRoleBadgeClass(value: string) {
  switch (value) {
    case "ORDER_PRIMARY":
      return "success";
    case "STOCK_PRIMARY":
      return "info";
    case "EXCLUDED":
      return "muted";
    default:
      return "info";
  }
}
