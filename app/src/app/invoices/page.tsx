import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Table2 } from "lucide-react";
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
  const periodCounts = buildPeriodCounts(historyRows);
  const zeroExportCount = historyRows.filter((row) => row.rowCount === 0).length;
  const duplicateExportCount = historyRows.filter((row) => (periodCounts.get(periodKey(row)) ?? 0) > 1).length;
  const reviewCount = historyRows.filter(
    (row) => row.rowCount === 0 || (periodCounts.get(periodKey(row)) ?? 0) > 1,
  ).length;
  const invoiceNextAction = !latest
    ? "出力期間を設定"
    : reviewCount > 0
      ? "履歴の要確認を確認"
      : "次の期間を出力";
  const invoiceNextHref = reviewCount > 0 ? "#invoice-history" : "#invoice-export";
  const invoiceFlowCards = [
    {
      label: "期間設定",
      count: latestPeriod ? "前回" : "未",
      detail: latestPeriod ? `${latestPeriod.from} 〜 ${latestPeriod.to}` : "初回出力待ち",
      href: "#invoice-export",
      tone: latestPeriod ? "info" : "warn",
      Icon: CalendarDays,
    },
    {
      label: "CSV出力",
      count: latest?.rowCount ?? 0,
      detail: latest ? latest.fileName : "履歴なし",
      href: "#invoice-export",
      tone: latest ? (latest.rowCount === 0 ? "warn" : "success") : "warn",
      Icon: FileText,
    },
    {
      label: "履歴確認",
      count: history.length,
      detail: "直近50件まで表示",
      href: "#invoice-history",
      tone: reviewCount > 0 ? "warn" : "success",
      Icon: Table2,
    },
    {
      label: "要確認",
      count: reviewCount,
      detail: `0件 ${zeroExportCount} / 同期間 ${duplicateExportCount}`,
      href: "#invoice-history",
      tone: reviewCount > 0 ? "warn" : "success",
      Icon: reviewCount > 0 ? AlertTriangle : CheckCircle2,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>請求 / 売上伝票CSV出力</h1>
      </div>
      <div className="invoice-flow-command">
        <div className="invoice-flow-command-title">
          <span className={`badge ${reviewCount > 0 ? "warn" : "success"}`}>
            {reviewCount > 0 ? `要確認 ${reviewCount}` : "確認済み"}
          </span>
          <strong>売上伝票CSVの出力フロー</strong>
          <span className="subtext">
            {latest ? `最新 ${formatDateTime(latest.exportedAt)}` : "まだ出力履歴はありません"}
          </span>
        </div>
        <a className="invoice-flow-next" href={invoiceNextHref}>
          次: {invoiceNextAction}
        </a>
      </div>
      <div className="invoice-flow-queue" aria-label="請求CSV出力フロー">
        {invoiceFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
          <a key={label} className={`invoice-flow-card ${tone}`} href={href}>
            <span>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
            <small>{detail}</small>
          </a>
        ))}
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
      <section id="invoice-export" className="anchor-offset">
        <InvoiceExportForm latestPeriod={latestPeriod} />
      </section>

      <section id="invoice-history" className="anchor-offset">
        <h2>出力履歴</h2>
        <InvoiceHistoryTable rows={historyRows} latestPeriod={latestPeriod} />
      </section>
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

function periodKey(row: InvoiceHistoryTableRow) {
  return `${row.periodStart}:${row.periodEnd}`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
