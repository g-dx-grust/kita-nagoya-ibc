import Link from "next/link";
import { AlertTriangle, CalendarDays, ListChecks, PackageCheck, Table2 } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import SectionTabs from "@/components/ui/section-tabs";
import { aggregateMonthlySuggestions } from "@/lib/monthly-production-schedule";
import {
  loadMonthlyProductionSchedulePreview,
  type MonthlyProductionPlanningBasis,
} from "@/lib/product-planning-service";
import { prisma } from "@/lib/prisma";
import MonthlyScheduleActions from "./monthly-schedule-actions";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import type { MonthlyVarianceRow } from "@/lib/monthly-reconciliation";

export const dynamic = "force-dynamic";

type MonthlyViewId = "forecast" | "schedule" | "suggestions" | "calendar" | "product-inventory";

export default async function MonthlyProductionPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = sp.dateFrom ?? today;
  const dateTo = sp.dateTo ?? endOfMonth(dateFrom);
  const productionLeadDays = parseProductionLeadDays(sp.productionLeadDays);
  const planningBasis = parsePlanningBasis(sp.planningBasis);
  const activeView = parseMonthlyView(sp.view);

  const [preview, existingPlans, demands, productCaseRows] = await Promise.all([
    loadMonthlyProductionSchedulePreview({
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      productionLeadDays,
      planningBasis,
    }),
    prisma.productionPlan.findMany({
      where: {
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        status: { not: "cancelled" },
      },
      include: { product: true, workArea: true },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
    }),
    prisma.productDemand.findMany({
      where: {
        dueDate: { lte: new Date(dateTo) },
        status: "open",
        product: { active: true },
      },
      include: { product: true },
      orderBy: [{ dueDate: "asc" }, { product: { productCode: "asc" } }],
    }),
    prisma.product.findMany({ where: { active: true }, select: { id: true, casePackQty: true } }),
  ]);
  // 商品IDからケース入数を引く（予測表・在庫表で基本単位とケース数を併記する / 要望A）
  const caseByProductId = new Map<string, number | null>(
    productCaseRows.map((p) => [p.id, p.casePackQty]),
  );
  const caseOf = (productId: string) => caseByProductId.get(productId) ?? null;

  const groupedSuggestions = aggregateMonthlySuggestions(preview.suggestions);
  const days = eachDay(dateFrom, dateTo);
  const sheetDemands = demands.map((demand) => ({
    productId: demand.productId,
    date: clampDate(demand.dueDate.toISOString().slice(0, 10), dateFrom, dateTo),
    quantity: demand.quantity,
  }));
  if (planningBasis === "historical_actual") {
    for (const forecast of preview.historicalForecasts) {
      if (forecast.status !== "forecasted" || forecast.forecastQuantity <= 0) continue;
      sheetDemands.push({
        productId: forecast.productId,
        date: dateFrom,
        quantity: forecast.forecastQuantity,
      });
    }
  }
  const productionSheetRows = buildProductionSheetRows({
    days,
    dateFrom,
    dateTo,
    caseByProductId,
    summaries: preview.productSummaries,
    demands: sheetDemands,
    existingPlans: existingPlans
      .filter((plan) => plan.status === "draft" || plan.status === "confirmed")
      .map((plan) => ({
        productId: plan.productId,
        date: plan.date.toISOString().slice(0, 10),
        quantity: plan.plannedQuantity,
      })),
    suggestions: groupedSuggestions.map((suggestion) => ({
      productId: suggestion.productId,
      date: suggestion.scheduleDate,
      quantity: suggestion.suggestedQuantity,
    })),
  });
  const plansByDate = groupByDate(
    existingPlans.map((plan) => ({
      date: plan.date.toISOString().slice(0, 10),
      label: `${plan.plannedStartTime}-${plan.plannedEndTime ?? "未計算"} ${plan.product.officialName} ${formatCases(
        plan.plannedQuantity,
        { casePackQty: plan.product.casePackQty, baseUnit: plan.unit },
      )}`,
      href: kitagoyaPath(`/production-plans/${plan.id}`),
      status: plan.status,
    })),
  );
  const suggestionsByDate = groupByDate(
    groupedSuggestions.map((suggestion) => ({
      date: suggestion.scheduleDate,
      label: `${suggestion.productName} ${formatCases(suggestion.suggestedQuantity, {
        casePackQty: caseOf(suggestion.productId),
        baseUnit: suggestion.unit,
      })}`,
      href: "",
      status: "draft",
    })),
  );
  const suggestedTotal = groupedSuggestions.reduce((sum, row) => sum + row.suggestedQuantity, 0);
  const affectedProducts = new Set(groupedSuggestions.map((row) => row.productId)).size;
  const insufficientForecastCount = preview.historicalForecasts.filter((forecast) => forecast.status === "insufficient_data").length;
  const underTargetCount = preview.reconciliation.filter((row) => row.status === "under").length;
  const overTargetCount = preview.reconciliation.filter((row) => row.status === "over").length;
  const negativeProjectedCount = preview.productSummaries.filter((summary) => summary.minProjectedOnHandQuantity < 0).length;
  const existingDraftCount = existingPlans.filter((plan) => plan.status === "draft").length;
  const monthlyStatusClass =
    groupedSuggestions.length > 0 || underTargetCount > 0 || negativeProjectedCount > 0
      ? "warn"
      : insufficientForecastCount > 0
        ? "info"
        : "success";
  const monthlyStatusLabel =
    groupedSuggestions.length > 0
      ? `生成候補 ${groupedSuggestions.length}件`
      : underTargetCount > 0
        ? `不足 ${underTargetCount}件`
        : insufficientForecastCount > 0
          ? `実績不足 ${insufficientForecastCount}件`
          : "追加生成なし";
  const nextMonthlyAction =
    groupedSuggestions.length > 0
      ? "生成候補を確認"
      : underTargetCount > 0
        ? "予実不足を確認"
        : insufficientForecastCount > 0
          ? "月次実績を確認"
          : "生成設定を確認";
  const monthlyHref = (view: MonthlyViewId) =>
    monthlyViewHref({ dateFrom, dateTo, productionLeadDays, planningBasis, view });

  return (
    <>
      <div className="page-title-row">
        <h1>月間生産スケジュール生成</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/product-planning")}>
            製品計画へ
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans")}>
            生産予定一覧へ
          </Link>
        </div>
      </div>

      <div className={`monthly-overview-command panel ${monthlyStatusClass}`}>
        <div className="monthly-overview-command-title">
          <span className={`badge ${monthlyStatusClass}`}>{monthlyStatusLabel}</span>
          <strong>月間生成の確認</strong>
          <span className="subtext">
            {dateFrom} - {dateTo} / {planningBasisLabel(planningBasis)}
          </span>
          <span className="monthly-overview-next">次: {nextMonthlyAction}</span>
        </div>
        <div className="monthly-overview-checks">
          <span className={`badge ${groupedSuggestions.length > 0 ? "warn" : "success"}`}>
            生成候補 {groupedSuggestions.length}
          </span>
          <span className={`badge ${underTargetCount > 0 ? "danger" : "success"}`}>
            予実不足 {underTargetCount}
          </span>
          <span className={`badge ${negativeProjectedCount > 0 ? "danger" : "success"}`}>
            在庫割れ {negativeProjectedCount}
          </span>
          <span className={`badge ${insufficientForecastCount > 0 ? "warn" : "success"}`}>
            実績不足 {insufficientForecastCount}
          </span>
          <span className="badge muted">既存下書き {existingDraftCount}</span>
        </div>
        <div className="monthly-overview-actions">
          <Link className="button-link" href={monthlyHref("suggestions")}>
            <PackageCheck size={15} aria-hidden="true" />
            生成候補
          </Link>
          <Link className="button-link secondary-link" href={monthlyHref("schedule")}>
            <Table2 size={15} aria-hidden="true" />
            予定表
          </Link>
        </div>
      </div>

      <div className="monthly-review-queue" aria-label="月間予定レビュー順">
        <Link className={`monthly-review-item ${groupedSuggestions.length > 0 ? "warn" : "success"}${activeView === "suggestions" ? " is-active" : ""}`} href={monthlyHref("suggestions")}>
          <span>
            <PackageCheck size={15} aria-hidden="true" />
            生成候補
          </span>
          <strong>{groupedSuggestions.length}</strong>
          <small>{affectedProducts} 商品</small>
        </Link>
        <Link className={`monthly-review-item ${underTargetCount > 0 ? "danger" : "success"}${activeView === "forecast" ? " is-active" : ""}`} href={monthlyHref("forecast")}>
          <span>
            <AlertTriangle size={15} aria-hidden="true" />
            予実不足
          </span>
          <strong>{underTargetCount}</strong>
          <small>超過 {overTargetCount}</small>
        </Link>
        <Link className={`monthly-review-item ${negativeProjectedCount > 0 ? "danger" : "success"}${activeView === "product-inventory" ? " is-active" : ""}`} href={monthlyHref("product-inventory")}>
          <span>
            <ListChecks size={15} aria-hidden="true" />
            在庫見通し
          </span>
          <strong>{negativeProjectedCount}</strong>
          <small>期間中マイナス</small>
        </Link>
        <Link className={`monthly-review-item${activeView === "schedule" ? " is-active" : ""}`} href={monthlyHref("schedule")}>
          <span>
            <Table2 size={15} aria-hidden="true" />
            予定表
          </span>
          <strong>{productionSheetRows.length}</strong>
          <small>商品行</small>
        </Link>
        <Link className={`monthly-review-item${activeView === "calendar" ? " is-active" : ""}`} href={monthlyHref("calendar")}>
          <span>
            <CalendarDays size={15} aria-hidden="true" />
            カレンダー
          </span>
          <strong>{days.length}</strong>
          <small>日別確認</small>
        </Link>
      </div>

      <CollapsiblePanel
        title="表示・再計算条件"
        summary={`${dateFrom} 〜 ${dateTo} / ${planningBasisLabel(planningBasis)} / ${productionLeadDays}日前`}
      >
        <form className="toolbar compact-controls" method="GET">
          <label>
            <span>計画開始日</span>
            <input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label>
            <span>計画終了日</span>
            <input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <label>
            <span>何日前に作る</span>
            <input name="productionLeadDays" type="number" min={0} max={14} step={1} defaultValue={productionLeadDays} />
          </label>
          <label>
            <span>計画基準</span>
            <select name="planningBasis" defaultValue={planningBasis}>
              <option value="historical_actual">前々月前年比予測</option>
              <option value="inventory_shortage">在庫不足判定</option>
            </select>
          </label>
          <button type="submit" className="secondary">
            月間判定を再計算
          </button>
        </form>
      </CollapsiblePanel>

      <div className="panel">
        <div className="stat-grid">
          <Metric label="生成候補" value={`${groupedSuggestions.length} 件`} />
          <Metric label="対象商品" value={`${affectedProducts} 商品`} />
          <Metric label="候補数量合計" value={formatNumber(suggestedTotal)} />
          <Metric label="既存予定" value={`${existingPlans.length} 件`} />
          <Metric label="計画基準" value={planningBasisLabel(planningBasis)} />
        </div>
      </div>

      <MonthlyScheduleActions
        dateFrom={dateFrom}
        dateTo={dateTo}
        productionLeadDays={productionLeadDays}
        planningBasis={planningBasis}
        disabled={groupedSuggestions.length === 0}
      />

      <SectionTabs
        ariaLabel="月間予定の表示切り替え"
        inlineHeader
        initialTabId={activeView}
        items={[
          {
            id: "forecast",
            label: planningBasis === "historical_actual" ? "予測・予実" : "予実・過不足",
            heading: planningBasis === "historical_actual" ? "予測・予実" : "予実・過不足",
            count:
              planningBasis === "historical_actual"
                ? preview.historicalForecasts.length
                : preview.reconciliation.length,
            content: (
              <>
                {planningBasis === "historical_actual" && (
                  <>
                    <h2>
                      前々月前年比 予測
                      <HelpTooltip text="数量は基本単位とケース数を併記します。小数の数量は表示時に切り上げます。" />
                    </h2>
                    <HistoricalForecastTable preview={preview} caseOf={caseOf} />
                  </>
                )}

                <h2>
                  当月 予実・過不足
                  <HelpTooltip text="月次予測に対する確定実績の累計と残目標です。実績累計は確定日報のみを集計し、予定値とは分けています。追加判断はシフト連動の仮予定生成で行います。" />
                </h2>
                <MonthlyReconciliationTable rows={preview.reconciliation} caseOf={caseOf} />
              </>
            ),
          },
          {
            id: "schedule",
            label: "月間生産予定表",
            heading: "月間生産予定表",
            count: productionSheetRows.length,
            content: (
              <>
                <ProductionExcelSheet days={days} rows={productionSheetRows} />
              </>
            ),
          },
          {
            id: "suggestions",
            label: "生成候補",
            heading: "生成候補",
            count: groupedSuggestions.length,
            content: (
              <>
                {groupedSuggestions.length === 0 ? (
                  <div className="empty-state">
                    {planningBasis === "historical_actual"
                      ? "前々月前年比予測と既存予定を見た結果、追加の生産予定は不要です。"
                      : "現在庫、未処理需要、既存予定を見た結果、追加の生産予定は不要です。"}
                  </div>
                ) : (
                  <div className="table-frame monthly-suggestion-frame">
                    <table className="monthly-suggestion-table">
                      <thead>
                        <tr>
                          <th>予定日</th>
                          <th>商品</th>
                          <th>数量</th>
                          <th>{planningBasis === "historical_actual" ? "予測基準日" : "不足判定日"}</th>
                          <th>判定理由</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedSuggestions.map((suggestion) => (
                          <tr key={`${suggestion.scheduleDate}:${suggestion.productId}`} className="monthly-suggestion-row">
                            <td data-label="予定日">{suggestion.scheduleDate}</td>
                            <td data-label="商品">
                              <div className="monthly-suggestion-product">
                                <strong>{suggestion.productCode} · {suggestion.productName}</strong>
                                <span className="badge info">{planningBasisLabel(planningBasis)}</span>
                              </div>
                            </td>
                            <td className="right" data-label="数量">
                              <strong>
                                {formatCases(suggestion.suggestedQuantity, {
                                  casePackQty: caseOf(suggestion.productId),
                                  baseUnit: suggestion.unit,
                                })}
                              </strong>
                            </td>
                            <td data-label={planningBasis === "historical_actual" ? "予測基準日" : "不足判定日"}>{suggestion.dueDates.sort().join(", ")}</td>
                            <td className="wrap-cell" data-label="判定理由">{suggestion.reasons[0]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "calendar",
            label: "月間カレンダー",
            heading: "月間カレンダー",
            count: days.length,
            content: (
              <>
                <div className="table-frame">
                  <table>
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>既存の生産予定</th>
                        <th>今回の生成候補</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((date) => (
                        <tr key={date}>
                          <td>{date}</td>
                          <td>
                            <ScheduleList rows={plansByDate.get(date) ?? []} />
                          </td>
                          <td>
                            <ScheduleList rows={suggestionsByDate.get(date) ?? []} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ),
          },
          {
            id: "product-inventory",
            label: "製品別の在庫見通し",
            heading: "製品別の在庫見通し",
            count: preview.productSummaries.length,
            content: (
              <>
                <div className="table-frame">
                  <table>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>基準日在庫</th>
                        <th>{planningBasis === "historical_actual" ? "月次予測" : "未処理需要"}</th>
                        <th>既存予定</th>
                        <th>生成候補</th>
                        <th>期間末見込</th>
                        <th>期間中最低</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.productSummaries.map((summary) => {
                        const cp = caseOf(summary.productId);
                        const fmt = (v: number) => formatCases(v, { casePackQty: cp, baseUnit: summary.unit });
                        return (
                          <tr key={summary.productId}>
                            <td>
                              {summary.productCode} · {summary.productName}
                            </td>
                            <td className="right">{fmt(summary.startingOnHandQuantity)}</td>
                            <td className="right">{fmt(summary.openDemandQuantity)}</td>
                            <td className="right">{fmt(summary.existingProductionQuantity)}</td>
                            <td className="right">{fmt(summary.suggestedQuantity)}</td>
                            <td className="right">{fmt(summary.endingProjectedOnHandQuantity)}</td>
                            <td className="right">
                              <span className={summary.minProjectedOnHandQuantity < 0 ? "badge danger" : "badge muted"}>
                                {fmt(summary.minProjectedOnHandQuantity)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

type ProductionSheetRow = {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  casePackQty: number | null;
  startingOnHandQuantity: number;
  totalDemandQuantity: number;
  totalExistingQuantity: number;
  totalSuggestionQuantity: number;
  monthEndProjectedQuantity: number;
  minProjectedQuantity: number;
  days: {
    date: string;
    demandQuantity: number;
    existingQuantity: number;
    suggestionQuantity: number;
    projectedQuantity: number;
  }[];
};

function HistoricalForecastTable({
  preview,
  caseOf,
}: {
  preview: Awaited<ReturnType<typeof loadMonthlyProductionSchedulePreview>>;
  caseOf: (productId: string) => number | null;
}) {
  const reference = preview.forecastReferenceMonths;
  const insufficient = preview.historicalForecasts.filter((forecast) => forecast.status === "insufficient_data").length;

  return (
    <div className="table-frame">
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th>前年対象月 {reference.previousYearTargetMonth}</th>
            <th>今年前々月 {reference.currentTwoMonthsAgo}</th>
            <th>前年前々月 {reference.previousYearTwoMonthsAgo}</th>
            <th>前々月前年比</th>
            <th>前月前年比(参考)</th>
            <th>丸め前</th>
            <th>予測生産数</th>
            <th>状態</th>
            <th>理由</th>
          </tr>
        </thead>
        <tbody>
          {preview.historicalForecasts.map((forecast) => {
            const cp = caseOf(forecast.productId);
            const fmtN = (v: number | null) =>
              v == null ? "—" : formatCases(v, { casePackQty: cp, baseUnit: forecast.unit });
            return (
            <tr key={forecast.productId}>
              <td>
                {forecast.productCode} · {forecast.productName}
              </td>
              <td className="right">{fmtN(forecast.previousYearTargetQuantity)}</td>
              <td className="right">{fmtN(forecast.currentTwoMonthsAgoQuantity)}</td>
              <td className="right">{fmtN(forecast.previousYearTwoMonthsAgoQuantity)}</td>
              <td className="right">{formatNullablePercent(forecast.twoMonthsAgoYoYRate)}</td>
              <td className="right">{formatNullablePercent(forecast.previousMonthYoYRate)}</td>
              <td className="right">{forecast.status === "forecasted" ? fmtN(forecast.rawForecastQuantity) : "-"}</td>
              <td className="right">
                <strong>{fmtN(forecast.forecastQuantity)}</strong>
              </td>
              <td>
                <span className={`badge ${forecast.status === "forecasted" ? "success" : "danger"}`}>
                  {forecast.status === "forecasted" ? "予測可" : "実績不足"}
                </span>
              </td>
              <td className="wrap-cell">{forecast.reason}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {insufficient > 0 && (
        <div className="alert warn">
          月次実績が足りない商品が {insufficient} 件あります。前年対象月、今年前々月、前年前々月の実績を登録すると予測できます。
        </div>
      )}
    </div>
  );
}

function MonthlyReconciliationTable({
  rows,
  caseOf,
}: {
  rows: MonthlyVarianceRow[];
  caseOf: (productId: string) => number | null;
}) {
  if (rows.length === 0) {
    return <div className="empty-state">月次予測がある商品はまだありません。月次実績を登録すると予測・過不足が表示されます。</div>;
  }
  return (
    <div className="table-frame">
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th>目標(予測)</th>
            <th>実績累計</th>
            <th>未完了予定</th>
            <th>残目標</th>
            <th>過不足</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cp = caseOf(row.productId);
            const fmt = (v: number) => formatCases(v, { casePackQty: cp, baseUnit: row.unit });
            return (
              <tr key={row.productId}>
                <td>
                  {row.productCode} · {row.productName}
                </td>
                <td className="right">{fmt(row.monthlyTarget)}</td>
                <td className="right">{fmt(row.cumulativeActual)}</td>
                <td className="right">{fmt(row.openPlanned)}</td>
                <td className="right">
                  <strong>{fmt(row.remainingTarget)}</strong>
                </td>
                <td className="right">
                  {row.variance > 0 ? "+" : ""}
                  {fmt(row.variance)}
                </td>
                <td>
                  <span className={`badge ${reconciliationBadgeClass(row.status)}`}>
                    {reconciliationStatusLabel(row.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function reconciliationBadgeClass(status: MonthlyVarianceRow["status"]) {
  switch (status) {
    case "over":
      return "warn";
    case "under":
      return "danger";
    case "on_track":
      return "success";
  }
}

function reconciliationStatusLabel(status: MonthlyVarianceRow["status"]) {
  switch (status) {
    case "over":
      return "超過";
    case "under":
      return "不足";
    case "on_track":
      return "適正";
  }
}

function ProductionExcelSheet({ days, rows }: { days: string[]; rows: ProductionSheetRow[] }) {
  if (rows.length === 0) {
    return <div className="empty-state">対象期間に予測/受注、既存予定、生成候補がある商品はありません。</div>;
  }

  return (
    <div className="excel-production-scroll">
      <table className="excel-production-table">
        <colgroup>
          <col className="excel-col-no" />
          <col className="excel-col-product" />
          <col className="excel-col-label" />
          <col className="excel-col-carry" />
          {days.map((date) => (
            <col key={date} className="excel-col-day" />
          ))}
          <col className="excel-col-summary" />
          <col className="excel-col-summary" />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky-prod sticky-prod-no">No.</th>
            <th className="sticky-prod sticky-prod-product">商品</th>
            <th className="sticky-prod sticky-prod-label">区分</th>
            <th>基準日在庫</th>
            {days.map((date) => (
              <th key={date}>{formatDateHeader(date)}</th>
            ))}
            <th>期間末見込</th>
            <th>合計/最低</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <ProductionExcelItemRows key={row.productId} row={row} rowNo={index + 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionExcelItemRows({ row, rowNo }: { row: ProductionSheetRow; rowNo: number }) {
  const labels = ["予測/受注", "既存予定", "生成候補", "見込残"] as const;
  const fmt = (value: number, blankZero = false) => {
    if (blankZero && value === 0) return "";
    return formatCases(value, { casePackQty: row.casePackQty, baseUnit: row.unit });
  };
  return (
    <>
      {labels.map((label, index) => (
        <tr key={`${row.productId}:${label}`} className={`production-row-${productionLabelClass(label)}`}>
          {index === 0 && (
            <>
              <td className="sticky-prod sticky-prod-no excel-rowspan-cell right" rowSpan={labels.length}>
                {rowNo}
              </td>
              <td className="sticky-prod sticky-prod-product excel-rowspan-cell" rowSpan={labels.length}>
                <div className="excel-item-name">{row.productName}</div>
                <div className="subtext">{row.productCode}</div>
              </td>
            </>
          )}
          <th className="sticky-prod sticky-prod-label excel-line-label" scope="row">
            {label}
          </th>
          <td className="right">{label === "見込残" ? fmt(row.startingOnHandQuantity) : ""}</td>
          {row.days.map((day) => (
            <td key={`${row.productId}:${label}:${day.date}`} className={productionCellClass(label, day.projectedQuantity)}>
              {productionValueForLabel(label, day, fmt)}
            </td>
          ))}
          <td className={productionCellClass(label, row.monthEndProjectedQuantity)}>
            {label === "見込残" ? fmt(row.monthEndProjectedQuantity) : ""}
          </td>
          <td className={productionCellClass(label, row.minProjectedQuantity)}>
            {label === "予測/受注"
              ? fmt(row.totalDemandQuantity)
              : label === "既存予定"
                ? fmt(row.totalExistingQuantity)
                : label === "生成候補"
                  ? fmt(row.totalSuggestionQuantity)
                  : fmt(row.minProjectedQuantity)}
          </td>
        </tr>
      ))}
    </>
  );
}

function buildProductionSheetRows(input: {
  days: string[];
  dateFrom: string;
  dateTo: string;
  caseByProductId: Map<string, number | null>;
  summaries: {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    startingOnHandQuantity: number;
  }[];
  demands: { productId: string; date: string; quantity: number }[];
  existingPlans: { productId: string; date: string; quantity: number }[];
  suggestions: { productId: string; date: string; quantity: number }[];
}): ProductionSheetRow[] {
  const summaries = new Map(input.summaries.map((summary) => [summary.productId, summary]));
  const productIds = new Set<string>();
  for (const row of input.demands) productIds.add(row.productId);
  for (const row of input.existingPlans) productIds.add(row.productId);
  for (const row of input.suggestions) productIds.add(row.productId);

  return [...productIds]
    .map((productId) => {
      const summary = summaries.get(productId);
      if (!summary) return null;
      let projected = summary.startingOnHandQuantity;
      let totalDemandQuantity = 0;
      let totalExistingQuantity = 0;
      let totalSuggestionQuantity = 0;
      let minProjectedQuantity = projected;
      const days = input.days.map((date) => {
        const demandQuantity = sumOnDate(input.demands, productId, date);
        const existingQuantity = sumOnDate(input.existingPlans, productId, date);
        const suggestionQuantity = sumOnDate(input.suggestions, productId, date);
        totalDemandQuantity += demandQuantity;
        totalExistingQuantity += existingQuantity;
        totalSuggestionQuantity += suggestionQuantity;
        projected = round4(projected + existingQuantity + suggestionQuantity - demandQuantity);
        minProjectedQuantity = Math.min(minProjectedQuantity, projected);
        return {
          date,
          demandQuantity,
          existingQuantity,
          suggestionQuantity,
          projectedQuantity: projected,
        };
      });
      return {
        productId,
        productCode: summary.productCode,
        productName: summary.productName,
        unit: summary.unit,
        casePackQty: input.caseByProductId.get(productId) ?? null,
        startingOnHandQuantity: summary.startingOnHandQuantity,
        totalDemandQuantity: round4(totalDemandQuantity),
        totalExistingQuantity: round4(totalExistingQuantity),
        totalSuggestionQuantity: round4(totalSuggestionQuantity),
        monthEndProjectedQuantity: round4(projected),
        minProjectedQuantity: round4(minProjectedQuantity),
        days,
      };
    })
    .filter((row): row is ProductionSheetRow => row != null)
    .sort((a, b) => a.productCode.localeCompare(b.productCode, "ja"));
}

function sumOnDate(rows: { productId: string; date: string; quantity: number }[], productId: string, date: string) {
  return round4(
    rows
      .filter((row) => row.productId === productId && row.date === date)
      .reduce((sum, row) => sum + row.quantity, 0),
  );
}

function productionValueForLabel(
  label: "予測/受注" | "既存予定" | "生成候補" | "見込残",
  day: ProductionSheetRow["days"][number],
  fmt: (value: number, blankZero?: boolean) => string,
) {
  if (label === "予測/受注") return fmt(day.demandQuantity, true);
  if (label === "既存予定") return fmt(day.existingQuantity, true);
  if (label === "生成候補") return fmt(day.suggestionQuantity, true);
  return fmt(day.projectedQuantity);
}

function productionCellClass(label: "予測/受注" | "既存予定" | "生成候補" | "見込残", value: number) {
  const classes = ["right"];
  if (label === "見込残" && value < 0) classes.push("negative-stock");
  return classes.join(" ");
}

function productionLabelClass(label: "予測/受注" | "既存予定" | "生成候補" | "見込残") {
  switch (label) {
    case "予測/受注":
      return "demand";
    case "既存予定":
      return "existing";
    case "生成候補":
      return "suggestion";
    case "見込残":
      return "projected";
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function ScheduleList({
  rows,
}: {
  rows: { label: string; href: string; status: string }[];
}) {
  if (rows.length === 0) return <span className="muted">—</span>;
  return (
    <div className="stacked-list">
      {rows.map((row, index) => (
        <div key={`${row.label}:${index}`} className="stacked-list-item">
          <span className={`badge ${planStatusClass(row.status)}`}>{planStatusLabel(row.status)}</span>
          {row.href ? <Link href={row.href}>{row.label}</Link> : <span>{row.label}</span>}
        </div>
      ))}
    </div>
  );
}

function groupByDate<T extends { date: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.date) ?? [];
    list.push(row);
    map.set(row.date, list);
  }
  return map;
}

function eachDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function parseProductionLeadDays(value: string | undefined) {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(14, Math.max(0, Math.floor(n)));
}

function parsePlanningBasis(value: string | undefined): MonthlyProductionPlanningBasis {
  return value === "inventory_shortage" ? "inventory_shortage" : "historical_actual";
}

function parseMonthlyView(value: string | undefined): MonthlyViewId {
  if (
    value === "schedule" ||
    value === "suggestions" ||
    value === "calendar" ||
    value === "product-inventory"
  ) {
    return value;
  }
  return "forecast";
}

function monthlyViewHref({
  dateFrom,
  dateTo,
  productionLeadDays,
  planningBasis,
  view,
}: {
  dateFrom: string;
  dateTo: string;
  productionLeadDays: number;
  planningBasis: MonthlyProductionPlanningBasis;
  view: MonthlyViewId;
}) {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    productionLeadDays: String(productionLeadDays),
    planningBasis,
    view,
  });
  return kitagoyaPath(`/production-plans/monthly?${params.toString()}`);
}

function planningBasisLabel(value: MonthlyProductionPlanningBasis) {
  return value === "historical_actual" ? "前々月前年比" : "在庫不足";
}

function formatDateHeader(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function clampDate(date: string, min: string, max: string) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function formatNumber(value: number, blankZero = false) {
  if (blankZero && value === 0) return "";
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatNullablePercent(value: number | null) {
  return value == null ? "—" : `${formatNumber(value * 100)}%`;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
