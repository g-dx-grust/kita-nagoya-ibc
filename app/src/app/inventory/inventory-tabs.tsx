"use client";

import { useEffect, useMemo, useState } from "react";
import type { MonthlyInventorySheet, MonthlyInventorySheetRow } from "@/lib/monthly-inventory-sheet";
import { formatCases } from "@/lib/units";
import { matchesQuery } from "@/lib/search";
import type { EditableGrid } from "@/lib/inventory-editable-grid";
import { InventoryEditableGrid, type EditableGridItemType } from "./inventory-editable-grid";

const rowLabels = ["使用量", "入荷", "残", "賞味期限", "出荷期限"] as const;

const ADMIN_MODE_KEY = "kitagoya:inventory:adminMode";

type TabKey = "product" | "raw" | "packaging";

type SheetTab = {
  key: TabKey;
  label: string;
  title: string;
  sheet: MonthlyInventorySheet;
  // 台帳の itemType。セル編集の登録先を決める。
  itemType: EditableGridItemType;
  // ケース入数 (itemId -> 1ケースの基本単位数)。商品・資材で併記する。
  caseByItemId?: Record<string, number | null>;
  // 区分(3列目)の見出し。商品は仕入先を持たないので切り替える。
  secondaryHeader: string;
};

export type EditableGridsByType = Record<EditableGridItemType, EditableGrid>;

