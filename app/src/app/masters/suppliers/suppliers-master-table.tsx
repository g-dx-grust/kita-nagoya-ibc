"use client";

import { useMemo, useState } from "react";
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
      <div className="filter-bar">
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
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>連絡先</th>
              <th>発注単位</th>
              <th>締め情報</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.contact ?? "-"}</td>
                <td>{r.orderingUnit ?? "-"}</td>
                <td>{r.closingInfo ?? "-"}</td>
                <td>
                  {r.validFrom || "-"}
                  {" 〜 "}
                  {r.validTo || "-"}
                </td>
                <td>
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
