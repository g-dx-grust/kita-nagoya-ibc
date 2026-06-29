import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  PackageCheck,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import FormSearchableCombobox from "@/components/ui/form-searchable-combobox";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import PlanListTable from "./plan-list-table";

export const dynamic = "force-dynamic";

export default async function ProductionPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const dateFrom = sp.dateFrom;
  const dateTo = sp.dateTo;
  const status = sp.status;
  const workAreaId = sp.workAreaId;
  const today = toDateInputValue(new Date());

  const [plans, workAreas] = await Promise.all([
    prisma.productionPlan.findMany({
      where: {
        ...(dateFrom || dateTo
          ? {
              date: {
                gte: dateFrom ? new Date(dateFrom) : undefined,
                lte: dateTo ? new Date(dateTo) : undefined,
              },
            }
          : {}),
        status: status || undefined,
        workAreaId: workAreaId || undefined,
      },
      include: { product: true, workArea: true, requirements: true, dailyReport: true },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  const tableRows = plans.map((p) => ({
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    productCode: p.product.productCode,
    productName: p.product.displayName || p.product.officialName,
    casePackQty: p.product.casePackQty,
    workAreaName: p.workArea.name,
    plannedQuantity: p.plannedQuantity,
    unit: p.unit,
    plannedPeopleCount: p.plannedPeopleCount,
    plannedStartTime: p.plannedStartTime,
    plannedEndTime: p.plannedEndTime,
    status: p.status,
    reportStatus: p.dailyReport?.status ?? "none",
    overtimeMinutes: p.overtimeMinutes,
    hardShortage: p.requirements.some((r) => r.shortageType === "hard_shortage"),
    unconfirmedDep: p.requirements.some((r) => r.shortageType === "unconfirmed_dependency"),
    belowSafety: p.requirements.some((r) => r.shortageType === "below_safety"),
  }));
  const displayScope = dateFrom && dateTo
    ? `${dateFrom} 〜 ${dateTo}`
    : dateFrom
      ? `${dateFrom} 以降`
      : dateTo
        ? `${dateTo} まで`
        : "全期間";
  const todayCount = tableRows.filter((row) => row.date === today).length;
  const draftCount = tableRows.filter((row) => row.status === "draft").length;
  const hardShortageCount = tableRows.filter((row) => row.hardShortage).length;
  const unconfirmedDependencyCount = tableRows.filter((row) => row.unconfirmedDep).length;
  const belowSafetyCount = tableRows.filter((row) => row.belowSafety).length;
  const shortageReviewCount = hardShortageCount + unconfirmedDependencyCount + belowSafetyCount;
  const reportWaitingCount = tableRows.filter(
    (row) => row.status === "confirmed" && row.reportStatus !== "confirmed",
  ).length;
  const overtimeCount = tableRows.filter((row) => row.overtimeMinutes > 0).length;
  const reviewCount = draftCount + shortageReviewCount + reportWaitingCount + overtimeCount;
  const firstReportWaitingPlan = tableRows.find(
    (row) => row.status === "confirmed" && row.reportStatus !== "confirmed",
  );
  const planOverviewTone = reviewCount > 0 ? "warn" : "success";
  const planNextAction = !dateFrom && !dateTo
    ? {
        label: "今日の予定を見る",
        href: productionPlansHref({ dateFrom: today, dateTo: today }),
      }
    : draftCount > 0
      ? { label: "仮予定を確認", href: "#plan-list-review" }
      : shortageReviewCount > 0
        ? { label: "不足を確認", href: "#plan-list-review" }
        : reportWaitingCount > 0 && firstReportWaitingPlan
          ? { label: "日報入力へ", href: kitagoyaPath(`/daily-reports?date=${firstReportWaitingPlan.date}`) }
          : { label: "新規予定を作成", href: kitagoyaPath("/production-plans/new") };
  const planOverviewCards: {
    label: string;
    count: number | string;
    detail: string;
    href: string;
    tone: "info" | "warn" | "danger" | "success";
    Icon: LucideIcon;
  }[] = [
    {
      label: "表示範囲",
      count: tableRows.length,
      detail: displayScope,
      href: "#production-plan-filters",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "今日",
      count: todayCount,
      detail: today,
      href: productionPlansHref({ dateFrom: today, dateTo: today, status, workAreaId }),
      tone: todayCount > 0 ? "success" : "info",
      Icon: CalendarDays,
    },
    {
      label: "仮予定",
      count: draftCount,
      detail: "確定前",
      href: productionPlansHref({ dateFrom, dateTo, status: "draft", workAreaId }),
      tone: draftCount > 0 ? "warn" : "success",
      Icon: ClipboardList,
    },
    {
      label: "不足",
      count: shortageReviewCount,
      detail: `実不足 ${hardShortageCount} / 未確定 ${unconfirmedDependencyCount} / 安全在庫 ${belowSafetyCount}`,
      href: "#plan-list-review",
      tone: hardShortageCount > 0 ? "danger" : shortageReviewCount > 0 ? "warn" : "success",
      Icon: AlertTriangle,
    },
    {
      label: "日報待ち",
      count: reportWaitingCount,
      detail: "確定予定の実績",
      href: firstReportWaitingPlan ? kitagoyaPath(`/daily-reports?date=${firstReportWaitingPlan.date}`) : "#plan-list-review",
      tone: reportWaitingCount > 0 ? "warn" : "success",
      Icon: FileCheck2,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>生産予定</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath("/product-planning#product-planning-inputs")}>
            <PackageCheck className="h-4 w-4" />
            受注登録
          </Link>
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath("/production-plans/monthly")}>
            <CalendarDays className="h-4 w-4" />
            月間生成
          </Link>
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath("/production-plans/auto")}>
            <Users className="h-4 w-4" />
            自動作成
          </Link>
          <Link className="button-link gap-2" href={kitagoyaPath("/production-plans/new")}>
            <Plus className="h-4 w-4" />
            新規予定
          </Link>
        </div>
      </div>
      <CollapsiblePanel
        title="確認・操作"
        summary={`${reviewCount > 0 ? `要確認 ${reviewCount}件` : "確認済み"} / 表示 ${tableRows.length}件 / ${displayScope}`}
        className="top-flow-accordion"
      >
        <div className={`production-plans-overview-command ${planOverviewTone}`}>
          <div className="production-plans-overview-title">
            {planOverviewTone === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span className={`badge ${planOverviewTone}`}>
              {reviewCount > 0 ? `要確認 ${reviewCount}件` : "確認済み"}
            </span>
            <strong>生産予定の確認フロー</strong>
            <span className="subtext">
              {displayScope} / 表示 {tableRows.length}件
            </span>
          </div>
          <Link className="production-plans-overview-next" href={planNextAction.href}>
            次: {planNextAction.label}
          </Link>
        </div>
        <div className="production-plans-overview-grid" aria-label="生産予定確認フロー">
          {planOverviewCards.map(({ label, count, detail, href, tone, Icon }) => (
            <Link key={label} className={`production-plans-overview-card ${tone}`} href={href}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
      </CollapsiblePanel>
      <CollapsiblePanel
        title="検索・表示条件"
        summary={`${dateFrom || "開始日未指定"} 〜 ${dateTo || "終了日未指定"}${status ? ` / 状態 ${status}` : ""}${
          workAreaId ? " / 作業場所指定あり" : ""
        }`}
        open={!!(dateFrom || dateTo || status || workAreaId)}
      >
        <form id="production-plan-filters" className="toolbar compact-controls anchor-offset" method="GET">
          <label>
            <span>開始日</span>
            <input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label>
            <span>終了日</span>
            <input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <label>
            <span>状態</span>
            <select name="status" defaultValue={status}>
              <option value="">すべて</option>
              <option value="draft">仮予定</option>
              <option value="tentative_confirmed">仮確定</option>
              <option value="confirmed">確定</option>
              <option value="completed">完了</option>
              <option value="cancelled">取消</option>
            </select>
          </label>
          <label>
            <span>作業場所</span>
            <FormSearchableCombobox
              name="workAreaId"
              initialValue={workAreaId ?? ""}
              options={workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name }))}
              emptyOptionLabel="すべて"
              placeholder="作業場所名で検索"
              ariaLabel="作業場所で絞り込み"
            />
          </label>
          <button type="submit" className="secondary">
            絞り込み
          </button>
        </form>
      </CollapsiblePanel>

      <PlanListTable
        plans={tableRows}
        filter={{ dateFrom, dateTo, status, workAreaId }}
      />
    </>
  );
}

function productionPlansHref(params: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  workAreaId?: string;
}) {
  const search = new URLSearchParams();
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  if (params.status) search.set("status", params.status);
  if (params.workAreaId) search.set("workAreaId", params.workAreaId);
  const query = search.toString();
  return kitagoyaPath(query ? `/production-plans?${query}` : "/production-plans");
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
