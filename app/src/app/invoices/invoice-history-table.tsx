"use client";

import { useMemo, useState } from "react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { matchesQuery } from "@/lib/search";

export type InvoiceHistoryTableRow = {
  id: string;
  exportedAt: string;
  periodStart: string;
  periodEnd: string;
  fileName: string;
  rowCount: number;
  totalAmount: number;
};

type LatestPeriod = {
  from: string;
  to: string;
};

type InvoiceHistoryFilter = "" | "review" | "zero" | "duplicate" | "latest";

export default function InvoiceHistoryTable({
  rows,
  latestPeriod,
}: {
  rows: InvoiceHistoryTableRow[];
  latestPeriod: LatestPeriod | null;
}) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<InvoiceHistoryFilter>("");
  const latestId = rows[0]?.id ?? "";
  const periodCounts = useMemo(() => buildPeriodCounts(rows), [rows]);
  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          const duplicate = samePeriodCount(row, periodCounts) > 1;
          return {
            zeroRows: acc.zeroRows + (row.rowCount === 0 ? 1 : 0),
            duplicateRows: acc.duplicateRows + (duplicate ? 1 : 0),
            reviewRows: acc.reviewRows + (row.rowCount === 0 || duplicate ? 1 : 0),
          };
        },
        { zeroRows: 0, duplicateRows: 0, reviewRows: 0 },
      ),
    [rows, periodCounts],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const duplicate = samePeriodCount(row, periodCounts) > 1;
        const needsReview = row.rowCount === 0 || duplicate;
        if (quickFilter === "review" && !needsReview) return false;
        if (quickFilter === "zero" && row.rowCount !== 0) return false;
        if (quickFilter === "duplicate" && !duplicate) return false;
        if (quickFilter === "latest" && row.id !== latestId) return false;
        return matchesQuery(search, [
          row.exportedAt,
          row.periodStart,
          row.periodEnd,
          row.fileName,
          `${row.rowCount}件`,
          `¥${row.totalAmount.toLocaleString()}`,
          row.totalAmount.toString(),
          duplicate ? "同期間 再出力" : "",
          row.rowCount === 0 ? "0件 出力なし" : "",
          row.id === latestId ? "最新 前回" : "",
        ]);
      }),
    [rows, search, quickFilter, periodCounts, latestId],
  );
  const hasActiveFilters = !!(search || quickFilter);
  const filterSummary = [
    `${filteredRows.length} / ${rows.length} 件`,
    quickFilter ? invoiceHistoryFilterLabel(quickFilter) : "",
    search,
  ].filter(Boolean).join(" / ");

  function resetFilters() {
    setSearch("");
    setQuickFilter("");
  }

  function applyQuickFilter(next: InvoiceHistoryFilter) {
    setQuickFilter((current) => (current === next ? "" : next));
  }

  if (rows.length === 0) {
    return <div className="empty-state">まだ出力履歴はありません。</div>;
  }

  return (
    <>
      <div className="invoice-history-command">
        <div className="invoice-history-command-title">
          <strong>履歴確認</strong>
          <span className={`badge ${summary.reviewRows > 0 ? "warn" : "success"}`}>
            {summary.reviewRows > 0 ? `要確認 ${summary.reviewRows}件` : "確認済み"}
          </span>
        </div>
        <div className="invoice-history-checks">
          <span className="badge info">
            表示 {filteredRows.length} / {rows.length} 件
          </span>
          <span className={`badge ${summary.zeroRows > 0 ? "warn" : "success"}`}>
            0件出力 {summary.zeroRows}
          </span>
          <span className={`badge ${summary.duplicateRows > 0 ? "warn" : "success"}`}>
            同期間出力 {summary.duplicateRows}
          </span>
          {latestPeriod && (
            <span className="badge muted">
              前回 {latestPeriod.from} 〜 {latestPeriod.to}
            </span>
          )}
        </div>
      </div>
      <div className="invoice-history-queue" aria-label="出力履歴確認キュー">
        <button
          type="button"
          className={quickFilter === "review" ? "is-active" : ""}
          onClick={() => applyQuickFilter("review")}
        >
          <span>要確認</span>
          <strong>{summary.reviewRows}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "zero" ? "is-active" : ""}
          onClick={() => applyQuickFilter("zero")}
        >
          <span>0件出力</span>
          <strong>{summary.zeroRows}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "duplicate" ? "is-active" : ""}
          onClick={() => applyQuickFilter("duplicate")}
        >
          <span>同期間出力</span>
          <strong>{summary.duplicateRows}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "latest" ? "is-active" : ""}
          onClick={() => applyQuickFilter("latest")}
        >
          <span>最新</span>
          <strong>{latestId ? 1 : 0}</strong>
        </button>
      </div>
      <CollapsiblePanel
        title="履歴の検索・絞り込み"
        summary={filterSummary}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="出力日時・対象期間・ファイル名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="出力履歴を検索"
          />
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filteredRows.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      {filteredRows.length === 0 ? (
        <div className="empty-state">条件に一致する出力履歴はありません。</div>
      ) : (
        <div className="table-frame standard-list-frame invoice-history-frame">
          <table className="standard-list-table invoice-history-table">
            <colgroup>
              <col className="invoice-exported-col" />
              <col className="invoice-period-col" />
              <col className="invoice-file-col" />
              <col className="invoice-count-col" />
              <col className="invoice-amount-col" />
            </colgroup>
            <thead>
              <tr>
                <th>出力日時</th>
                <th>対象期間</th>
                <th>ファイル名</th>
                <th>件数</th>
                <th>金額合計</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const duplicateCount = samePeriodCount(row, periodCounts);
                const duplicate = duplicateCount > 1;
                const needsReview = row.rowCount === 0 || duplicate;
                const isLatest = row.id === latestId;
                return (
                  <tr
                    key={row.id}
                    className={[
                      "invoice-history-row",
                      needsReview ? "row-needs-action" : "",
                      isLatest ? "is-latest" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <td data-label="出力日時">{row.exportedAt}</td>
                    <td data-label="対象期間">
                      {row.periodStart} 〜 {row.periodEnd}
                    </td>
                    <td className="wrap-cell invoice-file-cell" data-label="ファイル名">
                      <div className="invoice-file-name">{row.fileName}</div>
                      {(needsReview || isLatest) && (
                        <div className="invoice-history-row-badges">
                          {isLatest && <span className="badge info">最新</span>}
                          {row.rowCount === 0 && <span className="badge warn">0件</span>}
                          {duplicate && <span className="badge warn">同期間 {duplicateCount}回</span>}
                        </div>
                      )}
                    </td>
                    <td className="right" data-label="件数">{row.rowCount}</td>
                    <td className="right" data-label="金額合計">¥{row.totalAmount.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function buildPeriodCounts(rows: InvoiceHistoryTableRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = periodKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function samePeriodCount(row: InvoiceHistoryTableRow, periodCounts: Map<string, number>) {
  return periodCounts.get(periodKey(row)) ?? 0;
}

function periodKey(row: InvoiceHistoryTableRow) {
  return `${row.periodStart}:${row.periodEnd}`;
}

function invoiceHistoryFilterLabel(value: InvoiceHistoryFilter) {
  switch (value) {
    case "review":
      return "要確認";
    case "zero":
      return "0件出力";
    case "duplicate":
      return "同期間出力";
    case "latest":
      return "最新";
    default:
      return "";
  }
}
