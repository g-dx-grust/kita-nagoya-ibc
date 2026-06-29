import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Printer,
  ShoppingCart,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { loadMonthlyLoopProgress, normalizeYearMonth } from "@/lib/monthly-flow-progress";
import { kitagoyaPath } from "@/lib/paths";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "@/lib/plan-status";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { formatCases } from "@/lib/units";
import { MenuCard } from "@/components/ui/menu-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 「いつまでに発注しなければならないか」をダッシュボードに出す。
  // 未発注(候補/仮発注)で推奨発注日を持つものを取り、緊急度を「今日」基準で再計算し、
  // 期限間近(CRITICAL=発注期限が明日以内/超過)のものだけを並べる。
  const now = new Date();
  const today = toDateInputValue(now);
  const targetMonth = normalizeYearMonth(null, now);
  const [todayStart, todayEnd] = dayRange(today);
  const [
    shortageCount,
    pendingOrders,
    materialList,
    packagingList,
    upcoming,
    todayPlans,
    todayProductReportCount,
    monthlyProgress,
  ] = await Promise.all([
    prisma.productionPlanRequirement.count({
      where: { shortageType: { in: ["hard_shortage", "unconfirmed_dependency", "below_safety"] } },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["candidate", "draft", "ordered_unconfirmed"] },
        recommendedOrderDate: { not: null },
      },
      orderBy: [{ recommendedOrderDate: "asc" }],
    }),
    prisma.material.findMany(),
    prisma.packagingMaterial.findMany(),
    prisma.productionPlan.findMany({
      where: { status: { in: [...PLANNED_PRODUCTION_PLAN_STATUSES] } },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
      take: 8,
      include: { product: true, workArea: true },
    }),
    prisma.productionPlan.findMany({
      where: { date: { gte: todayStart, lt: todayEnd }, status: { not: "cancelled" } },
      include: { assignments: true, dailyReport: true },
      orderBy: [{ plannedStartTime: "asc" }],
    }),
    prisma.productionDailyReportEntry.count({
      where: { active: true, reportDate: { gte: todayStart, lt: todayEnd } },
    }),
    loadMonthlyLoopProgress(targetMonth),
  ]);
  const orderItemMap = new Map<
    string,
    { code: string; name: string; unit: string; casePackQty: number | null }
  >();
  for (const m of materialList) {
    orderItemMap.set(`raw_material:${m.id}`, {
      code: m.materialCode,
      name: m.name,
      unit: m.unit,
      casePackQty: null, // 原料(kg)はケース換算しない
    });
  }
  for (const m of packagingList) {
    orderItemMap.set(`packaging:${m.id}`, {
      code: m.materialCode,
      name: m.name,
      unit: m.unit,
      casePackQty: m.casePackQty ?? null,
    });
  }
  const orderByAlerts = pendingOrders
    .map((po) => {
      const item = orderItemMap.get(`${po.itemType}:${po.itemId}`);
      return {
        id: po.id,
        itemType: po.itemType,
        itemName: item?.name ?? po.itemId,
        unit: item?.unit ?? "",
        casePackQty: item?.casePackQty ?? null,
        orderedQuantity: po.orderedQuantity,
        recommendedOrderDate: po.recommendedOrderDate?.toISOString().slice(0, 10) ?? "",
        urgency: computeUrgency({ requiredOrderDate: po.recommendedOrderDate, asOfDate: now }),
      };
    })
    .filter((alert) => alert.urgency === "CRITICAL");

  const todayDraftCount = todayPlans.filter((plan) => plan.status === "draft").length;
  const todayAssignedCount = todayPlans.reduce((sum, plan) => sum + plan.assignments.length, 0);
  const todayRequiredStaffCount = todayPlans.reduce((sum, plan) => sum + plan.plannedPeopleCount, 0);
  const todayUnassignedCount = Math.max(0, todayRequiredStaffCount - todayAssignedCount);
  const todayPlanReportTodoCount = todayPlans.filter((plan) => plan.dailyReport?.status !== "confirmed").length;
  const todayPrintReady = todayPlans.length > 0 && todayDraftCount === 0 && todayUnassignedCount === 0;
  const todayPlanHref = kitagoyaPath(`/production-plans?dateFrom=${today}&dateTo=${today}`);
  const todayAllocateHref = kitagoyaPath(`/production-plans/allocate?date=${today}`);
  const todayPrintHref = kitagoyaPath(`/prints?date=${today}`);
  const todayDailyReportHref = kitagoyaPath(`/production-daily-reports?month=${today.slice(0, 7)}`);
  const purchaseHref = kitagoyaPath("/purchases");
  const homeNextAction =
    todayPlans.length === 0
      ? { label: "今日の生産予定を確認", href: todayPlanHref }
      : todayUnassignedCount > 0
        ? { label: "当日割り当て", href: todayAllocateHref }
        : todayDraftCount > 0
          ? { label: "仮予定を確認", href: todayPlanHref }
          : orderByAlerts.length > 0
            ? { label: "発注期限を確認", href: purchaseHref }
            : { label: "現場印刷", href: todayPrintHref };
  const todayFlowCards = [
    {
      label: "今日の予定",
      count: todayPlans.length,
      detail: todayDraftCount > 0 ? `仮 ${todayDraftCount}件` : today,
      href: todayPlanHref,
      tone: todayPlans.length === 0 || todayDraftCount > 0 ? "warn" : "success",
      Icon: CalendarDays,
    },
    {
      label: "当日割り当て",
      count: todayAssignedCount,
      detail: `必要 ${todayRequiredStaffCount} / 未配置 ${todayUnassignedCount}`,
      href: todayAllocateHref,
      tone: todayUnassignedCount > 0 ? "warn" : "success",
      Icon: Users,
    },
    {
      label: "現場印刷",
      count: todayPrintReady ? "OK" : "要",
      detail: `${todayPlans.length}件 / 未配置 ${todayUnassignedCount}`,
      href: todayPrintHref,
      tone: todayPrintReady ? "success" : "warn",
      Icon: Printer,
    },
    {
      label: "日報",
      count: todayProductReportCount,
      detail: `予定連動 未確定 ${todayPlanReportTodoCount}`,
      href: todayDailyReportHref,
      tone: todayProductReportCount > 0 ? "success" : "info",
      Icon: ClipboardCheck,
    },
    {
      label: "発注期限",
      count: orderByAlerts.length,
      detail: shortageCount > 0 ? `不足 ${shortageCount}件` : "不足なし",
      href: purchaseHref,
      tone: orderByAlerts.length > 0 || shortageCount > 0 ? "warn" : "success",
      Icon: ShoppingCart,
    },
  ];

  return (
    <>
      <h1>ホーム</h1>

      <section className="home-operations-panel" aria-label="今日の業務">
        <div className={`home-operations-command ${todayPrintReady && orderByAlerts.length === 0 ? "success" : "warn"}`}>
          <div className="home-operations-status">
            {todayPrintReady && orderByAlerts.length === 0 ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span className={`badge ${todayPrintReady && orderByAlerts.length === 0 ? "success" : "warn"}`}>
              {todayPrintReady && orderByAlerts.length === 0 ? "本日の準備OK" : "本日の要確認"}
            </span>
            <strong>今日の業務キュー</strong>
            <span className="subtext">
              {today} / 予定 {todayPlans.length}件 / 未配置 {todayUnassignedCount}人 / 発注期限 {orderByAlerts.length}件
            </span>
          </div>
          <Link className="home-operations-next" href={homeNextAction.href}>
            次: {homeNextAction.label}
          </Link>
        </div>
        <div className="home-operations-grid">
          {todayFlowCards.map(({ label, count, detail, href, tone, Icon }) => (
            <Link key={label} className={`home-operations-card ${tone}`} href={href}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-operations-panel" aria-label="月次計画ループ">
        <div className="home-section-heading">
          <CalendarDays size={18} aria-hidden="true" />
          <h2>月次計画ループ</h2>
        </div>
        <div className="home-operations-command info">
          <div className="home-operations-status">
            <span className={`badge ${monthlyProgress.completedCount === monthlyProgress.totalCount ? "success" : "info"}`}>
              {monthlyProgress.yearMonth}
            </span>
            <strong>計画進捗 {monthlyProgress.completedCount} / {monthlyProgress.totalCount}</strong>
            <span className="subtext">
              候補 {monthlyProgress.metrics.candidateCount}件 / 仮確定 {monthlyProgress.metrics.tentativePlanCount}件 / 再計画待ち {monthlyProgress.metrics.pendingReplanJobCount}件
            </span>
          </div>
          <Link className="home-operations-next" href={monthlyProgress.monthlyNextAction.href}>
            次: {monthlyProgress.monthlyNextAction.label}
          </Link>
        </div>
        <div className="home-operations-grid">
          {monthlyProgress.steps.map((step) => (
            <Link
              key={step.key}
              className={`home-operations-card ${step.completed ? "success" : "warn"}`}
              href={step.href}
            >
              <span>{step.label}</span>
              <strong>{step.completed ? "済" : "未"}</strong>
              <small>{step.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section id="home-menu" className="home-menu-section anchor-offset">
        <div className="home-section-heading">
          <ClipboardList size={18} aria-hidden="true" />
          <h2>業務メニュー</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MenuCard
            title="生産予定"
            buttonText="生産予定へ"
            href={kitagoyaPath("/production-plans")}
            helpText="日別の生産予定を検索・登録します"
          />
          <MenuCard
            title="月次計画ハブ"
            buttonText="月次計画へ"
            href={kitagoyaPath(`/planning/monthly?ym=${targetMonth}`)}
            helpText="シフト、需要、候補、発注、日報、在庫を一筆書きで確認します"
          />
          <MenuCard
            title="製品計画"
            buttonText="製品計画へ"
            href={kitagoyaPath("/product-planning")}
            helpText="製品在庫と需要から生産候補を確認します"
          />
          <MenuCard
            title="当日割り当て"
            buttonText="当日割り当てへ"
            href={kitagoyaPath("/production-plans/allocate")}
            helpText="出勤シフトから部屋・人員を割り当てます"
          />
          <MenuCard
            title="日報"
            buttonText="日報へ"
            href={kitagoyaPath("/production-daily-reports")}
            helpText="現場の実績を入力・確定し在庫へ反映します"
          />
          <MenuCard
            title="商品マスター"
            buttonText="商品マスターへ"
            href={kitagoyaPath("/masters/products")}
            helpText="商品・ケース入数・BOM・生産能力を管理します"
          />
          <MenuCard
            title="在庫確認"
            buttonText="在庫確認へ"
            href={kitagoyaPath("/inventory")}
            helpText="原料・資材・製品の在庫見込みを確認します"
          />
          <MenuCard
            title="発注候補"
            buttonText="発注候補へ"
            href={kitagoyaPath("/purchases")}
            helpText="不足見込みから発注候補を作成します"
          />
          <MenuCard
            title="請求出力"
            buttonText="請求出力へ"
            href={kitagoyaPath("/invoices")}
            helpText="生産実績から売上・請求CSVを出力します"
          />
        </div>
      </section>

      {shortageCount > 0 ? (
        <div className="alert warn">
          現在 {shortageCount} 件の不足アラートがあります。{" "}
          <Link href={kitagoyaPath("/production-plans")}>生産予定</Link> から内容を確認してください。
        </div>
      ) : (
        <div className="alert success">現時点で不足アラートはありません。</div>
      )}

      <h2>発注期限アラート</h2>
      {orderByAlerts.length === 0 ? (
        <div className="alert success">発注期限が迫っている品目はありません。</div>
      ) : (
        <>
          <div className="alert danger">
            発注期限が迫っている(または超過した)品目が {orderByAlerts.length} 件あります。{" "}
            <Link href={kitagoyaPath("/purchases")}>発注候補</Link> から発注してください。
          </div>
          <div className="table-frame">
            <table>
              <thead>
                <tr>
                  <th>区分</th>
                  <th>品目</th>
                  <th>発注数量</th>
                  <th>発注期限</th>
                </tr>
              </thead>
              <tbody>
                {orderByAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{alert.itemType === "raw_material" ? "原料" : "資材"}</td>
                    <td>{alert.itemName}</td>
                    <td className="right">
                      {formatCases(alert.orderedQuantity, {
                        casePackQty: alert.casePackQty,
                        baseUnit: alert.unit,
                      })}
                    </td>
                    <td>
                      {alert.recommendedOrderDate || "—"}{" "}
                      <span className="badge danger">緊急</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>直近の生産予定</h2>
      {upcoming.length === 0 ? (
        <div className="empty-state">
          まだ生産予定が登録されていません。<Link href={kitagoyaPath("/production-plans/new")}>新規登録</Link>
          から開始してください。
        </div>
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>商品</th>
                <th>作業場所</th>
                <th>数量</th>
                <th>開始</th>
                <th>終了</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((p) => (
                <tr key={p.id}>
                  <td>{p.date.toISOString().slice(0, 10)}</td>
                  <td>{p.product.officialName}</td>
                  <td>{p.workArea.name}</td>
                  <td className="right">
                    {formatCases(p.plannedQuantity, { casePackQty: p.product.casePackQty, baseUnit: p.unit })}
                  </td>
                  <td>{p.plannedStartTime}</td>
                  <td>
                    {p.plannedEndTime ?? "—"}
                    {p.overtimeMinutes > 0 && <span className="badge warn"> 残{p.overtimeMinutes}分</span>}
                  </td>
                  <td>
                    <span className={`badge ${planStatusClass(p.status)}`}>
                      {planStatusLabel(p.status)}
                    </span>
                  </td>
                  <td>
                    <Link href={kitagoyaPath(`/production-plans/${p.id}`)}>開く</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
