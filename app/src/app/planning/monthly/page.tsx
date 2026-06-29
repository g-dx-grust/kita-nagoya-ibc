import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  PackageCheck,
  RotateCcw,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { loadInventoryVisibilityDashboard } from "@/lib/inventory-visibility";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import {
  loadMonthlyLoopProgress,
  monthRange,
  normalizeYearMonth,
  toDateInput,
  type MonthlyLoopProgress,
  type MonthlyLoopStepKey,
} from "@/lib/monthly-flow-progress";
import { kitagoyaPath } from "@/lib/paths";
import { evaluatePlanBacking } from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";
import { formatCases } from "@/lib/units";
import ReplanQueueActions from "./replan-queue-actions";

export const dynamic = "force-dynamic";

type HubStep = {
  no: number;
  label: string;
  completed: boolean;
  detail: string;
  href: string;
  anchor: string;
};

export default async function MonthlyPlanningHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ym = normalizeYearMonth(sp.ym ?? sp.month);
  const { monthStart, monthEnd } = monthRange(ym);
  const dateFrom = toDateInput(monthStart);
  const dateTo = toDateInput(monthEnd);

  const [
    progress,
    runs,
    selectedRun,
    replanEvents,
    replanJobs,
    submittedReportCount,
    inventoryDashboard,
    purchaseWaitingCount,
    promotableRows,
  ] = await Promise.all([
    loadMonthlyLoopProgress(ym),
    prisma.monthlyPlanningRun.findMany({
      where: { yearMonth: ym },
      include: {
        _count: { select: { candidates: true, productionPlans: true, batches: true } },
        batches: { orderBy: [{ adoptedAt: "desc" }, { id: "desc" }], take: 1 },
      },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      take: 8,
    }),
    loadSelectedRun(sp.runId, ym),
    prisma.replanEvent.findMany({
      where: { status: "pending", targetMonth: ym },
      include: { jobs: { orderBy: [{ createdAt: "desc" }] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.replanJob.findMany({
      where: { status: { in: ["pending", "planned"] }, scopeMonth: ym },
      include: { event: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.productionDailyReportEntry.count({
      where: { active: true, approvalStatus: "submitted", reportDate: { gte: monthStart, lte: monthEnd } },
    }),
    loadInventoryVisibilityDashboard({ targetMonth: ym, itemType: "raw_material" }),
    prisma.purchaseOrder.count({
      where: {
        status: { in: ["candidate", "draft", "ordered_unconfirmed", "confirmed"] },
        OR: [
          { shortageDate: { gte: monthStart, lte: monthEnd } },
          { recommendedOrderDate: { gte: monthStart, lte: monthEnd } },
          { expectedArrivalDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
    }),
    loadPromotableRows(monthStart, monthEnd),
  ]);

  const hubSteps = buildHubSteps(progress, submittedReportCount);
  const shortageRows = inventoryDashboard.rows
    .filter((row) => row.shortageType !== "none" || row.shortageQuantity > 0)
    .slice(0, 8);
  const selectedRunCandidateCount = selectedRun?._count.candidates ?? selectedRun?.candidates.length ?? 0;
  const selectedRunAdopted = selectedRun?.status === "adopted";

  return (
    <>
      <div className="page-title-row">
        <h1>月次計画ハブ</h1>
        <div className="page-title-actions">
          <Link className="button-link" href={progress.monthlyNextAction.href}>
            <ListChecks size={16} aria-hidden="true" />
            次: {progress.monthlyNextAction.label}
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/monthly?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>
            月間予定
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/inventory?month=${ym}`)}>
            在庫
          </Link>
        </div>
      </div>

      <form className="toolbar compact-controls" method="GET">
        <label>
          <span>対象月</span>
          <input name="ym" type="month" defaultValue={ym} />
        </label>
        <button type="submit" className="secondary">表示</button>
      </form>

      <section className="panel" aria-label="月次計画ループ進捗">
        <div className="toolbar">
          <div>
            <span className={`badge ${progress.completedCount === progress.totalCount ? "success" : "info"}`}>
              {progress.completedCount} / {progress.totalCount}
            </span>
            <strong className="ml-2">理想動線 1〜15</strong>
            <span className="subtext"> {dateFrom} - {dateTo}</span>
          </div>
          <div className="spacer" />
          <span className={`badge ${replanJobs.length > 0 ? "warn" : "success"}`}>
            再計画待ち {replanJobs.length}
          </span>
          <span className={`badge ${submittedReportCount > 0 ? "warn" : "success"}`}>
            日報承認待ち {submittedReportCount}
          </span>
        </div>
        <div className="home-operations-grid">
          {hubSteps.map((step) => (
            <Link key={step.no} className={`home-operations-card ${step.completed ? "success" : "warn"}`} href={step.href}>
              <span>{step.no}. {step.label}</span>
              <strong>{step.completed ? "済" : "未"}</strong>
              <small>{step.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section id="shifts" className="anchor-offset">
        <CollapsiblePanel title="1. シフト登録" summary={`登録 ${progress.metrics.shiftCount}件`} open>
          <div className="after-table">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?month=${ym}`)}>シフトを登録</Link>
            <Link className="button-link secondary-link" href="#demand">需要算出へ</Link>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="demand" className="anchor-offset">
        <CollapsiblePanel title="2. 需要算出" summary={`実績/受注 ${progress.metrics.demandSourceCount}件`} open>
          <div className="after-table">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/product-planning?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>受注・製品計画</Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/monthly?dateFrom=${dateFrom}&dateTo=${dateTo}#forecast`)}>月間予測を見る</Link>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="allocate" className="anchor-offset">
        <CollapsiblePanel title="3. シフト割付・候補生成" summary={`候補 ${progress.metrics.candidateCount}件`} open>
          <div className="after-table">
            <Link className="button-link" href={kitagoyaPath(`/production-plans/monthly?dateFrom=${dateFrom}&dateTo=${dateTo}#candidates`)}>
              候補を生成・確認
            </Link>
            <Link className="button-link secondary-link" href="#candidates">生成履歴へ</Link>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="candidates" className="anchor-offset">
        <CollapsiblePanel
          title="4. MonthlyPlanningRun 履歴・候補"
          summary={`run ${runs.length}件 / 選択候補 ${selectedRunCandidateCount}件 / ${selectedRunAdopted ? "採用済み" : "未採用"}`}
          open
        >
          {runs.length === 0 ? (
            <div className="empty-state">この月の計画runはまだありません。月間予定から候補を生成してください。</div>
          ) : (
            <div className="table-frame">
              <table>
                <thead>
                  <tr>
                    <th>生成日時</th>
                    <th>状態</th>
                    <th>基準</th>
                    <th>候補</th>
                    <th>採用予定</th>
                    <th>batch</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.generatedAt)}</td>
                      <td><span className={`badge ${run.status === "adopted" ? "success" : "info"}`}>{runStatusLabel(run.status)}</span></td>
                      <td>{planningBasisLabel(run.basis)}</td>
                      <td className="right">{run._count.candidates}</td>
                      <td className="right">{run._count.productionPlans}</td>
                      <td>{run.batches[0]?.id ? <span className="badge muted">{run.batches[0].status}</span> : "—"}</td>
                      <td>
                        <Link href={kitagoyaPath(`/planning/monthly?ym=${ym}&runId=${run.id}#candidates`)}>候補を見る</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedRun && (
            <>
              <h3>選択中の候補</h3>
              {selectedRun.candidates.length === 0 ? (
                <div className="empty-state">候補行はありません。</div>
              ) : (
                <div className="table-frame">
                  <table>
                    <thead>
                      <tr>
                        <th>予定日</th>
                        <th>商品</th>
                        <th>区分</th>
                        <th>作業場所</th>
                        <th>数量</th>
                        <th>材料リスク</th>
                        <th>採用状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRun.candidates.slice(0, 12).map((candidate) => (
                        <tr key={candidate.id}>
                          <td>{toDateInput(candidate.planDate)}</td>
                          <td>{candidate.product.productCode} · {candidate.product.displayName || candidate.product.officialName}</td>
                          <td><span className="badge muted">{demandTypeLabel(candidate.demandType)}</span></td>
                          <td>{candidate.workArea.name}</td>
                          <td className="right">{formatCases(candidate.quantity, { casePackQty: candidate.product.casePackQty, baseUnit: candidate.product.unit })}</td>
                          <td>{candidate.materialRisk ?? "未評価"}</td>
                          <td><span className={`badge ${selectedRunAdopted ? "success" : "info"}`}>{selectedRunAdopted ? "仮予定採用済み" : "候補保存済み"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CollapsiblePanel>
      </section>

      <section id="confirm" className="anchor-offset">
        <CollapsiblePanel title="5. 仮予定採用・確定準備" summary={`仮予定 ${progress.steps.find((s) => s.key === "adopt")?.count ?? 0}件 / 確定 ${progress.metrics.confirmedPlanCount}件`} open>
          <div className="after-table">
            <Link className="button-link" href={kitagoyaPath(`/production-plans/monthly/confirm?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>
              仮予定・仮確定を確認
            </Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>
              生産予定一覧
            </Link>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="purchase" className="anchor-offset">
        <CollapsiblePanel title="6. 発注候補・入荷予定" summary={`発注/入荷待ち ${purchaseWaitingCount}件`} open>
          <div className="after-table">
            <Link className="button-link" href={kitagoyaPath(`/purchases?targetMonth=${ym}`)}>
              発注候補・入荷予定へ
            </Link>
            <span className="subtext">入荷予定日を入れたあと、裏付けできた予定は下の「仮確定/確定へ昇格」で確認します。</span>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="promotable" className="anchor-offset">
        <CollapsiblePanel title="7. 仮確定/確定へ昇格" summary={`仮確定可能 ${promotableRows.promotableToTentative.length}件 / 確定可能 ${promotableRows.promotableToConfirm.length}件`} open>
          {promotableRows.results.length === 0 ? (
            <div className="empty-state">昇格対象の仮予定/仮確定はありません。</div>
          ) : (
            <div className="table-frame">
              <table>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>商品</th>
                    <th>状態</th>
                    <th>仮確定</th>
                    <th>確定</th>
                    <th>理由</th>
                  </tr>
                </thead>
                <tbody>
                  {promotableRows.results.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td><Link href={kitagoyaPath(`/production-plans/${row.id}`)}>{row.productName}</Link></td>
                      <td><span className={`badge ${planStatusClass(row.status)}`}>{planStatusLabel(row.status)}</span></td>
                      <td><span className={`badge ${row.canTentativeConfirm ? "success" : "warn"}`}>{row.canTentativeConfirm ? "可" : "待ち"}</span></td>
                      <td><span className={`badge ${row.canConfirm ? "success" : "warn"}`}>{row.canConfirm ? "可" : "待ち"}</span></td>
                      <td className="wrap-cell">{row.blockingRequirements[0]?.reason ?? "裏付けあり"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsiblePanel>
      </section>

      <section id="replan" className="anchor-offset">
        <CollapsiblePanel title="8. 再計画キュー" summary={`event ${replanEvents.length}件 / job ${replanJobs.length}件`} open>
          <div className="alert info">
            差分適用アルゴリズムは最小実装です。受注生産・確定・完了済み予定は勝手に動かさず、翌日以降の在庫生産だけを再編成対象にします。
          </div>
          {replanJobs.length === 0 ? (
            <div className="empty-state">再計画待ちはありません。</div>
          ) : (
            <div className="table-frame">
              <table>
                <thead>
                  <tr>
                    <th>発生日時</th>
                    <th>原因</th>
                    <th>対象月</th>
                    <th>source</th>
                    <th>状態</th>
                    <th>event</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {replanJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{formatDateTime(job.createdAt)}</td>
                      <td>{replanEventTypeLabel(job.event.eventType)}</td>
                      <td>{job.scopeMonth ?? job.event.targetMonth ?? "—"}</td>
                      <td>{job.event.sourceType ?? "—"} / {job.event.sourceId ?? "—"}</td>
                      <td><span className="badge warn">{job.status}</span></td>
                      <td>{job.eventId}</td>
                      <td><ReplanQueueActions jobId={job.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="after-table">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/api/replan-events?targetMonth=${ym}`)}>ReplanEvent API</Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/api/replan-jobs?scopeMonth=${ym}`)}>ReplanJob API</Link>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="daily-report" className="anchor-offset">
        <CollapsiblePanel title="9. 日報B承認・実績反映" summary={`承認待ち ${submittedReportCount}件 / 承認済み ${progress.metrics.approvedDailyReportCount}件`} open>
          <div className="after-table">
            <Link className="button-link" href={kitagoyaPath(`/production-daily-reports?month=${ym}`)}>日報Bを確認</Link>
            <span className="subtext">承認済み ProductionDailyReportEntry を実績の正として、商品在庫・原料/資材在庫・月次実績・手間賃・受注消し込み・再計画イベントへ反映します。</span>
          </div>
        </CollapsiblePanel>
      </section>

      <section id="inventory" className="anchor-offset">
        <CollapsiblePanel title="10. 在庫見える化" summary={`原料 ${inventoryDashboard.rows.length}品目 / 不足 ${shortageRows.length}品目`} open>
          <div className="table-frame">
            <table>
              <thead>
                <tr>
                  <th>品目</th>
                  <th>現在庫</th>
                  <th>予定引当後</th>
                  <th>確定入荷込み</th>
                  <th>未確定入荷込み</th>
                  <th>月末予測</th>
                  <th>翌月不足/発注推奨</th>
                  <th>導線</th>
                </tr>
              </thead>
              <tbody>
                {(shortageRows.length > 0 ? shortageRows : inventoryDashboard.rows.slice(0, 8)).map((row) => (
                  <tr key={`${row.itemType}:${row.itemId}`}>
                    <td>{row.itemName}</td>
                    <td className="right">{formatNumber(row.currentQuantity)} {row.unit}</td>
                    <td className="right">{formatNumber(row.afterPlannedAllocationQuantity)} {row.unit}</td>
                    <td className="right">{formatNumber(row.withConfirmedInboundQuantity)} {row.unit}</td>
                    <td className="right">{formatNumber(row.withUnconfirmedInboundQuantity)} {row.unit}</td>
                    <td className="right">{formatNumber(row.monthEndProjectedQuantity)} {row.unit}</td>
                    <td><span className={`badge ${row.shortageQuantity > 0 ? "warn" : "success"}`}>{row.recommendedAction}</span></td>
                    <td>
                      <div className="table-actions">
                        <Link href={row.links.stockMovements}>台帳</Link>
                        {row.links.purchaseOrders && <Link href={row.links.purchaseOrders}>発注</Link>}
                        {row.links.productionPlans && <Link href={row.links.productionPlans}>予定</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="after-table">
            <Link className="button-link" href={kitagoyaPath(`/inventory?month=${ym}`)}>
              <Warehouse size={15} aria-hidden="true" />
              在庫表へ
            </Link>
          </div>
        </CollapsiblePanel>
      </section>
    </>
  );
}

async function loadSelectedRun(runId: string | undefined, yearMonth: string) {
  const where = runId ? { id: runId } : { yearMonth };
  return prisma.monthlyPlanningRun.findFirst({
    where,
    include: {
      _count: { select: { candidates: true, productionPlans: true, batches: true } },
      candidates: {
        include: { product: true, workArea: true },
        orderBy: [{ planDate: "asc" }, { priority: "asc" }, { id: "asc" }],
        take: 20,
      },
      batches: { orderBy: [{ adoptedAt: "desc" }, { id: "desc" }], take: 3 },
    },
    orderBy: runId ? undefined : [{ generatedAt: "desc" }, { id: "desc" }],
  });
}

async function loadPromotableRows(monthStart: Date, monthEnd: Date) {
  const plans = await prisma.productionPlan.findMany({
    where: { date: { gte: monthStart, lte: monthEnd }, status: { in: ["draft", "tentative_confirmed"] } },
    include: { product: true, workArea: true },
    orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }, { id: "asc" }],
    take: 40,
  });
  const backing = await evaluatePlanBacking(plans.map((plan) => plan.id));
  const backingByPlanId = new Map(backing.map((row) => [row.planId, row]));
  const results = plans.map((plan) => {
    const row = backingByPlanId.get(plan.id);
    return {
      id: plan.id,
      date: toDateInput(plan.date),
      productName: plan.product.displayName || plan.product.officialName,
      status: plan.status,
      canTentativeConfirm: row?.canTentativeConfirm ?? false,
      canConfirm: row?.canConfirm ?? false,
      blockingRequirements: row?.blockingRequirements ?? [],
    };
  });
  return {
    results,
    promotableToTentative: results.filter((row) => row.status === "draft" && row.canTentativeConfirm),
    promotableToConfirm: results.filter((row) => row.canConfirm),
  };
}

function buildHubSteps(progress: MonthlyLoopProgress, submittedReportCount: number): HubStep[] {
  const byKey = new Map(progress.steps.map((step) => [step.key, step]));
  const step = (key: MonthlyLoopStepKey) => byKey.get(key);
  return [
    hubStep(1, "シフト登録", step("shifts")),
    hubStep(2, "需要算出", step("demand")),
    hubStep(3, "候補生成", step("candidates")),
    hubStep(4, "仮予定採用", step("adopt")),
    hubStep(5, "発注候補", step("purchase")),
    hubStep(6, "入荷予定", step("arrival")),
    hubStep(7, "仮確定", step("tentative")),
    hubStep(8, "確定", step("confirm")),
    hubStep(9, "受注反映", step("demand_reflect")),
    hubStep(10, "確定前確認", step("confirm")),
    hubStep(11, "当日割当", step("allocation")),
    hubStep(12, "日報提出", {
      ...step("daily_report")!,
      completed: submittedReportCount > 0 || step("daily_report")!.completed,
      detail: `承認待ち ${submittedReportCount}件`,
    }),
    hubStep(13, "日報承認", step("daily_report")),
    hubStep(14, "在庫・手間賃更新", step("inventory")),
    hubStep(15, "在庫見える化", step("inventory")),
  ];
}

function hubStep(no: number, label: string, base?: MonthlyLoopProgress["steps"][number]): HubStep {
  return {
    no,
    label,
    completed: base?.completed ?? false,
    detail: base?.detail ?? "未確認",
    href: base?.href ?? "#",
    anchor: base?.anchor ?? "",
  };
}

function runStatusLabel(status: string) {
  if (status === "adopted") return "採用済み";
  if (status === "simulated") return "候補保存済み";
  if (status === "superseded") return "差替済み";
  return status;
}

function planningBasisLabel(value: string) {
  return value === "inventory_shortage" ? "在庫不足" : value === "mixed" ? "混合" : "前々月前年比";
}

function demandTypeLabel(value: string) {
  if (value === "order") return "受注";
  if (value === "inventory") return "在庫";
  if (value === "forecast") return "予測";
  return value;
}

function replanEventTypeLabel(value: string) {
  switch (value) {
    case "demand_created":
      return "受注登録";
    case "demand_updated":
      return "受注更新";
    case "purchase_arrival_updated":
      return "入荷予定変更";
    case "day_allocation_changed":
      return "当日割当変更";
    case "daily_report_approved":
      return "日報承認";
    case "stock_adjusted":
      return "在庫調整";
    default:
      return value;
  }
}

function formatDateTime(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
