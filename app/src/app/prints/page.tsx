import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Printer,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function PrintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? toDateInputValue(new Date());
  const [start, end] = dayRange(date);
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const today = toDateInputValue(new Date());

  const plans = await prisma.productionPlan.findMany({
    where: { date: { gte: start, lt: end }, status: { not: "cancelled" } },
    include: { assignments: true },
    orderBy: [{ plannedStartTime: "asc" }],
  });

  const assignedCount = plans.reduce((sum, plan) => sum + plan.assignments.length, 0);
  const requiredStaffCount = plans.reduce((sum, plan) => sum + plan.plannedPeopleCount, 0);
  const unassignedCount = Math.max(0, requiredStaffCount - assignedCount);
  const workAreaCount = new Set(plans.map((plan) => plan.workAreaId)).size;
  const draftCount = plans.filter((plan) => plan.status === "draft").length;
  const isPrintReady = plans.length > 0 && unassignedCount === 0 && draftCount === 0;
  const productionPlansHref = kitagoyaPath(`/production-plans?dateFrom=${date}&dateTo=${date}`);
  const allocationHref = kitagoyaPath(`/production-plans/allocate?date=${date}`);
  const productionScheduleHref = kitagoyaPath(`/prints/production-schedule?date=${date}`);
  const staffAssignmentsHref = kitagoyaPath(`/prints/staff-assignments?date=${date}`);
  const nextPrintAction =
    plans.length === 0
      ? { label: "生産予定を確認", href: productionPlansHref }
      : unassignedCount > 0
        ? { label: "当日割り当て", href: allocationHref }
        : draftCount > 0
          ? { label: "仮予定を確認", href: productionPlansHref }
          : { label: "作業日報を開く", href: productionScheduleHref };
  const printFlowCards = [
    {
      label: "対象日",
      count: date === today ? "今日" : date.slice(5).replace("-", "/"),
      detail: date,
      href: "#prints-date",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "生産予定",
      count: plans.length,
      detail: draftCount > 0 ? `仮 ${draftCount}件` : `${workAreaCount}室`,
      href: productionPlansHref,
      tone: plans.length === 0 || draftCount > 0 ? "warn" : "success",
      Icon: ClipboardList,
    },
    {
      label: "作業日報",
      count: plans.length,
      detail: `${workAreaCount}室 / ${plans.length}件`,
      href: productionScheduleHref,
      tone: isPrintReady ? "success" : "warn",
      Icon: ClipboardCheck,
    },
    {
      label: "配置表",
      count: assignedCount,
      detail: `必要 ${requiredStaffCount} / 未配置 ${unassignedCount}`,
      href: unassignedCount > 0 ? allocationHref : staffAssignmentsHref,
      tone: unassignedCount > 0 ? "warn" : "success",
      Icon: Users,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>現場印刷</h1>
        <div className="page-title-actions">
          <Link className="button-link gap-2" href={productionScheduleHref}>
            <Printer className="h-4 w-4" />
            作業日報印刷
          </Link>
          <Link className="button-link gap-2" href={staffAssignmentsHref}>
            <Printer className="h-4 w-4" />
            スタッフ配置印刷
          </Link>
        </div>
      </div>
      <div className={`prints-flow-command ${isPrintReady ? "success" : "warn"}`}>
        <div className="prints-flow-command-title">
          {isPrintReady ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span className={`badge ${isPrintReady ? "success" : "warn"}`}>
            {isPrintReady ? "印刷OK" : "要確認"}
          </span>
          <strong>現場印刷の準備</strong>
          <span className="subtext">
            {plans.length}件 / {workAreaCount}室 / 未配置 {unassignedCount}人
          </span>
        </div>
        <Link className="prints-flow-next" href={nextPrintAction.href}>
          次: {nextPrintAction.label}
        </Link>
      </div>
      <div className="prints-flow-queue" aria-label="現場印刷フロー">
        {printFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
          <Link key={label} className={`prints-flow-card ${tone}`} href={href}>
            <span>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
            <small>{detail}</small>
          </Link>
        ))}
      </div>
      <form id="prints-date" className="panel prints-control-panel anchor-offset" method="GET">
        <div className="prints-date-nav">
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/prints?date=${previousDate}`)}>
            <ChevronLeft className="h-4 w-4" />
            前日
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/prints?date=${today}`)}>
            今日
          </Link>
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/prints?date=${nextDate}`)}>
            翌日
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="prints-control-fields">
          <label>
            <span>対象日</span>
            <input name="date" type="date" defaultValue={date} />
          </label>
        </div>
        <button type="submit" className="secondary">
          表示
        </button>
      </form>

      <div className="prints-summary-grid">
        <div className="metric">
          <div className="metric-label">対象日</div>
          <div className="metric-value">{date}</div>
        </div>
        <div className="metric">
          <div className="metric-label">生産予定</div>
          <div className="metric-value">{plans.length} 件</div>
        </div>
        <div className="metric">
          <div className="metric-label">作業場所</div>
          <div className="metric-value">{workAreaCount} 室</div>
        </div>
        <div className="metric">
          <div className="metric-label">必要人数</div>
          <div className="metric-value">{requiredStaffCount} 人</div>
        </div>
        <div className="metric">
          <div className="metric-label">配置済みスタッフ</div>
          <div className="metric-value">{assignedCount} 人</div>
        </div>
        <div className="metric">
          <div className="metric-label">未配置</div>
          <div className={`metric-value${unassignedCount > 0 ? " danger-value" : ""}`}>{unassignedCount} 人</div>
        </div>
      </div>

      <div
        id="prints-readiness"
        className={`prints-readiness-panel anchor-offset ${isPrintReady ? "success" : "warn"}`}
      >
        <div>
          <span className="badge">印刷準備</span>
          <strong>
            {plans.length === 0
              ? "生産予定なし"
              : unassignedCount > 0
                ? `未配置 ${unassignedCount} 人`
                : draftCount > 0
                  ? `仮予定 ${draftCount} 件`
                  : "配置確認済み"}
          </strong>
        </div>
        <Link className="button-link secondary-link gap-2" href={allocationHref}>
          <Users className="h-4 w-4" />
          当日割り当て
        </Link>
      </div>

      <section id="prints-output" className="prints-output-section anchor-offset">
        <h2>印刷HTML</h2>
        <div className="prints-output-grid">
          <Link className="print-output-card" href={productionScheduleHref}>
            <span className="print-output-head">
              <span className="print-output-title">作業日報印刷</span>
              <span className="badge">作業日報</span>
            </span>
            <span className="print-output-meta">
              {plans.length}件 / {workAreaCount}室
            </span>
            <span className="print-output-action">開く</span>
          </Link>
          <Link className="print-output-card" href={staffAssignmentsHref}>
            <span className="print-output-head">
              <span className="print-output-title">スタッフ配置印刷</span>
              <span className={`badge${unassignedCount > 0 ? " warn" : " success"}`}>
                {unassignedCount > 0 ? `未配置 ${unassignedCount}人` : "配置済み"}
              </span>
            </span>
            <span className="print-output-meta">
              配置済み {assignedCount}人 / 必要 {requiredStaffCount}人
            </span>
            <span className="print-output-action">開く</span>
          </Link>
        </div>
      </section>

      {unassignedCount > 0 && (
        <div className="alert warn">
          スタッフ配置印刷の前に、未配置の人数を当日割り当てで確認してください。
        </div>
      )}

      {plans.length === 0 && (
        <div className="alert info">
          対象日の生産予定がないため、印刷HTMLには空の状態が表示されます。
        </div>
      )}

      <div className="alert info">
        印刷ページはブラウザの印刷機能でそのまま紙に出せるHTMLです。印刷時はナビゲーションや操作ボタンを非表示にします。
      </div>
    </>
  );
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00`);
  target.setDate(target.getDate() + days);
  return toDateInputValue(target);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
