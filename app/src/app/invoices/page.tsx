import { prisma } from "@/lib/prisma";
import InvoiceExportForm from "./invoice-export-form";
import InvoiceHistoryTable, { type InvoiceHistoryTableRow } from "./invoice-history-table";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const history = await prisma.invoiceExport.findMany({
    orderBy: { exportedAt: "desc" },
    take: 50,
  });
  const latest = history[0] ?? null;
  const totalRows = history.reduce((sum, row) => sum + row.rowCount, 0);
  const totalAmount = history.reduce((sum, row) => sum + row.totalAmount, 0);
  const latestPeriod = latest
    ? { from: formatDate(latest.periodStart), to: formatDate(latest.periodEnd) }
    : null;
  const historyRows: InvoiceHistoryTableRow[] = history.map((row) => ({
    id: row.id,
    exportedAt: formatDateTime(row.exportedAt),
    periodStart: formatDate(row.periodStart),
    periodEnd: formatDate(row.periodEnd),
    fileName: row.fileName,
    rowCount: row.rowCount,
    totalAmount: row.totalAmount,
  }));

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
      <InvoiceHistoryTable rows={historyRows} latestPeriod={latestPeriod} />
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
