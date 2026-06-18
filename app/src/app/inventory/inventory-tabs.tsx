"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Archive, CalendarClock, Eye, PencilLine, RotateCcw, Table2 } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import type { MonthlyInventorySheet, MonthlyInventorySheetRow } from "@/lib/monthly-inventory-sheet";
import { formatCases } from "@/lib/units";
import { matchesQuery } from "@/lib/search";
import type { EditableGrid } from "@/lib/inventory-editable-grid";
import { InventoryEditableGrid, type EditableGridItemType } from "./inventory-editable-grid";

const rowLabels = ["使用量", "入荷", "残", "賞味期限", "出荷期限"] as const;
type InventoryRowLabel = (typeof rowLabels)[number];

export type InventoryTabKey = "product" | "raw" | "packaging";

type InventoryRowReview = {
  needsReview: boolean;
  hasMovement: boolean;
  negativeDays: number;
  missingDeadlineDays: number;
};

export type InventoryTabMeta = {
  key: InventoryTabKey;
  label: string;
  count: number;
  href: string;
};

export function InventoryTabs({
  active,
  tabs,
  title,
  sheet,
  itemType,
  caseByItemId,
  productScope,
  productScopeHref,
  adminMode,
  adminModeHref,
  editableGrid,
  secondaryHeader,
}: {
  active: InventoryTabKey;
  tabs: InventoryTabMeta[];
  title: string;
  sheet: MonthlyInventorySheet;
  itemType: EditableGridItemType;
  caseByItemId?: Record<string, number | null>;
  productScope: "kitagoya" | "all";
  productScopeHref: string;
  adminMode: boolean;
  adminModeHref: string;
  editableGrid: EditableGrid | null;
  secondaryHeader: string;
}) {
  // 仕入先を持つのは原料・資材のみ(商品は持たない)。
  const hasSupplier = secondaryHeader === "仕入先";

  // タブ切り替えはURL遷移で行うため、検索条件はタブごとに初期化される。
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showDeadlineRows, setShowDeadlineRows] = useState(true);
  // 商品タブは既定で北名古屋使用のみ表示(暫定スコープ)。
  const kitagoyaOnly = productScope !== "all";

  // 北名古屋フィルタは商品タブのみ対象。
  const hasKitagoyaFilter = active === "product";

  // 当該シートに存在する仕入先の一覧(重複排除・空除外)。
  const suppliers = useMemo(() => {
    if (!hasSupplier) return [] as string[];
    const set = new Set<string>();
    for (const row of sheet.rows) {
      if (row.supplierName) set.add(row.supplierName);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }, [hasSupplier, sheet.rows]);

  const rowReviews = useMemo(() => buildInventoryRowReviews(sheet.rows, itemType), [sheet.rows, itemType]);
  const reviewSummary = useMemo(() => {
    return [...rowReviews.values()].reduce(
      (summary, review) => ({
        needsReviewCount: summary.needsReviewCount + (review.needsReview ? 1 : 0),
        movementRowCount: summary.movementRowCount + (review.hasMovement ? 1 : 0),
        negativeItemCount: summary.negativeItemCount + (review.negativeDays > 0 ? 1 : 0),
        negativeDayCount: summary.negativeDayCount + review.negativeDays,
        missingDeadlineItemCount: summary.missingDeadlineItemCount + (review.missingDeadlineDays > 0 ? 1 : 0),
        missingDeadlineDayCount: summary.missingDeadlineDayCount + review.missingDeadlineDays,
      }),
      {
        needsReviewCount: 0,
        movementRowCount: 0,
        negativeItemCount: 0,
        negativeDayCount: 0,
        missingDeadlineItemCount: 0,
        missingDeadlineDayCount: 0,
      },
    );
  }, [rowReviews]);

  // 検索・仕入先・在庫トグルを AND で適用。
  const filteredRows = useMemo(() => {
    return sheet.rows.filter((row) => {
      if (!matchesQuery(query, [row.code, row.name, row.supplierName, row.unit])) return false;
      if (hasSupplier && supplier && row.supplierName !== supplier) return false;
      if (inStockOnly && row.monthEndQuantity === 0) return false;
      if (negativeOnly && !(row.monthEndQuantity < 0)) return false;
      if (attentionOnly && !rowReviews.get(row.itemId)?.needsReview) return false;
      return true;
    });
  }, [sheet.rows, query, hasSupplier, supplier, inStockOnly, negativeOnly, attentionOnly, rowReviews]);
  const activeTabLabel = tabs.find((tab) => tab.key === active)?.label ?? title.replace("在庫表", "");
  const totalInStockCount = sheet.rows.filter((row) => row.monthEndQuantity !== 0).length;
  const totalNegativeCount = sheet.rows.filter((row) => row.monthEndQuantity < 0).length;
  const visibleInStockCount = filteredRows.filter((row) => row.monthEndQuantity !== 0).length;
  const visibleNegativeCount = filteredRows.filter((row) => row.monthEndQuantity < 0).length;
  const scopeLabel = hasKitagoyaFilter ? (kitagoyaOnly ? "北名古屋のみ" : "全商品") : "全品目";
  const modeLabel = adminMode && editableGrid ? "手入力" : "閲覧";
  const canToggleDeadlineRows = itemType !== "product" && !adminMode;

  const hasActiveFilters = !!(
    query ||
    supplier ||
    inStockOnly ||
    negativeOnly ||
    attentionOnly
  );

  function resetFilters() {
    setQuery("");
    setSupplier("");
    setInStockOnly(false);
    setNegativeOnly(false);
    setAttentionOnly(false);
  }

  return (
    <section>
      <div className="section-tabs-header inventory-table-header">
        <h2>{title}</h2>
        <div className="inv-tabs" role="tablist" aria-label="在庫の種類">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={active === tab.key}
              className={`inv-tab${active === tab.key ? " is-active" : ""}`}
              href={tab.href}
            >
              {tab.label}
              <span className="inv-tab-count">{tab.count}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="inventory-review-command">
        <div className="inventory-review-command-title">
          <strong>在庫確認</strong>
          <span className={`badge ${reviewSummary.needsReviewCount > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsReviewCount > 0 ? `要確認 ${reviewSummary.needsReviewCount}品目` : "整備済み"}
          </span>
        </div>
        <div className="inventory-review-checks">
          <span className="badge info">
            表示 {filteredRows.length} / {sheet.rows.length} 件
          </span>
          <span className="badge muted">入出庫あり {reviewSummary.movementRowCount}品目</span>
          <span className={`badge ${reviewSummary.negativeItemCount > 0 ? "danger" : "success"}`}>
            マイナス {reviewSummary.negativeItemCount}品目 / {reviewSummary.negativeDayCount}日
          </span>
          {itemType !== "product" && (
            <span className={`badge ${reviewSummary.missingDeadlineItemCount > 0 ? "warn" : "success"}`}>
              期限未入力 {reviewSummary.missingDeadlineItemCount}品目 / {reviewSummary.missingDeadlineDayCount}日
            </span>
          )}
        </div>
      </div>
      <div className="inventory-control-panel">
        <div className="inventory-control-main">
          <span className="badge info">{sheet.monthLabel}</span>
          <strong>
            {activeTabLabel} / {scopeLabel}
          </strong>
          <span className={totalNegativeCount > 0 ? "badge danger" : "badge success"}>
            {totalNegativeCount > 0 ? (
              <>
                <AlertTriangle size={14} aria-hidden="true" />
                マイナス {totalNegativeCount} 件
              </>
            ) : (
              "マイナスなし"
            )}
          </span>
        </div>
        <div className="inventory-control-actions">
          {hasKitagoyaFilter && (
            <Link className="button-link secondary-link" href={productScopeHref}>
              <Archive size={16} aria-hidden="true" />
              {kitagoyaOnly ? "全商品" : "北名古屋のみ"}
            </Link>
          )}
          {canToggleDeadlineRows && (
            <button
              type="button"
              className="secondary"
              onClick={() => setShowDeadlineRows((current) => !current)}
            >
              <CalendarClock size={16} aria-hidden="true" />
              {showDeadlineRows ? "期限行を隠す" : "期限行を表示"}
            </button>
          )}
          <Link className={adminMode ? "button-link secondary-link" : "button-link"} href={adminModeHref}>
            {adminMode ? <Eye size={16} aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
            {adminMode ? "閲覧モード" : "手入力"}
          </Link>
        </div>
      </div>
      <div className="inventory-summary-grid">
        <div className="metric">
          <div className="metric-label">対象</div>
          <div className="metric-value">{activeTabLabel}</div>
        </div>
        <div className="metric">
          <div className="metric-label">表示品目</div>
          <div className="metric-value">
            {filteredRows.length} / {sheet.rows.length} 件
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">月末在庫あり</div>
          <div className="metric-value">
            {visibleInStockCount} / {totalInStockCount} 件
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">マイナス在庫</div>
          <div className={`metric-value${visibleNegativeCount > 0 ? " negative-stock" : ""}`}>
            {visibleNegativeCount} / {totalNegativeCount} 件
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">範囲 / モード</div>
          <div className="metric-value inventory-summary-mode">
            {scopeLabel} / {modeLabel}
          </div>
        </div>
      </div>
      <CollapsiblePanel
        title="表内検索・絞り込み"
        summary={`${filteredRows.length} / ${sheet.rows.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            type="search"
            className="filter-search"
            placeholder="コード・品名・仕入先で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="在庫を検索"
          />
          {hasSupplier && (
            <SearchableCombobox
              value={supplier}
              options={suppliers.map((name) => ({ value: name, label: name }))}
              emptyOptionLabel="すべての仕入先"
              placeholder="仕入先で絞り込み"
              ariaLabel="仕入先で絞り込み"
              onChange={setSupplier}
            />
          )}
          {hasKitagoyaFilter && (
            <span className="filter-status-chip">{scopeLabel}</span>
          )}
          <label className="filter-check">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            在庫がある品目のみ
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={negativeOnly} onChange={(e) => setNegativeOnly(e.target.checked)} />
            マイナス在庫のみ
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            要確認のみ
          </label>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            <RotateCcw size={15} aria-hidden="true" />
            条件クリア
          </button>
          <span className="filter-count">
            {filteredRows.length} / {sheet.rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      {adminMode && editableGrid ? (
        <InventoryEditableGrid
          key={itemType}
          itemType={itemType}
          month={editableGrid.month}
          monthLabel={editableGrid.monthLabel}
          dateFrom={editableGrid.dateFrom}
          dateTo={editableGrid.dateTo}
          days={editableGrid.days}
          rows={editableGrid.rows}
          visibleItemIds={filteredRows.map((r) => r.itemId)}
          secondaryHeader={secondaryHeader}
        />
      ) : (
        <InventoryExcelTable
          sheet={sheet}
          rows={filteredRows}
          secondaryHeader={secondaryHeader}
          caseByItemId={caseByItemId}
          showShelfLifeRows={itemType !== "product" && showDeadlineRows}
          rowReviews={rowReviews}
        />
      )}
    </section>
  );
}

function InventoryExcelTable({
  sheet,
  rows,
  secondaryHeader,
  caseByItemId,
  showShelfLifeRows,
  rowReviews,
}: {
  sheet: MonthlyInventorySheet;
  rows: MonthlyInventorySheetRow[];
  secondaryHeader: string;
  caseByItemId?: Record<string, number | null>;
  showShelfLifeRows: boolean;
  rowReviews: Map<string, InventoryRowReview>;
}) {
  const hasCaseRows =
    caseByItemId != null && rows.some((row) => (caseByItemId[row.itemId] ?? 0) > 0);
  const emptyMessage =
    sheet.rows.length === 0 ? "表示する在庫マスターがありません。" : "該当する在庫がありません。";
  const visibleRowLabels: InventoryRowLabel[] = showShelfLifeRows ? [...rowLabels] : ["使用量", "入荷", "残"];
  return (
    <section className="inventory-sheet-section">
      <div className="inventory-sheet-meta">
        <span className="badge muted">
          <Table2 size={14} aria-hidden="true" />
          {rows.length} 件
        </span>
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
                <InventoryItemRows
                  key={row.itemId}
                  row={row}
                  casePackQty={caseByItemId?.[row.itemId] ?? null}
                  rowLabels={visibleRowLabels}
                  review={rowReviews.get(row.itemId)}
                />
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
  rowLabels,
  review,
}: {
  row: MonthlyInventorySheetRow;
  casePackQty?: number | null;
  rowLabels: InventoryRowLabel[];
  review?: InventoryRowReview;
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
        <tr
          key={`${row.itemId}:${label}`}
          className={`excel-row-${labelClass(label)} ${review?.needsReview ? "inventory-review-row" : ""}`}
        >
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
                {review?.needsReview && (
                  <div className="inventory-row-badges">
                    {review.negativeDays > 0 && <span className="badge danger">マイナス {review.negativeDays}日</span>}
                    {review.missingDeadlineDays > 0 && (
                      <span className="badge warn">期限未入力 {review.missingDeadlineDays}日</span>
                    )}
                  </div>
                )}
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
  label: InventoryRowLabel,
  day: MonthlyInventorySheetRow["days"][number],
  fmt: (value: number, blankZero?: boolean) => string,
) {
  if (label === "使用量") return fmt(day.usageQuantity);
  if (label === "入荷") return fmt(day.inboundQuantity);
  if (label === "残") return fmt(day.balanceQuantity);
  if (label === "賞味期限") return day.expiryDate ?? "";
  return day.shippingDeadline ?? "";
}

function cellClass(label: InventoryRowLabel, value: number) {
  const classes = ["right"];
  if (label === "残" && value < 0) classes.push("negative-stock");
  return classes.join(" ");
}

function buildInventoryRowReviews(rows: MonthlyInventorySheetRow[], itemType: EditableGridItemType) {
  const map = new Map<string, InventoryRowReview>();
  for (const row of rows) {
    const negativeDays = row.days.filter((day) => day.balanceQuantity < 0).length;
    const missingDeadlineDays =
      itemType === "product"
        ? 0
        : row.days.filter((day) => day.inboundQuantity > 0 && (!day.expiryDate || !day.shippingDeadline)).length;
    const hasMovement = row.usageTotalQuantity !== 0 || row.inboundTotalQuantity !== 0;
    const needsReview = row.monthEndQuantity < 0 || negativeDays > 0 || missingDeadlineDays > 0;
    map.set(row.itemId, {
      needsReview,
      hasMovement,
      negativeDays,
      missingDeadlineDays,
    });
  }
  return map;
}

function labelClass(label: InventoryRowLabel) {
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
