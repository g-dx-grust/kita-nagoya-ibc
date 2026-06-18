import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  PackageCheck,
  Settings,
  Table2,
} from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import InvoiceExportForm from "./invoice-export-form";
import InvoiceHistoryTable, { type InvoiceHistoryTableRow } from "./invoice-history-table";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const today = toDateInputValue(new Date());
  const currentMonth = today.slice(0, 7);
  const sourceDateFrom = `${currentMonth}-01`;
  const sourceDateTo = today;
  const [history, sourceEntries] = await Promise.all([
    prisma.invoiceExport.findMany({
      orderBy: { exportedAt: "desc" },
      take: 50,
    }),
    prisma.productionDailyReportEntry.findMany({
      where: {
        active: true,
        reportDate: { gte: dateInputToUtcStart(sourceDateFrom), lte: dateInputToUtcEnd(sourceDateTo) },
      },
      include: { product: { select: { id: true, billingEnabled: true } } },
    }),
  ]);
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
  const sourceStats = buildSourceStats(sourceEntries);
  const sourceReviewCount = sourceStats.pendingApprovalCount + sourceStats.missingPriceCount;
  const dailyReportHref = kitagoyaPath(
    `/production-daily-reports?month=${currentMonth}${sourceReviewCount > 0 ? "&review=1#daily-report-review" : ""}`,
  );
  const productMasterHref = kitagoyaPath("/masters/products");
  const invoiceNext =
    sourceStats.pendingApprovalCount > 0
      ? { label: "未計上日報を確認", href: dailyReportHref }
      : sourceStats.missingPriceCount > 0
        ? { label: "売値未設定を確認", href: dailyReportHref }
        : !latest
          ? { label: "出力期間を設定", href: "#invoice-export" }
          : reviewCount > 0
            ? { label: "履歴の要確認を確認", href: "#invoice-history" }
            : { label: "CSV出力へ進む", href: "#invoice-export" };
  const invoiceFlowCards = [
    {
      label: "元データ",
      count: sourceStats.exportableCount,
      detail: `${currentMonth} 承認済み`,
      href: dailyReportHref,
      tone: sourceReviewCount > 0 ? "warn" : sourceStats.exportableCount > 0 ? "success" : "info",
      Icon: ClipboardList,
    },
    {
      label: "期間設定",
      count: latestPeriod ? "前回" : "未",
      detail: latestPeriod ? `${latestPeriod.from} 〜 ${latestPeriod.to}` : "初回出力待ち",
      href: "#invoice-export",
      tone: latestPeriod ? "info" : "warn",
      Icon: CalendarDays,
    },
    {
      label: "単価確認",
      count: sourceStats.missingPriceCount,
      detail: sourceStats.missingPriceCount > 0 ? "売値未設定" : "請求単価",
      href: sourceStats.missingPriceCount > 0 ? dailyReportHref : productMasterHref,
      tone: sourceStats.missingPriceCount > 0 ? "warn" : "success",
      Icon: Settings,
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
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={dailyReportHref}>
            <BarChart3 size={16} aria-hidden="true" />
            日報集計
          </Link>
          <Link className="button-link secondary-link" href={productMasterHref}>
            <Settings size={16} aria-hidden="true" />
            商品マスター
          </Link>
          <a className="button-link" href="#invoice-export">
            <FileText size={16} aria-hidden="true" />
            CSV出力
          </a>
        </div>
      </div>
      <div className="invoice-flow-command">
        <div className="invoice-flow-command-title">
          <span className={`badge ${sourceReviewCount > 0 || reviewCount > 0 ? "warn" : "success"}`}>
            {sourceReviewCount > 0 ? `元データ確認 ${sourceReviewCount}` : reviewCount > 0 ? `履歴確認 ${reviewCount}` : "確認済み"}
          </span>
          <strong>売上伝票CSVの出力フロー</strong>
          <span className="subtext">
            {latest ? `最新 ${formatDateTime(latest.exportedAt)}` : "まだ出力履歴はありません"}
          </span>
        </div>
        <a className="invoice-flow-next" href={invoiceNext.href}>
          次: {invoiceNext.label}
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
      <div className={`invoice-source-band ${sourceReviewCount > 0 ? "warn" : "success"}`}>
        <div className="invoice-source-main">
          <span className={`badge ${sourceReviewCount > 0 ? "warn" : "success"}`}>
            {sourceReviewCount > 0 ? "出力前確認あり" : "出力準備OK"}
          </span>
          <strong>
            <PackageCheck size={16} aria-hidden="true" />
            {currentMonth} の出力元データ
          </strong>
          <span className="subtext">
            {sourceDateFrom} 〜 {sourceDateTo}
          </span>
        </div>
        <div className="invoice-source-checks">
          <span className="badge info">承認済み {sourceStats.approvedCount}件</span>
          <span className={`badge ${sourceStats.exportableCount > 0 ? "success" : "muted"}`}>
            CSV対象 {sourceStats.exportableCount}件
          </span>
          <span className={`badge ${sourceStats.pendingApprovalCount > 0 ? "warn" : "success"}`}>
            未計上 {sourceStats.pendingApprovalCount}件
          </span>
          <span className={`badge ${sourceStats.missingPriceCount > 0 ? "warn" : "success"}`}>
            売値未設定 {sourceStats.missingPriceCount}件
          </span>
          <span className="badge muted">対象外 {sourceStats.excludedCount}件</span>
        </div>
        <div className="invoice-source-actions">
          <Link className="button-link secondary-link" href={dailyReportHref}>
            日報集計を確認
          </Link>
          <Link className="button-link secondary-link" href={productMasterHref}>
            単価・対象を確認
          </Link>
        </div>
      </div>
      <div className="invoice-summary-grid">
        <div className="metric">
          <div className="metric-label">今月のCSV対象</div>
          <div className={`metric-value${sourceStats.exportableCount > 0 ? "" : " warn-value"}`}>
            {sourceStats.exportableCount} 件
          </div>
          <div className="metric-note">
            {sourceStats.productCount} 商品 / ¥{Math.round(sourceStats.exportableAmount).toLocaleString()}
          </div>
        </div>
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

type InvoiceSourceEntry = Prisma.ProductionDailyReportEntryGetPayload<{
  include: { product: { select: { id: true; billingEnabled: true } } };
}>;

function buildSourceStats(entries: InvoiceSourceEntry[]) {
  const approvedEntries = entries.filter((entry) => entry.approvalStatus === "approved" && entry.productId && entry.product);
  const exportableEntries = approvedEntries.filter((entry) => entry.product?.billingEnabled && entry.unitPriceSnapshot > 0);
  return {
    approvedCount: approvedEntries.length,
    exportableCount: exportableEntries.length,
    exportableAmount: exportableEntries.reduce((sum, entry) => sum + entry.sales, 0),
    productCount: new Set(exportableEntries.map((entry) => entry.productId)).size,
    pendingApprovalCount: entries.filter((entry) => entry.approvalStatus === "submitted").length,
    missingPriceCount: approvedEntries.filter((entry) => entry.product?.billingEnabled && entry.unitPriceSnapshot <= 0).length,
    excludedCount: approvedEntries.filter((entry) => entry.product && !entry.product.billingEnabled).length,
  };
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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToUtcStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateInputToUtcEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}
