import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Users } from "lucide-react";
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

  return (
    <>
      <div className="page-title-row">
        <h1>現場印刷</h1>
        <div className="page-title-actions">
          <Link className="button-link gap-2" href={kitagoyaPath(`/prints/production-schedule?date=${date}`)}>
            <Printer className="h-4 w-4" />
            生産スケジュール印刷
          </Link>
          <Link className="button-link gap-2" href={kitagoyaPath(`/prints/staff-assignments?date=${date}`)}>
            <Printer className="h-4 w-4" />
            スタッフ配置印刷
          </Link>
        </div>
      </div>
      <form className="panel prints-control-panel" method="GET">
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

      <div className={`prints-readiness-panel ${unassignedCount > 0 ? "warn" : "success"}`}>
        <div>
          <span className="badge">印刷準備</span>
          <strong>{unassignedCount > 0 ? `未配置 ${unassignedCount} 人` : "配置確認済み"}</strong>
        </div>
        <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/production-plans/allocate?date=${date}`)}>
          <Users className="h-4 w-4" />
          当日割り当て
        </Link>
      </div>

      <section className="prints-output-section">
        <h2>印刷HTML</h2>
        <div className="prints-output-grid">
          <Link className="print-output-card" href={kitagoyaPath(`/prints/production-schedule?date=${date}`)}>
            <span className="print-output-head">
              <span className="print-output-title">生産スケジュール印刷</span>
              <span className="badge">作業日報</span>
            </span>
            <span className="print-output-meta">
              {plans.length}件 / {workAreaCount}室
            </span>
            <span className="print-output-action">開く</span>
          </Link>
          <Link className="print-output-card" href={kitagoyaPath(`/prints/staff-assignments?date=${date}`)}>
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
