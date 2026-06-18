import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Search, Table2 } from "lucide-react";

import { HelpTooltip } from "@/components/ui/help-tooltip";
import { kitagoyaPath } from "@/lib/paths";
import {
  DEFAULT_DAILY_REPORT_DASHBOARD_THRESHOLDS,
  buildProductDailyReportDashboard,
  type ProductDailyReportDashboardEntry,
  type ProductDailyReportDashboardComparison,
} from "@/lib/product-daily-report-dashboard";
import { prisma } from "@/lib/prisma";
import { matchesQuery } from "@/lib/search";
import ProductReportFilter from "../product-report-filter";

export const dynamic = "force-dynamic";

type DailyReportEntryForDashboard = Prisma.ProductionDailyReportEntryGetPayload<{
  include: {
    product: {
      select: {
        productCode: true;
        displayName: true;
        officialName: true;
      };
    };
  };
}>;

export default async function ProductionDailyReportDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const month = normalizeMonth(sp.month ?? new Date().toISOString().slice(0, 7));
  const productId = sp.productId ?? "";
  const q = (sp.q ?? "").trim();
  const monthStart = monthDate(month);
  const monthEnd = shiftMonthDate(monthStart, 1);
  const previousMonth = shiftMonth(month, -1);
  const previousMonthStart = monthDate(previousMonth);
  const previousMonthEnd = monthStart;

  const [entries, previousEntries, products] = await Promise.all([
    prisma.productionDailyReportEntry.findMany({
      where: {
        active: true,
        approvalStatus: "approved",
        reportDate: { gte: monthStart, lt: monthEnd },
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { productCode: true, displayName: true, officialName: true } },
      },
      orderBy: [{ reportDate: "asc" }, { sourceRowNumber: "asc" }, { createdAt: "asc" }],
    }),
    prisma.productionDailyReportEntry.findMany({
      where: {
        active: true,
        approvalStatus: "approved",
        reportDate: { gte: previousMonthStart, lt: previousMonthEnd },
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { productCode: true, displayName: true, officialName: true } },
      },
      orderBy: [{ reportDate: "asc" }, { sourceRowNumber: "asc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: { active: true },
      include: { aliases: true },
      orderBy: [{ usedAtKitagoya: "desc" }, { productCode: "asc" }],
    }),
  ]);

  const dashboardEntries = filterDashboardEntries(entries.map(toDashboardEntry), q);
  const previousDashboardEntries = filterDashboardEntries(previousEntries.map(toDashboardEntry), q);
  const dashboard = buildProductDailyReportDashboard(dashboardEntries, previousDashboardEntries);
  const productOptions = products.map((product) => ({
    id: product.id,
    productCode: product.productCode,
    officialName: product.officialName,
    displayName: product.displayName,
    aliases: product.aliases.map((alias) => alias.aliasName),
    specification: product.specification,
    brandName: product.brandName,
    unit: product.unit,
  }));
  const maxProductQty = Math.max(0, ...dashboard.productRows.map((row) => row.productionQty));
  const maxDailyQty = Math.max(0, ...dashboard.dailyRows.map((row) => row.productionQty));
  const costRows = [
    { label: "原料原価", value: dashboard.totals.materialCost, className: "material" },
    { label: "資材原価", value: dashboard.totals.packageCost, className: "package" },
    { label: "手間賃推計", value: dashboard.totals.estimatedLaborCost, className: "labor" },
  ];
  const maxCost = Math.max(0, ...costRows.map((row) => row.value));
  const hasAlerts = dashboard.totals.alertRowCount > 0;
  const alertReasonRows = countAlertReasons(dashboard.alertRows.flatMap((row) => row.reasonLabels));
  const alertStatusText = hasAlerts
    ? "商品照合、単価、ロス率、利率を確認してください。"
    : "確認対象はありません。";

  return (
    <>
      <div className="dashboard-header">
        <div>
          <h1>
            製造実績ダッシュボード
            <HelpTooltip text="確定済みの製造実績だけを集計しています。予定数量や未計上の日報は含めません。" />
          </h1>
        </div>
        <div className="dashboard-actions">
          {hasAlerts && (
            <a className="button-link secondary-link gap-2" href="#dashboard-alerts">
              <AlertTriangle className="h-4 w-4" />
              確認対象
            </a>
          )}
          <Link className="button-link secondary-link gap-2" href={dailyReportHref(month, productId, q)}>
            <Table2 className="h-4 w-4" />
            日報一覧
          </Link>
        </div>
      </div>

      <form
        className="panel toolbar"
        method="GET"
        action={kitagoyaPath("/production-daily-reports/dashboard")}
      >
        <label>
          <span>対象月</span>
          <input name="month" type="month" defaultValue={month} />
        </label>
        <label>
          <span>商品</span>
          <ProductReportFilter products={productOptions} initialProductId={productId} />
        </label>
        <label className="filter-search">
          <span>商品検索</span>
          <input name="q" type="search" defaultValue={q} placeholder="商品名・管理コード" />
        </label>
        <button type="submit" className="gap-2">
          <Search className="h-4 w-4" />
          表示
        </button>
      </form>

      <div className={`panel dashboard-control-band ${hasAlerts ? "warn" : "success"}`}>
        <div className="dashboard-period-nav">
          <Link className="button-link secondary-link gap-2" href={dashboardHref(shiftMonth(month, -1), productId, q)}>
            <CalendarDays className="h-4 w-4" />
            前月
          </Link>
          <span>{month}</span>
          <Link className="button-link secondary-link gap-2" href={dashboardHref(shiftMonth(month, 1), productId, q)}>
            <CalendarDays className="h-4 w-4" />
            翌月
          </Link>
        </div>
        <div className="dashboard-control-status">
          {hasAlerts ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          <div>
            <span className="dashboard-control-label">確認対象</span>
            <strong>
              {dashboard.totals.alertRowCount} 件 / {dashboard.totals.alertIssueCount} 項目
            </strong>
            <p>{alertStatusText}</p>
            {alertReasonRows.length > 0 && (
              <div className="dashboard-alert-breakdown" aria-label="確認理由の内訳">
                {alertReasonRows.slice(0, 5).map((row) => (
                  <span key={row.label} className="badge warn">
                    {row.label} {row.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <a className="button-link secondary-link gap-2" href={hasAlerts ? "#dashboard-alerts" : dailyReportHref(month, productId, q)}>
          <ClipboardCheck className="h-4 w-4" />
          {hasAlerts ? "確認対象を見る" : "日報一覧へ"}
        </a>
      </div>

      <div className="stat-grid dashboard-kpis">
        <Metric
          label="生産数合計"
          value={formatNumber(dashboard.totals.productionQty)}
          subtext={`${dashboard.totals.entryCount} 件 / ${dashboard.totals.productCount} 商品`}
          trend={formatDeltaRate(dashboard.comparison.productionQtyDeltaRate)}
          tone={toneFromRate(dashboard.comparison.productionQtyDeltaRate)}
        />
        <Metric
          label="売値合計"
          value={formatYen(dashboard.totals.sales)}
          subtext={`前月 ${formatYen(dashboard.previousTotals.sales)}`}
          trend={formatDeltaRate(dashboard.comparison.salesDeltaRate)}
          tone={toneFromRate(dashboard.comparison.salesDeltaRate)}
        />
        <Metric
          label="粗利（原料+資材）"
          value={formatYen(dashboard.totals.grossProfit)}
          subtext={`利率 ${formatPercent(dashboard.totals.profitRate)}`}
          trend={formatDeltaPoint(dashboard.comparison)}
          tone={toneFromRate(dashboard.comparison.profitRateDelta)}
        />
        <Metric
          label="1人当たりの1h生産数"
          value={formatNumber(dashboard.totals.averagePerHourQty, 1)}
          subtext={`${formatNumber(dashboard.totals.workerHours, 1)} 人時`}
        />
        <Metric
          label="使用原料"
          value={`${formatNumber(dashboard.totals.materialUsedKg, 1)} kg`}
          subtext={`履歴取込 ${dashboard.totals.historyOnlyCount} 件`}
        />
        <Metric
          label="要確認"
          value={`${dashboard.totals.alertRowCount} 件`}
          subtext={`${dashboard.totals.alertIssueCount} 項目`}
          tone={hasAlerts ? "warn" : "positive"}
        />
      </div>

      <div className="dashboard-grid dashboard-grid-2">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-heading">
            <h2>商品別 実績上位</h2>
            <span className="badge info">生産数順</span>
          </div>
          <div className="table-frame">
            <table className="dashboard-product-table">
              <colgroup>
                <col className="dashboard-product-name-col" />
                <col className="dashboard-product-qty-col" />
                <col className="dashboard-product-money-col" />
                <col className="dashboard-product-rate-col" />
                <col className="dashboard-product-rate-col" />
                <col className="dashboard-product-number-col" />
                <col className="dashboard-product-rate-col" />
                <col className="dashboard-product-alert-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>商品</th>
                  <th className="right">生産数</th>
                  <th className="right">売値</th>
                  <th className="right">利率</th>
                  <th className="right">ロス率</th>
                  <th className="right">1h生産数</th>
                  <th className="right">構成比</th>
                  <th className="right">要確認</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.productRows.slice(0, 12).map((row) => (
                  <tr key={row.productKey}>
                    <td className="dashboard-name-cell">
                      <div>{row.productName}</div>
                      {row.productCode && <div className="subtext">{row.productCode}</div>}
                    </td>
                    <td className="right dashboard-bar-cell">
                      <div>{formatNumber(row.productionQty)}</div>
                      <div className="dashboard-bar-track" aria-hidden="true">
                        <div className="dashboard-bar-fill production" style={{ width: barWidth(row.productionQty, maxProductQty) }} />
                      </div>
                    </td>
                    <td className="right">{formatYen(row.sales)}</td>
                    <td className="right">
                      <span className={`dashboard-rate-pill ${profitRateTone(row.profitRate)}`}>
                        {formatPercent(row.profitRate)}
                      </span>
                    </td>
                    <td className="right">
                      <span className={`dashboard-rate-pill ${lossRateTone(row.averageLossRate)}`}>
                        {formatPercent(row.averageLossRate)}
                      </span>
                    </td>
                    <td className="right">{formatNumber(row.averagePerHourQty, 1)}</td>
                    <td className="right">{formatPercent(row.productionShare)}</td>
                    <td className="right">{row.alertRowCount > 0 ? <span className="badge warn">{row.alertRowCount}</span> : "0"}</td>
                  </tr>
                ))}
                {dashboard.productRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted">
                      対象月の確定済み日報はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="dashboard-alerts" className={`panel dashboard-panel dashboard-alert-panel anchor-offset ${hasAlerts ? "" : "is-clear"}`}>
          <div className="dashboard-section-heading">
            <h2>確認対象</h2>
            <span className={hasAlerts ? "badge warn" : "badge success"}>
              {dashboard.totals.alertRowCount} 件
            </span>
          </div>
          {hasAlerts ? (
            <>
              <div className="dashboard-alert-list">
                {dashboard.alertRows.slice(0, 8).map((row) => (
                  <div key={row.id} className="dashboard-alert-item">
                    <div className="dashboard-alert-item-main">
                      <strong>{row.productName}</strong>
                      <span>
                        {row.date}
                        {row.productCode ? ` / ${row.productCode}` : ""}
                      </span>
                    </div>
                    <div className="dashboard-badge-cell">
                      {row.reasonLabels.map((label) => (
                        <span key={label} className="badge warn">
                          {label}
                        </span>
                      ))}
                    </div>
                    <dl>
                      <div>
                        <dt>生産数</dt>
                        <dd>{formatNumber(row.productionQty)}</dd>
                      </div>
                      <div>
                        <dt>ロス率</dt>
                        <dd>{formatPercent(row.lossRate)}</dd>
                      </div>
                      <div>
                        <dt>利率</dt>
                        <dd>{formatPercent(row.profitRate)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="dashboard-panel-actions">
                <Link className="button-link secondary-link gap-2" href={dailyReportReviewHref(month, productId, q)}>
                  <Table2 className="h-4 w-4" />
                  日報一覧で確認
                </Link>
                {dashboard.alertRows.length > 8 && (
                  <HelpTooltip text="上位8件を表示しています。全件確認は日報一覧で行ってください。" />
                )}
              </div>
            </>
          ) : (
            <div className="dashboard-clear-state">
              <CheckCircle2 className="h-6 w-6" />
              <div>
                <strong>確認対象はありません</strong>
                <span>確定済み日報の照合状態、単価、ロス率、利率に注意表示はありません。</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-2">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-heading">
            <h2>日別推移</h2>
            <span className="badge info">{month}</span>
          </div>
          <div className="table-frame">
            <table className="dashboard-daily-table">
              <colgroup>
                <col className="dashboard-daily-date-col" />
                <col className="dashboard-daily-count-col" />
                <col className="dashboard-daily-qty-col" />
                <col className="dashboard-daily-material-col" />
                <col className="dashboard-daily-money-col" />
                <col className="dashboard-daily-rate-col" />
                <col className="dashboard-daily-alert-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>日付</th>
                  <th className="right">件数</th>
                  <th className="right">生産数</th>
                  <th className="right">使用原料</th>
                  <th className="right">売値</th>
                  <th className="right">利率</th>
                  <th className="right">要確認</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.dailyRows.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td className="right">{row.entryCount}</td>
                    <td className="right dashboard-bar-cell">
                      <div>{formatNumber(row.productionQty)}</div>
                      <div className="dashboard-bar-track" aria-hidden="true">
                        <div className="dashboard-bar-fill production" style={{ width: barWidth(row.productionQty, maxDailyQty) }} />
                      </div>
                    </td>
                    <td className="right">{formatNumber(row.materialUsedKg, 1)} kg</td>
                    <td className="right">{formatYen(row.sales)}</td>
                    <td className="right">
                      <span className={`dashboard-rate-pill ${profitRateTone(row.profitRate)}`}>
                        {formatPercent(row.profitRate)}
                      </span>
                    </td>
                    <td className="right">{row.alertRowCount > 0 ? <span className="badge warn">{row.alertRowCount}</span> : "0"}</td>
                  </tr>
                ))}
                {dashboard.dailyRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      対象月の確定済み日報はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="dashboard-side-stack">
          <section className="panel dashboard-panel">
            <div className="dashboard-section-heading">
              <h2>原価・手間賃</h2>
              <span className="badge muted">日報計算値</span>
            </div>
            <div className="dashboard-cost-list">
              {costRows.map((row) => (
                <div key={row.label} className="dashboard-cost-row">
                  <div>
                    <strong>{row.label}</strong>
                    <span>{formatYen(row.value)}</span>
                  </div>
                  <div className="dashboard-bar-track" aria-hidden="true">
                    <div className={`dashboard-bar-fill ${row.className}`} style={{ width: barWidth(row.value, maxCost) }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="dashboard-mini-grid">
              <div>
                <span>合計原価</span>
                <strong>{formatYen(dashboard.totals.totalCost)}</strong>
              </div>
              <div>
                <span>原料原価</span>
                <strong>{formatYen(dashboard.totals.materialCost)}</strong>
              </div>
              <div>
                <span>資材原価</span>
                <strong>{formatYen(dashboard.totals.packageCost)}</strong>
              </div>
              <div>
                <span>1個生産時間</span>
                <strong>{formatNumber(dashboard.totals.averagePerUnitTimeMinutes, 2)} M</strong>
              </div>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <div className="dashboard-section-heading">
              <h2>データ区分</h2>
              <span className="badge muted">在庫二重差引防止</span>
            </div>
            <div className="dashboard-mini-grid compact">
              <div>
                <span>在庫反映済み</span>
                <strong>{dashboard.totals.inventoryReflectedCount} 件</strong>
              </div>
              <div>
                <span>履歴取込（在庫未反映）</span>
                <strong>{dashboard.totals.historyOnlyCount} 件</strong>
              </div>
              <div>
                <span>前月の日報行数</span>
                <strong>{dashboard.previousTotals.entryCount} 件</strong>
              </div>
              <div>
                <span>商品未照合</span>
                <strong>{dashboard.totals.unmatchedProductCount} 件</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function toDashboardEntry(entry: DailyReportEntryForDashboard): ProductDailyReportDashboardEntry {
  return {
    id: entry.id,
    reportDate: entry.reportDate,
    productId: entry.productId,
    productCode: entry.product?.productCode ?? null,
    productName: entry.product?.displayName || entry.product?.officialName || entry.productName,
    productionQty: entry.productionQty,
    materialUsedKg: entry.materialUsedKg,
    operatingMinutes: entry.operatingMinutes,
    totalOperatingMinutes: entry.totalOperatingMinutes,
    perHourQty: entry.perHourQty,
    perUnitTimeMinutes: entry.perUnitTimeMinutes,
    laborFeePerUnit: entry.laborFeePerUnit,
    lossRate: entry.lossRate,
    materialCost: entry.materialCost,
    packageCost: entry.packageCost,
    totalCost: entry.totalCost,
    sales: entry.sales,
    profitRate: entry.profitRate,
    inventoryReflected: entry.inventoryReflected,
    productMatchStatus: entry.productMatchStatus,
    calculationWarnings: parseWarnings(entry.calculationWarnings),
    capacityGSnapshot: entry.capacityGSnapshot,
    unitPriceSnapshot: entry.unitPriceSnapshot,
    note: entry.note,
  };
}

function filterDashboardEntries(entries: ProductDailyReportDashboardEntry[], q: string) {
  if (!q) return entries;
  return entries.filter((entry) => matchesQuery(q, [entry.productName, entry.productCode ?? "", entry.note ?? ""]));
}

function countAlertReasons(labels: string[]) {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"),
  );
}

function Metric({
  label,
  value,
  subtext,
  trend,
  tone = "neutral",
}: {
  label: string;
  value: string;
  subtext?: string;
  trend?: string;
  tone?: "positive" | "negative" | "neutral" | "warn";
}) {
  return (
    <div className={`metric dashboard-metric ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="dashboard-metric-footer">
        {subtext && <span>{subtext}</span>}
        {trend && <strong>{trend}</strong>}
      </div>
    </div>
  );
}

function normalizeMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function shiftMonth(month: string, offset: number) {
  return shiftMonthDate(monthDate(month), offset).toISOString().slice(0, 7);
}

function shiftMonthDate(date: Date, offset: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + offset);
  return next;
}

function dashboardHref(month: string, productId: string, q: string) {
  return `${kitagoyaPath("/production-daily-reports/dashboard")}?${buildParams(month, productId, q)}`;
}

function dailyReportHref(month: string, productId: string, q: string) {
  return `${kitagoyaPath("/production-daily-reports")}?${buildParams(month, productId, q)}`;
}

function dailyReportReviewHref(month: string, productId: string, q: string) {
  const params = buildParams(month, productId, q);
  return `${kitagoyaPath("/production-daily-reports")}?${params}&review=1#daily-report-review`;
}

function buildParams(month: string, productId: string, q: string) {
  const params = new URLSearchParams({ month });
  if (productId) params.set("productId", productId);
  if (q) params.set("q", q);
  return params.toString();
}

function parseWarnings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toneFromRate(value: number | null): "positive" | "negative" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function profitRateTone(value: number) {
  if (value < 0) return "danger";
  if (value <= DEFAULT_DAILY_REPORT_DASHBOARD_THRESHOLDS.lowProfitRate) return "warn";
  return "success";
}

function lossRateTone(value: number) {
  if (value >= DEFAULT_DAILY_REPORT_DASHBOARD_THRESHOLDS.highLossRate) return "warn";
  if (value < 0) return "info";
  return "neutral";
}

function barWidth(value: number, max: number) {
  if (value <= 0 || max <= 0) return "0%";
  return `${Math.max(3, Math.round((value / max) * 100))}%`;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(value);
}

function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDeltaRate(value: number | null) {
  if (value === null) return "前月なし";
  const sign = value > 0 ? "+" : "";
  return `前月比 ${sign}${formatPercent(value)}`;
}

function formatDeltaPoint(comparison: ProductDailyReportDashboardComparison) {
  const value = comparison.profitRateDelta * 100;
  if (dashboardHadNoPreviousSales(comparison)) return "前月なし";
  const sign = value > 0 ? "+" : "";
  return `前月比 ${sign}${formatNumber(value, 1)}pt`;
}

function dashboardHadNoPreviousSales(comparison: ProductDailyReportDashboardComparison) {
  return comparison.salesDeltaRate === null;
}
