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
      <InvoiceExportForm />

      <h2>出力履歴</h2>
      {history.length === 0 ? (
        <div className="empty-state">まだ出力履歴はありません。</div>
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
              {history.map((h) => (
                <tr key={h.id} className="invoice-history-row">
                  <td data-label="出力日時">{formatDateTime(h.exportedAt)}</td>
                  <td data-label="対象期間">
                    {formatDate(h.periodStart)} 〜 {formatDate(h.periodEnd)}
                  </td>
                  <td className="wrap-cell invoice-file-cell" data-label="ファイル名">
                    {h.fileName}
                  </td>
                  <td className="right" data-label="件数">{h.rowCount}</td>
                  <td className="right" data-label="金額合計">¥{h.totalAmount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
