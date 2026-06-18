"use client";

import { Fragment, useMemo, useState } from "react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { packagingKindLabel } from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery, normalizeForSearch } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";
import MasterEditButton from "../master-edit-button";
import { type MasterField } from "../master-form";

export type PackagingRow = {
  id: string;
  materialCode: string;
  name: string;
  kind: string | null;
  unit: string;
  casePackQty: number | null;
  standardUnitPrice: number;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  safetyStockQuantity: number;
  orderLotQty: number | null;
  minOrderQty: number | null;
  validFrom: string;
  validTo: string;
  note: string | null;
};

export default function PackagingMasterTable({
  rows,
  packagingFields,
}: {
  rows: PackagingRow[];
  packagingFields: MasterField[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [needsSetupOnly, setNeedsSetupOnly] = useState(false);

  const kinds = useMemo(
    () => distinct(rows.map((r) => r.kind ?? "")),
    [rows],
  );
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
        if (kind && (r.kind ?? "") !== kind) return false;
        if (supplierId && r.supplierId !== supplierId) return false;
        if (needsSetupOnly && !needsSetup(r)) return false;
        return matchesQuery(query, [r.materialCode, r.name, r.unit, r.supplierName, r.note]);
      }),
    [rows, query, kind, supplierId, needsSetupOnly],
  );

  const setupSummary = useMemo(() => {
    const missingKind = rows.filter((r) => !r.kind).length;
    const missingSupplier = rows.filter((r) => !r.supplierId).length;
    const missingPrice = rows.filter((r) => r.standardUnitPrice <= 0).length;
    const missingLeadTime = rows.filter((r) => r.leadTimeDays <= 0).length;
    const missingCasePack = rows.filter((r) => r.casePackQty == null || r.casePackQty <= 0).length;
    const missingOrderRule = rows.filter((r) => r.orderLotQty == null && r.minOrderQty == null).length;
    const needsAction = rows.filter(needsSetup).length;
    return { missingKind, missingSupplier, missingPrice, missingLeadTime, missingCasePack, missingOrderRule, needsAction };
  }, [rows]);

  const hasActiveFilters = !!(query || kind || supplierId || needsSetupOnly);

  function resetFilters() {
    setQuery("");
    setKind("");
    setSupplierId("");
    setNeedsSetupOnly(false);
  }

  return (
    <>
      <div className="packaging-master-command">
        <div className="packaging-master-command-title">
          <span className={`badge ${setupSummary.needsAction > 0 ? "warn" : "success"}`}>
            {setupSummary.needsAction > 0 ? "確認が必要" : "整備済み"}
          </span>
          <strong>資材整備</strong>
          <span className="subtext">{rows.length}件</span>
        </div>
        <div className="packaging-master-checks">
          <span className={`badge ${setupSummary.missingKind > 0 ? "warn" : "success"}`}>
            種類未設定 {setupSummary.missingKind}
          </span>
          <span className={`badge ${setupSummary.missingSupplier > 0 ? "warn" : "success"}`}>
            仕入先未設定 {setupSummary.missingSupplier}
          </span>
          <span className={`badge ${setupSummary.missingPrice > 0 ? "warn" : "success"}`}>
            単価未設定 {setupSummary.missingPrice}
          </span>
          <span className={`badge ${setupSummary.missingLeadTime > 0 ? "warn" : "success"}`}>
            LT未設定 {setupSummary.missingLeadTime}
          </span>
          <span className={`badge ${setupSummary.missingCasePack > 0 ? "warn" : "success"}`}>
            ケース入数なし {setupSummary.missingCasePack}
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
            placeholder="資材番号・名称・仕入先・メモで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="資材を検索"
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">種類(すべて)</option>
            {kinds.map((value) => (
              <option key={value} value={value}>
                {packagingKindLabel(value)}
              </option>
            ))}
          </select>
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
      <div className="table-frame standard-list-frame packaging-master-frame">
        <table className="standard-list-table packaging-master-table">
          <colgroup>
            <col className="packaging-code-col" />
            <col className="packaging-name-col" />
            <col className="packaging-kind-col" />
            <col className="packaging-unit-col" />
            <col className="packaging-case-col" />
            <col className="packaging-price-col" />
            <col className="packaging-supplier-col" />
            <col className="packaging-lead-time-col" />
            <col className="packaging-stock-col" />
            <col className="packaging-lot-col" />
            <col className="packaging-min-col" />
            <col className="packaging-validity-col" />
            <col className="packaging-action-col" />
          </colgroup>
          <thead>
            <tr>
              <th>番号</th>
              <th>名称</th>
              <th>種類</th>
              <th>単位</th>
              <th>ケース入数</th>
              <th>標準単価</th>
              <th>仕入先</th>
              <th>リードタイム</th>
              <th>安全在庫</th>
              <th>発注ロット</th>
              <th>最小発注</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="packaging-empty-cell" colSpan={13}>
                  条件に一致する資材はありません。
                </td>
              </tr>
            ) : null}
            {filtered.map((r) => {
              const missingKind = !r.kind;
              const missingSupplier = !r.supplierId;
              const missingPrice = r.standardUnitPrice <= 0;
              const missingLeadTime = r.leadTimeDays <= 0;
              const missingCasePack = r.casePackQty == null || r.casePackQty <= 0;
              const missingOrderRule = r.orderLotQty == null && r.minOrderQty == null;
              const rowNeedsSetup = needsSetup(r);
              return (
              <tr key={r.id} className={`packaging-master-row${rowNeedsSetup ? " row-needs-action" : ""}`}>
                <td data-label="番号">{highlight(r.materialCode, query)}</td>
                <td className="wrap-cell packaging-name-cell" data-label="名称">
                  {highlight(r.name, query)}
                  {rowNeedsSetup && (
                    <div className="packaging-master-row-badges">
                      {missingKind && <span className="badge warn">種類未設定</span>}
                      {missingSupplier && <span className="badge warn">仕入先未設定</span>}
                      {missingPrice && <span className="badge warn">単価未設定</span>}
                      {missingLeadTime && <span className="badge warn">LT未設定</span>}
                      {missingCasePack && <span className="badge warn">ケース入数なし</span>}
                      {missingOrderRule && <span className="badge warn">発注基準未設定</span>}
                    </div>
                  )}
                </td>
                <td data-label="種類">
                  <span className={`badge ${r.kind ? "info" : "muted"}`}>
                    {packagingKindLabel(r.kind)}
                  </span>
                </td>
                <td data-label="単位">{r.unit}</td>
                <td className="right" data-label="ケース入数">
                  {formatOptionalNumber(r.casePackQty)}
                </td>
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
                <td data-label="有効期間">
                  {r.validFrom || "-"}
                  {" 〜 "}
                  {r.validTo || "-"}
                </td>
                <td className="action-cell" data-label="操作">
                  <div className="table-actions">
                    <MasterEditButton
                      endpoint={kitagoyaApiPath(`/packaging-materials/${r.id}`)}
                      fields={packagingFields}
                      initialValues={{
                        materialCode: r.materialCode,
                        name: r.name,
                        kind: r.kind,
                        unit: r.unit,
                        casePackQty: r.casePackQty,
                        standardUnitPrice: r.standardUnitPrice,
                        supplierId: r.supplierId,
                        leadTimeDays: r.leadTimeDays,
                        safetyStockQuantity: r.safetyStockQuantity,
                        orderLotQty: r.orderLotQty,
                        minOrderQty: r.minOrderQty,
                        validFrom: r.validFrom,
                        validTo: r.validTo,
                        note: r.note,
                      }}
                      label={`資材「${r.name}」`}
                    />
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/packaging-materials/${r.id}`)}
                      label={`資材「${r.name}」`}
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

function needsSetup(row: PackagingRow) {
  return (
    !row.kind ||
    !row.supplierId ||
    row.standardUnitPrice <= 0 ||
    row.leadTimeDays <= 0 ||
    row.casePackQty == null ||
    row.casePackQty <= 0 ||
    (row.orderLotQty == null && row.minOrderQty == null)
  );
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

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v !== ""))).sort();
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
