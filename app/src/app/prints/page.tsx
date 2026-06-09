import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function PrintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  const [start, end] = dayRange(date);

  const plans = await prisma.productionPlan.findMany({
    where: { date: { gte: start, lt: end }, status: { not: "cancelled" } },
    include: { assignments: true },
    orderBy: [{ plannedStartTime: "asc" }],
  });

  const assignedCount = plans.reduce((sum, plan) => sum + plan.assignments.length, 0);

  return (
    <>
      <h1>現場印刷</h1>
      <form className="panel toolbar" method="GET">
        <label>
          <span>対象日</span>
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button type="submit" className="secondary">
          表示
        </button>
      </form>

      <div className="panel grid grid-3">
        <div>
          <div className="metric-label">対象日</div>
          <div className="metric-value">{date}</div>
        </div>
        <div>
          <div className="metric-label">生産予定</div>
          <div className="metric-value">{plans.length} 件</div>
        </div>
        <div>
          <div className="metric-label">配置済みスタッフ</div>
          <div className="metric-value">{assignedCount} 人</div>
        </div>
      </div>

      <div className="panel">
        <h2>印刷HTML</h2>
        <div className="row">
          <Link className="button-link" href={kitagoyaPath(`/prints/production-schedule?date=${date}`)}>
            生産スケジュール印刷
          </Link>
          <Link className="button-link" href={kitagoyaPath(`/prints/staff-assignments?date=${date}`)}>
            スタッフ配置印刷
          </Link>
        </div>
      </div>

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
