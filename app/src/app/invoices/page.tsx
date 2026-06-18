import { prisma } from "@/lib/prisma";
import InvoiceExportForm from "./invoice-export-form";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const history = await prisma.invoiceExport.findMany({
    orderBy: { exportedAt: "desc" },
    take: 50,
  });
  const latest = history[0] ?? null;
  const totalRows = history.reduce((sum, row) => sum + row.rowCount, 0);
  const totalAmount = history.reduce((sum, row) => sum + row.totalAmount, 0);
  const periodCounts = buildPeriodCounts(history);
  const zeroRowCount = history.filter((row) => row.rowCount === 0).length;
  const duplicatePeriodExportCount = history.filter((row) => (periodCounts.get(periodKey(row)) ?? 0) > 1).length;
  const latestPeriod = latest
    ? { from: formatDate(latest.periodStart), to: formatDate(latest.periodEnd) }
    : null;

  return (
    <>
      <div className="page-title-row">
        <h1>請求 / 売上伝票CSV出力</h1>
      </div>
      <div className="invoice-summary-grid">
        <div className="metric">
          <div className="metric-label">最新出力</div>
          <div className="metric-value invoice-summary-main">
            {latest ? formatDateTime(latest.exportedAt) : "未出力"}
          </div>
          {latest && (
            <div className="metric-note">
              {formatDate(latest.periodStart)} 〜 {formatDate(latest.periodEnd)}
            </div>
          )}
        </div>
        <div className="metric">
          <div className="metric-label">履歴件数</div>
          <div className="metric-value">{history.length} 件</div>
          <div className="metric-note">直近50件まで表示</div>
        </div>
        <div className="metric">
          <div className="metric-label">出力行数</div>
          <div className="metric-value">{totalRows.toLocaleString()} 行</div>
          <div className="metric-note">表示履歴の合計</div>
        </div>
        <div className="metric">
          <div className="metric-label">金額合計</div>
          <div className="metric-value">¥{Math.round(totalAmount).toLocaleString()}</div>
          <div className="metric-note">表示履歴の合計</div>
        </div>
      </div>
      <InvoiceExportForm latestPeriod={latestPeriod} />

      <h2>出力履歴</h2>
      {history.length === 0 ? (
        <div className="empty-state">まだ出力履歴はありません。</div>
      ) : (
        <>
          <div className="invoice-history-command">
            <div className="invoice-history-command-title">
              <strong>履歴確認</strong>
              <span className={`badge ${zeroRowCount > 0 || duplicatePeriodExportCount > 0 ? "warn" : "success"}`}>
                {zeroRowCount > 0 || duplicatePeriodExportCount > 0 ? "要確認あり" : "確認済み"}
              </span>
            </div>
            <div className="invoice-history-checks">
              <span className="badge info">履歴 {history.length}件</span>
              <span className={`badge ${zeroRowCount > 0 ? "warn" : "success"}`}>0件出力 {zeroRowCount}</span>
              <span className={`badge ${duplicatePeriodExportCount > 0 ? "warn" : "success"}`}>
                同期間出力 {duplicatePeriodExportCount}
              </span>
              {latestPeriod && (
                <span className="badge muted">
                  前回 {latestPeriod.from} 〜 {latestPeriod.to}
                </span>
              )}
            </div>
          </div>
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
                {history.map((h) => {
                  const samePeriodCount = periodCounts.get(periodKey(h)) ?? 0;
                  const needsReview = h.rowCount === 0 || samePeriodCount > 1;
                  return (
                    <tr key={h.id} className={`invoice-history-row ${needsReview ? "row-needs-action" : ""}`}>
                      <td data-label="出力日時">{formatDateTime(h.exportedAt)}</td>
                      <td data-label="対象期間">
                        {formatDate(h.periodStart)} 〜 {formatDate(h.periodEnd)}
                      </td>
                      <td className="wrap-cell invoice-file-cell" data-label="ファイル名">
                        <div className="invoice-file-name">{h.fileName}</div>
                        {needsReview && (
                          <div className="invoice-history-row-badges">
                            {h.rowCount === 0 && <span className="badge warn">0件</span>}
                            {samePeriodCount > 1 && <span className="badge warn">同期間 {samePeriodCount}回</span>}
                          </div>
                        )}
                      </td>
                      <td className="right" data-label="件数">{h.rowCount}</td>
                      <td className="right" data-label="金額合計">¥{h.totalAmount.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

type InvoiceHistoryRow = {
  periodStart: Date;
  periodEnd: Date;
};

function buildPeriodCounts(history: InvoiceHistoryRow[]) {
  const counts = new Map<string, number>();
  for (const row of history) {
    const key = periodKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function periodKey(row: InvoiceHistoryRow) {
  return `${formatDate(row.periodStart)}:${formatDate(row.periodEnd)}`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
