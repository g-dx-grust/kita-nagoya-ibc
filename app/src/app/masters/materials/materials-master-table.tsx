"use client";

import { Fragment, useMemo, useState } from "react";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery, normalizeForSearch } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";
import MasterEditButton from "../master-edit-button";
import { type MasterField } from "../master-form";

export type MaterialRow = {
  id: string;
  materialCode: string;
  name: string;
  unit: string;
  standardUnitPrice: number;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  safetyStockQuantity: number;
  orderLotQty: number | null;
  minOrderQty: number | null;
  shelfLifeManaged: boolean;
  validFrom: string;
  validTo: string;
  note: string | null;
};

export default function MaterialsMasterTable({
  rows,
  materialFields,
}: {
  rows: MaterialRow[];
  materialFields: MasterField[];
}) {
  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.supplierId && r.supplierName) map.set(r.supplierId, r.supplierName);
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "ja"),
    );
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (supplierId && r.supplierId !== supplierId) return false;
        return matchesQuery(query, [r.materialCode, r.name, r.unit, r.supplierName, r.note]);
      }),
    [rows, query, supplierId],
  );

  const hasActiveFilters = !!(query || supplierId);

  function resetFilters() {
    setQuery("");
    setSupplierId("");
  }

  return (
    <>
      <div className="filter-bar">
        <input
          type="search"
          className="filter-search"
          placeholder="原料番号・名称・仕入先・メモで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="原料を検索"
        />
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">仕入先(すべて)</option>
          {supplierOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>番号</th>
              <th>名称</th>
              <th>単位</th>
              <th>標準単価</th>
              <th>仕入先</th>
              <th>リードタイム</th>
              <th>安全在庫</th>
              <th>発注ロット</th>
              <th>最小発注</th>
              <th>賞味期限管理</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{highlight(r.materialCode, query)}</td>
                <td>{highlight(r.name, query)}</td>
                <td>{r.unit}</td>
                <td className="right">¥{r.standardUnitPrice}</td>
                <td>{r.supplierName || "-"}</td>
                <td className="right">{r.leadTimeDays}日</td>
                <td className="right">{r.safetyStockQuantity}</td>
                <td className="right">{r.orderLotQty ?? "-"}</td>
                <td className="right">{r.minOrderQty ?? "-"}</td>
                <td>{r.shelfLifeManaged ? "有" : "無"}</td>
                <td>
                  {r.validFrom || "-"}
                  {" 〜 "}
                  {r.validTo || "-"}
                </td>
                <td>
                  <div className="table-actions">
                    <MasterEditButton
                      endpoint={kitagoyaApiPath(`/materials/${r.id}`)}
                      fields={materialFields}
                      initialValues={{
                        materialCode: r.materialCode,
                        name: r.name,
                        unit: r.unit,
                        standardUnitPrice: r.standardUnitPrice,
                        supplierId: r.supplierId,
                        leadTimeDays: r.leadTimeDays,
                        safetyStockQuantity: r.safetyStockQuantity,
                        orderLotQty: r.orderLotQty,
                        minOrderQty: r.minOrderQty,
                        shelfLifeManaged: r.shelfLifeManaged,
                        validFrom: r.validFrom,
                        validTo: r.validTo,
                        note: r.note,
                      }}
                      label={`原料「${r.name}」`}
                    />
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/materials/${r.id}`)}
                      label={`原料「${r.name}」`}
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

// 生の文字列に対してベストエフォートでマッチ箇所を <mark> 表示する。
function highlight(text: string, query: string): React.ReactNode {
  const term = normalizeForSearch(query).split(" ")[0];
  if (!term) return text;
  const normalized = normalizeForSearch(text);
  const start = normalized.indexOf(term);
  // 正規化で文字数が変わると元文字列のオフセットがずれるため、長さが一致するときのみ装飾する。
  if (start < 0 || normalized.length !== text.length) return text;
  return (
    <Fragment>
      {text.slice(0, start)}
      <mark className="search-hit">{text.slice(start, start + term.length)}</mark>
      {text.slice(start + term.length)}
    </Fragment>
  );
}
