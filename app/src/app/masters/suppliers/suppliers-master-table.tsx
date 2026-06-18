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

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        matchesQuery(query, [r.name, r.contact, r.orderingUnit, r.closingInfo]),
      ),
    [rows, query],
  );

  function resetFilters() {
    setQuery("");
  }

  return (
    <>
      <CollapsiblePanel
        title="表内検索"
        summary={`${filtered.length} / ${rows.length} 件${query ? ` / ${query}` : ""}`}
        open={!!query}
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
          <button type="button" className="secondary" onClick={resetFilters} disabled={!query}>
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
            {filtered.map((r) => (
              <tr key={r.id} className="supplier-master-row">
                <td className="wrap-cell supplier-name-cell" data-label="名称">
                  {r.name}
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
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
