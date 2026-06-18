"use client";

import { Fragment, useMemo, useState } from "react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import SearchableCombobox from "@/components/ui/searchable-combobox";
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
  const [needsSetupOnly, setNeedsSetupOnly] = useState(false);

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
        if (needsSetupOnly && !needsSetup(r)) return false;
        return matchesQuery(query, [r.materialCode, r.name, r.unit, r.supplierName, r.note]);
      }),
    [rows, query, supplierId, needsSetupOnly],
  );

  const setupSummary = useMemo(() => {
    const missingSupplier = rows.filter((r) => !r.supplierId).length;
    const missingPrice = rows.filter((r) => r.standardUnitPrice <= 0).length;
    const missingLeadTime = rows.filter((r) => r.leadTimeDays <= 0).length;
    const missingOrderRule = rows.filter((r) => r.orderLotQty == null && r.minOrderQty == null).length;
    const needsAction = rows.filter(needsSetup).length;
    return { missingSupplier, missingPrice, missingLeadTime, missingOrderRule, needsAction };
  }, [rows]);

  const hasActiveFilters = !!(query || supplierId || needsSetupOnly);

  function resetFilters() {
    setQuery("");
    setSupplierId("");
    setNeedsSetupOnly(false);
  }

  return (
    <>
      <div className="material-master-command">
        <div className="material-master-command-title">
          <span className={`badge ${setupSummary.needsAction > 0 ? "warn" : "success"}`}>
            {setupSummary.needsAction > 0 ? "確認が必要" : "整備済み"}
          </span>
          <strong>原料整備</strong>
          <span className="subtext">{rows.length}件</span>
        </div>
        <div className="material-master-checks">
          <span className={`badge ${setupSummary.missingSupplier > 0 ? "warn" : "success"}`}>
            仕入先未設定 {setupSummary.missingSupplier}
          </span>
          <span className={`badge ${setupSummary.missingPrice > 0 ? "warn" : "success"}`}>
            単価未設定 {setupSummary.missingPrice}
          </span>
          <span className={`badge ${setupSummary.missingLeadTime > 0 ? "warn" : "success"}`}>
            LT未設定 {setupSummary.missingLeadTime}
          </span>
          <span className={`badge ${setupSummary.missingOrderRule > 0 ? "warn" : "success"}`}>
            発注基準未設定 {setupSummary.missingOrderRule}
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
            type="search"
            className="filter-search"
            placeholder="原料番号・名称・仕入先・メモで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="原料を検索"
          />
          <SearchableCombobox
            value={supplierId}
            options={supplierOptions}
            emptyOptionLabel="仕入先(すべて)"
            placeholder="仕入先で絞り込み"
            onChange={setSupplierId}
          />
          <label className="filter-check">
            <input
              type="checkbox"
              checked={needsSetupOnly}
              onChange={(e) => setNeedsSetupOnly(e.target.checked)}
            />
            要整備のみ
          </label>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filtered.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      <div className="table-frame standard-list-frame materials-master-frame">
        <table className="standard-list-table materials-master-table">
          <colgroup>
            <col className="material-code-col" />
            <col className="material-name-col" />
            <col className="material-unit-col" />
            <col className="material-price-col" />
            <col className="material-supplier-col" />
            <col className="material-lead-time-col" />
            <col className="material-stock-col" />
            <col className="material-lot-col" />
            <col className="material-min-col" />
            <col className="material-shelf-life-col" />
            <col className="material-validity-col" />
            <col className="material-action-col" />
          </colgroup>
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
            {filtered.length === 0 ? (
              <tr>
                <td className="material-empty-cell" colSpan={12}>
                  条件に一致する原料はありません。
                </td>
              </tr>
            ) : null}
            {filtered.map((r) => {
              const missingSupplier = !r.supplierId;
              const missingPrice = r.standardUnitPrice <= 0;
              const missingLeadTime = r.leadTimeDays <= 0;
              const missingOrderRule = r.orderLotQty == null && r.minOrderQty == null;
              const rowNeedsSetup = needsSetup(r);
              return (
              <tr key={r.id} className={`material-master-row${rowNeedsSetup ? " row-needs-action" : ""}`}>
                <td data-label="番号">{highlight(r.materialCode, query)}</td>
                <td className="wrap-cell material-name-cell" data-label="名称">
                  {highlight(r.name, query)}
                  {rowNeedsSetup && (
                    <div className="material-master-row-badges">
                      {missingSupplier && <span className="badge warn">仕入先未設定</span>}
                      {missingPrice && <span className="badge warn">単価未設定</span>}
                      {missingLeadTime && <span className="badge warn">LT未設定</span>}
                      {missingOrderRule && <span className="badge warn">発注基準未設定</span>}
                    </div>
                  )}
                </td>
                <td data-label="単位">{r.unit}</td>
                <td className={`right ${r.standardUnitPrice <= 0 ? "warn-value" : ""}`} data-label="標準単価">
                  {formatCurrency(r.standardUnitPrice)}
                </td>
                <td className="wrap-cell" data-label="仕入先">
                  {r.supplierName || "-"}
                </td>
                <td className="right" data-label="リードタイム">
                  {r.leadTimeDays}日
                </td>
                <td className="right" data-label="安全在庫">
                  {formatNumber(r.safetyStockQuantity)}
                </td>
                <td className="right" data-label="発注ロット">
                  {formatOptionalNumber(r.orderLotQty)}
                </td>
                <td className="right" data-label="最小発注">
                  {formatOptionalNumber(r.minOrderQty)}
                </td>
                <td data-label="賞味期限管理">
                  <span className={`badge ${r.shelfLifeManaged ? "success" : "muted"}`}>
                    {r.shelfLifeManaged ? "有" : "無"}
                  </span>
                </td>
                <td data-label="有効期間">
                  {r.validFrom || "-"}
                  {" 〜 "}
                  {r.validTo || "-"}
                </td>
                <td className="action-cell" data-label="操作">
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
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function needsSetup(row: MaterialRow) {
  return !row.supplierId || row.standardUnitPrice <= 0 || row.leadTimeDays <= 0 || (row.orderLotQty == null && row.minOrderQty == null);
}

function formatCurrency(value: number): string {
  return `¥${formatNumber(value)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(value);
}

function formatOptionalNumber(value: number | null): string {
  return value == null ? "-" : formatNumber(value);
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