export function InventoryTabs({
  product,
  raw,
  packaging,
  productCases,
  packagingCases,
  productKitagoya,
  editableGrids,
}: {
  product: MonthlyInventorySheet;
  raw: MonthlyInventorySheet;
  packaging: MonthlyInventorySheet;
  productCases: Record<string, number | null>;
  packagingCases: Record<string, number | null>;
  productKitagoya: Record<string, boolean>;
  editableGrids: EditableGridsByType;
}) {
  const tabs: SheetTab[] = [
    { key: "product", label: "商品", title: "商品在庫表", sheet: product, itemType: "product", caseByItemId: productCases, secondaryHeader: "区分" },
    { key: "raw", label: "原料", title: "原料在庫表", sheet: raw, itemType: "raw_material", secondaryHeader: "仕入先" },
    { key: "packaging", label: "資材", title: "資材在庫表", sheet: packaging, itemType: "packaging", caseByItemId: packagingCases, secondaryHeader: "仕入先" },
  ];
  const [active, setActive] = useState<TabKey>("product");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  // 管理者モード(手入力UIの表示切替)。ローカルに保持し、再訪問時も維持する。
  // 「画面トグルのみ」方式: サーバ検証はなく、社内利用前提で手入力UIの出し分けに使う。
  const [adminMode, setAdminMode] = useState(false);
  useEffect(() => {
    setAdminMode(window.localStorage.getItem(ADMIN_MODE_KEY) === "1");
  }, []);
  function toggleAdminMode(next: boolean) {
    setAdminMode(next);
    window.localStorage.setItem(ADMIN_MODE_KEY, next ? "1" : "0");
  }

  const currentGrid = editableGrids[current.itemType];

  // 仕入先を持つのは原料・資材のみ(商品は持たない)。
  const hasSupplier = current.secondaryHeader === "仕入先";

  // フィルタ状態はタブ間で共有しつつ、タブ切り替え時にリセットする(下の useEffect)。
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [negativeOnly, setNegativeOnly] = useState(false);
  // 商品タブは既定で北名古屋使用のみ表示(暫定スコープ)。
  const [kitagoyaOnly, setKitagoyaOnly] = useState(true);

  // 北名古屋フィルタは商品タブのみ対象。
  const hasKitagoyaFilter = active === "product";

  useEffect(() => {
    setQuery("");
    setSupplier("");
    setInStockOnly(false);
    setNegativeOnly(false);
    setKitagoyaOnly(true);
  }, [active]);

  // 当該シートに存在する仕入先の一覧(重複排除・空除外)。
  const suppliers = useMemo(() => {
    if (!hasSupplier) return [] as string[];
    const set = new Set<string>();
    for (const row of current.sheet.rows) {
      if (row.supplierName) set.add(row.supplierName);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }, [hasSupplier, current.sheet.rows]);

  // 検索・仕入先・在庫トグルを AND で適用。
  const filteredRows = useMemo(() => {
    return current.sheet.rows.filter((row) => {
      if (hasKitagoyaFilter && kitagoyaOnly && !productKitagoya[row.itemId]) return false;
      if (!matchesQuery(query, [row.code, row.name, row.supplierName, row.unit])) return false;
      if (hasSupplier && supplier && row.supplierName !== supplier) return false;
      if (inStockOnly && row.monthEndQuantity === 0) return false;
      if (negativeOnly && !(row.monthEndQuantity < 0)) return false;
      return true;
    });
  }, [current.sheet.rows, query, hasSupplier, supplier, inStockOnly, negativeOnly, hasKitagoyaFilter, kitagoyaOnly, productKitagoya]);

  const hasActiveFilters = !!(
    query ||
    supplier ||
    inStockOnly ||
    negativeOnly ||
    (hasKitagoyaFilter && !kitagoyaOnly)
  );

  function resetFilters() {
    setQuery("");
    setSupplier("");
    setInStockOnly(false);
    setNegativeOnly(false);
    setKitagoyaOnly(true);
  }

  return (
    <section>
      <div className="inv-tabs" role="tablist" aria-label="在庫の種類">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`inv-tab${active === tab.key ? " is-active" : ""}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
            <span className="inv-tab-count">{tab.sheet.rows.length}</span>
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <input
          type="search"
          className="filter-search"
          placeholder="コード・品名・仕入先で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="在庫を検索"
        />
        {hasSupplier && (
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="仕入先で絞り込み">
            <option value="">すべての仕入先</option>
            {suppliers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        {hasKitagoyaFilter && (
          <label className="filter-check">
            <input type="checkbox" checked={kitagoyaOnly} onChange={(e) => setKitagoyaOnly(e.target.checked)} />
            北名古屋のみ
          </label>
        )}
        <label className="filter-check">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          在庫がある品目のみ
        </label>
        <label className="filter-check">
          <input type="checkbox" checked={negativeOnly} onChange={(e) => setNegativeOnly(e.target.checked)} />
          マイナス在庫のみ
        </label>
        <label className="filter-check filter-admin">
          <input type="checkbox" checked={adminMode} onChange={(e) => toggleAdminMode(e.target.checked)} />
          管理者モード（手入力）
        </label>
        <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
          条件クリア
        </button>
        <span className="filter-count">
          {filteredRows.length} / {current.sheet.rows.length} 件
        </span>
      </div>
      {adminMode ? (
        <InventoryEditableGrid
          key={current.itemType}
          itemType={current.itemType}
          month={currentGrid.month}
          monthLabel={currentGrid.monthLabel}
          dateFrom={currentGrid.dateFrom}
          dateTo={currentGrid.dateTo}
          days={currentGrid.days}
          rows={currentGrid.rows}
          visibleItemIds={filteredRows.map((r) => r.itemId)}
          secondaryHeader={current.secondaryHeader}
        />
      ) : (
        <InventoryExcelTable
          title={current.title}
          sheet={current.sheet}
          rows={filteredRows}
          secondaryHeader={current.secondaryHeader}
          caseByItemId={current.caseByItemId}
        />
      )}
    </section>
  );
}

function InventoryExcelTable({
  title,
  sheet,
  rows,
  secondaryHeader,
  caseByItemId,
}: {
  title: string;
  sheet: MonthlyInventorySheet;
  rows: MonthlyInventorySheetRow[];
  secondaryHeader: string;
  caseByItemId?: Record<string, number | null>;
}) {
  const hasCaseRows =
    caseByItemId != null && rows.some((row) => (caseByItemId[row.itemId] ?? 0) > 0);
  const emptyMessage =
    sheet.rows.length === 0 ? "表示する在庫マスターがありません。" : "該当する在庫がありません。";
  return (
    <section className="inventory-sheet-section">
      <h2>{title}</h2>
      <div className="inventory-sheet-meta">
        <span className="badge info">{sheet.monthLabel}</span>
        <span className="muted">
          {sheet.dateFrom} 〜 {sheet.dateTo}
        </span>
        {hasCaseRows && <span className="badge muted">ケース入数のある品目は基本単位とケース数を併記</span>}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">{emptyMessage}</div>
      ) : (
        <div className="excel-inventory-scroll">
          <table className="excel-inventory-table">
            <colgroup>
              <col className="excel-col-no" />
              <col className="excel-col-name" />
              <col className="excel-col-supplier" />
              <col className="excel-col-label" />
              <col className="excel-col-carry" />
              {sheet.days.map((date) => (
                <col key={date} className="excel-col-day" />
              ))}
              <col className="excel-col-summary" />
              <col className="excel-col-summary" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky-x sticky-no">No.</th>
                <th className="sticky-x sticky-name">{sheet.monthLabel}</th>
                <th className="sticky-x sticky-supplier">{secondaryHeader}</th>
                <th className="sticky-x sticky-label">区分</th>
                <th>前月繰越</th>
                {sheet.days.map((date) => (
                  <th key={date}>{formatDateHeader(date)}</th>
                ))}
                <th>月末残</th>
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <InventoryItemRows key={row.itemId} row={row} casePackQty={caseByItemId?.[row.itemId] ?? null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InventoryItemRows({
  row,
  casePackQty,
}: {
  row: MonthlyInventorySheetRow;
  casePackQty?: number | null;
}) {
  const inCases = casePackQty != null && casePackQty > 0;
  // ケース入数があれば基本単位とケース数を併記。小数の数量は表示時に切り上げる。
  const fmt = (value: number, blankZero = true) => {
    if (blankZero && value === 0) return "";
    return formatCases(value, { casePackQty, baseUnit: row.unit });
  };
  return (
    <>
      {rowLabels.map((label, index) => (
        <tr key={`${row.itemId}:${label}`} className={`excel-row-${labelClass(label)}`}>
          {index === 0 && (
            <>
              <td className="sticky-x sticky-no excel-rowspan-cell right" rowSpan={rowLabels.length}>
                {row.rowNo}
              </td>
              <td className="sticky-x sticky-name excel-rowspan-cell" rowSpan={rowLabels.length}>
                <div className="excel-item-name">{row.name}</div>
                <div className="subtext">
                  {row.code}
                  {inCases && " ・ケース"}
                </div>
              </td>
              <td className="sticky-x sticky-supplier excel-rowspan-cell" rowSpan={rowLabels.length}>
                {row.supplierName || "—"}
              </td>
            </>
          )}
          <th className="sticky-x sticky-label excel-line-label" scope="row">
            {label}
          </th>
          <td className="right">{index === 0 ? fmt(row.openingQuantity) : ""}</td>
          {row.days.map((day) => (
            <td key={`${row.itemId}:${label}:${day.date}`} className={cellClass(label, day.balanceQuantity)}>
              {valueForLabel(label, day, fmt)}
            </td>
          ))}
          <td className={cellClass(label, row.monthEndQuantity)}>
            {label === "残" ? fmt(row.monthEndQuantity, false) : ""}
          </td>
          <td className="right">
            {label === "使用量" ? fmt(row.usageTotalQuantity) : label === "入荷" ? fmt(row.inboundTotalQuantity) : ""}
          </td>
        </tr>
      ))}
    </>
  );
}

function valueForLabel(
  label: (typeof rowLabels)[number],
  day: MonthlyInventorySheetRow["days"][number],
  fmt: (value: number, blankZero?: boolean) => string,
) {
  if (label === "使用量") return fmt(day.usageQuantity);
  if (label === "入荷") return fmt(day.inboundQuantity);
  if (label === "残") return fmt(day.balanceQuantity);
  if (label === "賞味期限") return day.expiryDate ?? "";
  return day.shippingDeadline ?? "";
}

function cellClass(label: (typeof rowLabels)[number], value: number) {
  const classes = ["right"];
  if (label === "残" && value < 0) classes.push("negative-stock");
  return classes.join(" ");
}

function labelClass(label: (typeof rowLabels)[number]) {
  switch (label) {
    case "使用量":
      return "usage";
    case "入荷":
      return "inbound";
    case "残":
      return "balance";
    case "賞味期限":
      return "expiry";
    case "出荷期限":
      return "deadline";
  }
}

function formatDateHeader(date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}/${day}`;
}
