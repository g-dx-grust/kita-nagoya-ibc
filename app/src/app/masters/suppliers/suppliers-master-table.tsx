"use client";

import { useMemo, useState } from "react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";
import MasterEditButton from "../master-edit-button";
import type { MasterField } from "../master-form";

export type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  orderingUnit: string | null;
  closingInfo: string | null;
  validFrom: string;
  validTo: string;
  materialCount: number;
  packagingCount: number;
};

export default function SuppliersMasterTable({
  rows,
  fields,
}: {
  rows: SupplierRow[];
  fields: MasterField[];
}) {
  const [query, setQuery] = useState("");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (needsReviewOnly && !needsReview(r)) return false;
        return matchesQuery(query, [r.name, r.contact, r.orderingUnit, r.closingInfo]);
      }),
    [rows, query, needsReviewOnly],
  );

  const reviewSummary = useMemo(() => {
    const unused = rows.filter((r) => linkedItemCount(r) === 0).length;
    const missingContact = rows.filter((r) => !hasText(r.contact)).length;
    const missingOrderingUnit = rows.filter((r) => !hasText(r.orderingUnit)).length;
    const missingClosingInfo = rows.filter((r) => !hasText(r.closingInfo)).length;
    const needsAction = rows.filter(needsReview).length;
    return { unused, missingContact, missingOrderingUnit, missingClosingInfo, needsAction };
  }, [rows]);

  const hasActiveFilters = !!(query || needsReviewOnly);

  function resetFilters() {
    setQuery("");
    setNeedsReviewOnly(false);
  }

  return (
    <>
      <div className="supplier-master-command">
        <div className="supplier-master-command-title">
          <span className={`badge ${reviewSummary.needsAction > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsAction > 0 ? "確認が必要" : "整備済み"}
          </span>
          <strong>仕入先整備</strong>
          <span className="subtext">{rows.length}件</span>
        </div>
        <div className="supplier-master-checks">
          <span className={`badge ${reviewSummary.unused > 0 ? "warn" : "success"}`}>
            未使用 {reviewSummary.unused}
          </span>
          <span className={`badge ${reviewSummary.missingContact > 0 ? "warn" : "success"}`}>
            連絡先なし {reviewSummary.missingContact}
          </span>
          <span className={`badge ${reviewSummary.missingOrderingUnit > 0 ? "warn" : "success"}`}>
            発注単位なし {reviewSummary.missingOrderingUnit}
          </span>
          <span className={`badge ${reviewSummary.missingClosingInfo > 0 ? "warn" : "success"}`}>
            締め情報なし {reviewSummary.missingClosingInfo}
          </span>
        </div>
      </div>
      <CollapsiblePanel
        title="表内検索・絞り込み"
        summary={`${filtered.length} / ${rows.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="名称・連絡先・発注単位・締め情報で検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="仕入先を検索"
          />
          <label className="filter-check">
            <input
              type="checkbox"
              checked={needsReviewOnly}
              onChange={(event) => setNeedsReviewOnly(event.target.checked)}
            />
            要確認のみ
          </label>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filtered.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      <div className="table-frame standard-list-frame suppliers-master-frame">
        <table className="standard-list-table suppliers-master-table">
          <colgroup>
            <col className="supplier-name-col" />
            <col className="supplier-linked-col" />
            <col className="supplier-contact-col" />
            <col className="supplier-ordering-col" />
            <col className="supplier-closing-col" />
            <col className="supplier-validity-col" />
            <col className="supplier-action-col" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>紐付け</th>
              <th>連絡先</th>
              <th>発注単位</th>
              <th>締め情報</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="supplier-empty-cell" colSpan={7}>
                  条件に一致する仕入先はありません。
                </td>
              </tr>
            ) : null}
            {filtered.map((r) => {
              const unused = linkedItemCount(r) === 0;
              const missingContact = !hasText(r.contact);
              const missingOrderingUnit = !hasText(r.orderingUnit);
              const missingClosingInfo = !hasText(r.closingInfo);
              const rowNeedsReview = needsReview(r);
              return (
              <tr key={r.id} className={`supplier-master-row${rowNeedsReview ? " row-needs-action" : ""}`}>
                <td className="wrap-cell supplier-name-cell" data-label="名称">
                  {r.name}
                  {rowNeedsReview && (
                    <div className="supplier-master-row-badges">
                      {unused && <span className="badge warn">未使用</span>}
                      {missingContact && <span className="badge warn">連絡先なし</span>}
                      {missingOrderingUnit && <span className="badge warn">発注単位なし</span>}
                      {missingClosingInfo && <span className="badge warn">締め情報なし</span>}
                    </div>
                  )}
                </td>
                <td data-label="紐付け">
                  <SupplierLinkBadges materialCount={r.materialCount} packagingCount={r.packagingCount} />
                </td>
                <td className="wrap-cell" data-label="連絡先">
                  {r.contact ?? "-"}
                </td>
                <td className="wrap-cell" data-label="発注単位">
                  {r.orderingUnit ?? "-"}
                </td>
                <td className="wrap-cell" data-label="締め情報">
                  {r.closingInfo ?? "-"}
                </td>
                <td data-label="有効期間">
                  {r.validFrom || "-"}
                  {" 〜 "}
                  {r.validTo || "-"}
                </td>
                <td className="action-cell" data-label="操作">
                  <div className="table-actions">
                    <MasterEditButton
                      endpoint={kitagoyaApiPath(`/suppliers/${r.id}`)}
                      fields={fields}
                      initialValues={{
                        name: r.name,
                        contact: r.contact,
                        orderingUnit: r.orderingUnit,
                        closingInfo: r.closingInfo,
                        validFrom: r.validFrom,
                        validTo: r.validTo,
                      }}
                      label={`仕入先「${r.name}」`}
                    />
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/suppliers/${r.id}`)}
                      label={`仕入先「${r.name}」`}
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

function needsReview(row: SupplierRow) {
  return (
    linkedItemCount(row) === 0 ||
    !hasText(row.contact) ||
    !hasText(row.orderingUnit) ||
    !hasText(row.closingInfo)
  );
}

function linkedItemCount(row: SupplierRow) {
  return row.materialCount + row.packagingCount;
}

function hasText(value: string | null) {
  return Boolean(value && value.trim());
}

function SupplierLinkBadges({
  materialCount,
  packagingCount,
}: {
  materialCount: number;
  packagingCount: number;
}) {
  if (materialCount === 0 && packagingCount === 0) {
    return <span className="badge muted">未使用</span>;
  }
  return (
    <span className="badge-list">
      {materialCount > 0 && <span className="badge info">原料 {materialCount}</span>}
      {packagingCount > 0 && <span className="badge success">資材 {packagingCount}</span>}
    </span>
  );
}
