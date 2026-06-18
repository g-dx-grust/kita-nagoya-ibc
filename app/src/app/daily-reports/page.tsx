import { HelpTooltip } from "@/components/ui/help-tooltip";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
  Save,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import DailyReportDayEntry, { type DayPlanRow } from "./daily-report-day-entry";

export const dynamic = "force-dynamic";

export default async function DailyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = normalizeDate(sp.date ?? new Date().toISOString().slice(0, 10));

  // 当日の生産予定(中止以外)を、紐づく日報・所要量つきで取得する。
  const plans = await prisma.productionPlan.findMany({
    where: {
      date: { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) },
      status: { not: "cancelled" },
    },
    include: {
      product: true,
      workArea: true,
      requirements: true,
      dailyReport: { include: { consumptions: true } },
    },
    orderBy: [{ workArea: { displayOrder: "asc" } }, { plannedStartTime: "asc" }],
  });

  const rows: DayPlanRow[] = plans.map((plan) => {
    const report = plan.dailyReport;
    const consumptionOf = (itemType: string, itemId: string) =>
      report?.consumptions.find((c) => c.itemType === itemType && c.itemId === itemId)?.actualQuantity;
    return {
      planId: plan.id,
      date,
      productCode: plan.product.productCode,
      productName: plan.product.displayName || plan.product.officialName,
      unit: plan.unit,
      casePackQty: plan.product.casePackQty,
      workAreaName: plan.workArea.name,
      planStatus: plan.status,
      plannedQuantity: plan.plannedQuantity,
      plannedPeopleCount: plan.plannedPeopleCount,
      plannedStartTime: plan.plannedStartTime,
      plannedEndTime: plan.plannedEndTime,
      reportStatus: report ? report.status : "none",
      confirmedAt: report?.confirmedAt ? report.confirmedAt.toISOString().slice(0, 16).replace("T", " ") : null,
      actualQuantity: report?.actualQuantity ?? plan.plannedQuantity,
      requirements: plan.requirements.map((r) => ({
        itemType: r.itemType as "raw_material" | "packaging",
        itemId: r.itemId,
        itemName: r.itemName,
        unit: r.unit,
        plannedQuantity: r.plannedQuantity,
        unitPriceSnapshot: r.unitPriceSnapshot,
        actualQuantity: consumptionOf(r.itemType, r.itemId) ?? r.plannedQuantity,
      })),
    };
  });

  const confirmedCount = rows.filter((r) => r.reportStatus === "confirmed").length;
  const draftCount = rows.filter((r) => r.reportStatus === "draft").length;
  const unenteredCount = rows.filter((r) => r.reportStatus === "none").length;
  const pendingCount = rows.filter((r) => r.reportStatus !== "confirmed").length;
  const materialLineCount = rows.reduce((count, row) => count + row.requirements.length, 0);
  const noRequirementCount = rows.filter((row) => row.requirements.length === 0).length;
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const today = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const hasRows = rows.length > 0;
  const productionPlansHref = kitagoyaPath(`/production-plans?dateFrom=${date}&dateTo=${date}`);
  const monthlyReportHref = kitagoyaPath(`/production-daily-reports?month=${month}`);
  const nextDailyReportAction =
    rows.length === 0
      ? { label: "生産予定を確認", href: productionPlansHref }
      : pendingCount > 0
        ? { label: "日報入力へ進む", href: "#daily-report-entry" }
        : noRequirementCount > 0
          ? { label: "BOMなしを確認", href: "#daily-report-entry" }
          : { label: "月次集計へ進む", href: monthlyReportHref };
  const dailyReportFlowCards = [
    {
      label: "生産日",
      count: date,
      detail: "表示条件",
      href: "#daily-report-date",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "生産予定",
      count: rows.length,
      detail: "当日予定",
      href: productionPlansHref,
      tone: rows.length > 0 ? "info" : "warn",
      Icon: ClipboardList,
    },
    {
      label: "入力対象",
      count: pendingCount,
      detail: `未入力 ${unenteredCount}`,
      href: "#daily-report-entry",
      tone: pendingCount > 0 ? "warn" : "success",
      Icon: Save,
    },
    {
      label: "使用量",
      count: materialLineCount,
      detail: noRequirementCount > 0 ? `BOMなし ${noRequirementCount}` : "原料・資材",
      href: "#daily-report-entry",
      tone: noRequirementCount > 0 ? "warn" : "info",
      Icon: PackageCheck,
    },
    {
      label: "月次集計",
      count: confirmedCount,
      detail: `${month} 商品別`,
      href: monthlyReportHref,
      tone: pendingCount === 0 && rows.length > 0 ? "success" : "info",
      Icon: BarChart3,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>日報</h1>
        <div className="page-title-actions">
          <HelpTooltip text="当日の生産予定に実数量と必要な実使用量を入力し、当日分をまとめて確定すると実績を在庫・原価に反映します。時間・人数は予定値を自動採用します。" />
          <Link className="button-link secondary-link" href={productionPlansHref}>
            <ClipboardList size={16} aria-hidden="true" />
            生産予定
          </Link>
          <Link className="button-link" href={monthlyReportHref}>
            <BarChart3 size={16} aria-hidden="true" />
            月次集計
          </Link>
        </div>
      </div>

      <div className={`daily-report-overview-command panel ${pendingCount > 0 ? "warn" : "success"}`}>
        <div className="daily-report-overview-main">
          <span className={`badge ${pendingCount > 0 ? "warn" : "success"}`}>
            <ClipboardCheck size={14} aria-hidden="true" />
            {pendingCount > 0 ? `未確定 ${pendingCount}件` : hasRows ? "当日分確定済み" : "予定なし"}
          </span>
          <strong>
            <CalendarDays size={16} aria-hidden="true" />
            {date} の日報確認
          </strong>
          <Link className="daily-report-overview-next" href={nextDailyReportAction.href}>
            次: {nextDailyReportAction.label}
          </Link>
        </div>
        <div className="daily-report-overview-checks">
          <span className="badge info">予定 {rows.length}件</span>
          <span className="badge success">確定 {confirmedCount}件</span>
          <span className="badge info">下書き {draftCount}件</span>
          <span className="badge muted">未入力 {unenteredCount}件</span>
          <span className={`badge ${pendingCount > 0 ? "warn" : "success"}`}>未確定 {pendingCount}件</span>
          {noRequirementCount > 0 && <span className="badge warn">BOMなし {noRequirementCount}件</span>}
        </div>
        <div className="daily-report-overview-actions" aria-label="日報日付移動">
          <Link className="button-link secondary-link" href={kitagoyaPath(`/daily-reports?date=${previousDate}`)}>
            <ChevronLeft size={15} aria-hidden="true" />
            前日
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/daily-reports?date=${today}`)}>
            今日
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/daily-reports?date=${nextDate}`)}>
            翌日
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="daily-report-overview-flow" aria-label="当日日報フロー">
        {dailyReportFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
          <Link key={label} className={`daily-report-overview-card ${tone}`} href={href}>
            <span>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
            <small>{detail}</small>
          </Link>
        ))}
      </div>

      <form id="daily-report-date" className="panel toolbar anchor-offset" method="GET">
        <label>
          <span>生産日</span>
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button type="submit" className="secondary">
          表示
        </button>
      </form>

      <div className="panel">
        <div className="stat-grid">
          <Metric label="当日の予定" value={`${rows.length} 件`} />
          <Metric label="確定済み" value={`${confirmedCount} 件`} />
          <Metric label="下書き" value={`${draftCount} 件`} />
          <Metric label="未確定（要対応）" value={`${pendingCount} 件`} />
        </div>
      </div>

      <DailyReportDayEntry date={date} rows={rows} />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00`);
  target.setDate(target.getDate() + days);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
