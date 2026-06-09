import { prisma } from "@/lib/prisma";
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
  const pendingCount = rows.filter((r) => r.reportStatus !== "confirmed").length;

  return (
    <>
      <h1>日報</h1>
      <p className="section-note">
        当日の生産予定を一覧で表示します。各予定に実数量（必要なら実使用量も）を入力し、「当日分をまとめて確定」で
        実績を在庫・原価に反映します。時間・人数は予定値を自動採用します（個別に細かく直す場合は各予定の詳細画面へ）。
      </p>

      <form className="panel toolbar" method="GET">
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
