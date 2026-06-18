import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, ClipboardCheck, FileText, PackageCheck, Printer, Users } from "lucide-react";
import SectionTabs from "@/components/ui/section-tabs";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { formatCases } from "@/lib/units";
import PlanForm from "../plan-form";
import AssignmentEditor from "./assignment-editor";
import PlanActions from "./plan-actions";
import DailyReportForm from "./daily-report-form";

export const dynamic = "force-dynamic";

export default async function ProductionPlanDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await prisma.productionPlan.findUnique({
    where: { id },
    include: {
      product: true,
      workArea: true,
      requirements: true,
      assignments: { include: { employee: true }, orderBy: [{ startTime: "asc" }] },
    },
  });
  if (!plan) notFound();

  const [products, workAreas, employees, dailyReport] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ active: true }, { id: plan.productId }] },
      include: { capacities: true },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.dailyReport.findUnique({ where: { productionPlanId: id }, include: { consumptions: true } }),
  ]);

  const productOptions = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    officialName: p.officialName,
    specification: p.specification,
    brandName: p.brandName,
    unit: p.unit,
    casePackQty: p.casePackQty,
    defaultWorkAreaId: p.defaultWorkAreaId,
    capacities: p.capacities.map((c) => ({
      workAreaId: c.workAreaId,
      unitsPerPersonHour: c.unitsPerPersonHour,
      standardPeople: c.standardPeople,
      standardBreakMinutes: c.standardBreakMinutes,
    })),
  }));
  const workAreaOptions = workAreas.map((workArea) => ({
    id: workArea.id,
    name: workArea.name,
  }));

  const shortageHard = plan.requirements.filter((r) => r.shortageType === "hard_shortage");
  const shortageDep = plan.requirements.filter(
    (r) => r.shortageType === "unconfirmed_dependency",
  );
  const planDate = plan.date.toISOString().slice(0, 10);
  const requirementAlertCount = shortageHard.length + shortageDep.length;
  const needsRequirementReview = requirementAlertCount > 0 || plan.requirements.length === 0;
  const requirementsBadgeClass =
    shortageHard.length > 0 || plan.requirements.length === 0 ? "danger" : shortageDep.length > 0 ? "warn" : "success";
  const requirementsLabel =
    shortageHard.length > 0
      ? `不足 ${shortageHard.length}件`
      : shortageDep.length > 0
        ? `未確定依存 ${shortageDep.length}件`
        : plan.requirements.length > 0
          ? "使用量OK"
          : "BOM未登録";
  const dailyReportLabel =
    dailyReport?.status === "confirmed" ? "日報確定" : dailyReport ? "日報下書き" : "日報未入力";
  const dailyReportBadgeClass = dailyReport?.status === "confirmed" ? "success" : dailyReport ? "warn" : "muted";
  const plannedTime = `${plan.plannedStartTime} - ${plan.plannedEndTime ?? plan.desiredEndTime ?? plan.baselineEndTime}`;
  const assignmentShortage = Math.max(0, plan.plannedPeopleCount - plan.assignments.length);
  const needsAssignmentReview = assignmentShortage > 0;
  const planReviewItems = [
    ...(plan.status === "draft"
      ? [{ label: "予定確定", detail: "ステータスが下書きです", tone: "warn" as const, tabId: "detail" }]
      : []),
    ...(needsRequirementReview
      ? [
          {
            label: "原料・資材",
            detail:
              shortageHard.length > 0
                ? `実不足 ${shortageHard.length}件`
                : shortageDep.length > 0
                  ? `未確定依存 ${shortageDep.length}件`
                  : "BOM未登録",
            tone: shortageHard.length > 0 || plan.requirements.length === 0 ? ("danger" as const) : ("warn" as const),
            tabId: "requirements",
          },
        ]
      : []),
    ...(needsAssignmentReview
      ? [{ label: "スタッフ配置", detail: `${assignmentShortage}人不足`, tone: "warn" as const, tabId: "assignments" }]
      : []),
    ...(!dailyReport
      ? [{ label: "日報", detail: "実績未入力", tone: "muted" as const, tabId: "daily-report" }]
      : dailyReport.status !== "confirmed"
        ? [{ label: "日報", detail: "下書き確認", tone: "warn" as const, tabId: "daily-report" }]
        : []),
  ];
  const nextActionLabel =
    planReviewItems[0]?.label ?? (dailyReport?.status === "confirmed" ? "完了内容確認" : "日報入力");
  const nextActionHref = tabHref(planReviewItems[0]?.tabId ?? "daily-report");

  return (
    <>
      <div className="page-title-row production-plan-detail-title">
        <div>
          <h1>
            生産予定 ・ {planDate} · {plan.product.officialName}
          </h1>
          <div className="production-plan-detail-title-meta">
            <span className={`badge ${planStatusClass(plan.status)}`}>{planStatusLabel(plan.status)}</span>
            <span>{plan.workArea.name}</span>
            <span>{plannedTime}</span>
          </div>
        </div>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans")}>
            一覧へ
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/prints?date=${planDate}`)}>
            <Printer size={16} aria-hidden="true" />
            現場印刷
          </Link>
        </div>
      </div>

      <div className="production-plan-detail-overview">
        <a className="production-plan-detail-card primary" href={tabHref("detail")}>
          <span>
            <CalendarDays size={16} aria-hidden="true" />
            予定
          </span>
          <strong>{formatCases(plan.plannedQuantity, { casePackQty: plan.product.casePackQty, baseUnit: plan.unit })}</strong>
          <small>{plannedTime}</small>
        </a>
        <a className="production-plan-detail-card" href={tabHref("assignments")}>
          <span>
            <Users size={16} aria-hidden="true" />
            スタッフ配置
          </span>
          <strong>
            {plan.assignments.length} / {plan.plannedPeopleCount}人
          </strong>
          <small>{plan.assignments.length > 0 ? "配置あり" : "未配置"}</small>
        </a>
        <a className={`production-plan-detail-card ${requirementsBadgeClass}`} href={tabHref("requirements")}>
          <span>
            {requirementAlertCount > 0 ? (
              <AlertTriangle size={16} aria-hidden="true" />
            ) : (
              <PackageCheck size={16} aria-hidden="true" />
            )}
            原料・資材
          </span>
          <strong>{requirementsLabel}</strong>
          <small>{plan.requirements.length}行</small>
        </a>
        <a className={`production-plan-detail-card ${dailyReportBadgeClass}`} href={tabHref("daily-report")}>
          <span>
            {dailyReport?.status === "confirmed" ? (
              <ClipboardCheck size={16} aria-hidden="true" />
            ) : (
              <FileText size={16} aria-hidden="true" />
            )}
            日報
          </span>
          <strong>{dailyReportLabel}</strong>
          <small>{dailyReport ? "実績データあり" : "実績未登録"}</small>
        </a>
      </div>

      <div className="panel production-plan-detail-command">
        <div className="production-plan-detail-command-text">
          <strong>{planReviewItems.length > 0 ? "確認が必要です" : "次の処理へ進めます"}</strong>
          <span>
            {needsRequirementReview
              ? "原料・資材タブで不足またはBOM登録状況を確認してください。"
              : needsAssignmentReview
                ? "スタッフ配置タブで担当者を登録してください。"
                : "登録内容、配置、日報をこの画面で続けて確認できます。"}
          </span>
        </div>
        <div className="production-plan-detail-command-checks">
          <span className={`badge ${plan.status === "draft" ? "warn" : planStatusClass(plan.status)}`}>
            予定 {planStatusLabel(plan.status)}
          </span>
          <span className={`badge ${needsAssignmentReview ? "warn" : "success"}`}>
            配置 {plan.assignments.length}/{plan.plannedPeopleCount}人
          </span>
          <span className={`badge ${requirementsBadgeClass}`}>{requirementsLabel}</span>
          <span className={`badge ${dailyReportBadgeClass}`}>{dailyReportLabel}</span>
        </div>
        <div className="production-plan-detail-queue">
          <a className="production-plan-detail-next-link" href={nextActionHref}>
            次: {nextActionLabel}
          </a>
          <span className={`badge ${planReviewItems.length > 0 ? planReviewItems[0].tone : "success"}`}>
            次
          </span>
          {planReviewItems.length > 0 ? (
            planReviewItems.slice(0, 4).map((item) => (
              <a key={`${item.label}:${item.detail}`} className={`badge ${item.tone}`} href={tabHref(item.tabId)}>
                {item.label}: {item.detail}
              </a>
            ))
          ) : (
            <span className="badge success">主要確認OK</span>
          )}
        </div>
        <PlanActions planId={plan.id} status={plan.status} />
      </div>

      <SectionTabs
        ariaLabel="生産予定詳細の表示切り替え"
        initialTabId="detail"
        inlineHeader
        hashPrefix="plan-tab"
        items={[
          {
            id: "detail",
            label: "登録内容",
            heading: "登録内容",
            content: (
              <>
                <PlanForm
                  products={productOptions}
                  workAreas={workAreaOptions}
                  planId={plan.id}
                  initial={{
                    date: plan.date.toISOString().slice(0, 10),
                    productId: plan.productId,
                    productionType: plan.productionType,
                    plannedQuantity: plan.plannedQuantity,
                    unit: plan.unit,
                    workAreaId: plan.workAreaId,
                    plannedStartTime: plan.plannedStartTime,
                    desiredEndTime: plan.desiredEndTime,
                    plannedPeopleCount: plan.plannedPeopleCount,
                    baselineEndTime: plan.baselineEndTime,
                    note: plan.note,
                    status: plan.status,
                  }}
                />
              </>
            ),
          },
          {
            id: "assignments",
            label: "スタッフ配置",
            heading: "スタッフ配置",
            count: plan.assignments.length,
            content: (
              <>
                <AssignmentEditor
                  planId={plan.id}
                  employees={employees.map((e) => ({
                    id: e.id,
                    name: e.name,
                    employmentType: e.employmentType,
                    affiliation: e.affiliation,
                  }))}
                  initialAssignments={plan.assignments.map((a) => ({
                    employeeId: a.employeeId,
                    startTime: a.startTime,
                    endTime: a.endTime,
                  }))}
                  defaultStartTime={plan.plannedStartTime}
                  defaultEndTime={plan.plannedEndTime ?? plan.desiredEndTime ?? plan.baselineEndTime}
                />
              </>
            ),
          },
          {
            id: "requirements",
            label: "原料・資材",
            heading: "原料・資材の予定使用量",
            count:
              shortageHard.length + shortageDep.length > 0
                ? `警告 ${shortageHard.length + shortageDep.length}`
                : plan.requirements.length,
            content: (
              <>
                {plan.requirements.length === 0 ? (
                  <div className="empty-state">この商品にはBOMが登録されていません。</div>
                ) : (
                  <div className="table-frame">
                    <table>
                      <thead>
                        <tr>
                          <th>区分</th>
                          <th>名称</th>
                          <th>予定使用量</th>
                          <th>使用前見込み</th>
                          <th>確定入荷見込み</th>
                          <th>未確定入荷見込み</th>
                          <th>不足</th>
                          <th>状態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.requirements.map((r) => (
                          <tr key={r.id}>
                            <td>{r.itemType === "raw_material" ? "原料" : "資材"}</td>
                            <td>{r.itemName}</td>
                            <td className="right">
                              {r.plannedQuantity} {r.unit}
                            </td>
                            <td className="right">{r.onHandQuantity}</td>
                            <td className="right">{r.confirmedInbound}</td>
                            <td className="right">{r.unconfirmedInbound}</td>
                            <td className="right">
                              {r.shortageQuantity > 0 ? `${r.shortageQuantity} ${r.unit}` : "—"}
                            </td>
                            <td>
                              {r.shortageType === "hard_shortage" && <span className="badge danger">不足</span>}
                              {r.shortageType === "unconfirmed_dependency" && (
                                <span className="badge warn">未確定依存</span>
                              )}
                              {r.shortageType === "none" && <span className="badge success">OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {shortageHard.length > 0 && (
                  <div className="alert danger">
                    原料/資材が不足しています。発注候補:{" "}
                    {shortageHard.map((s) => `${s.itemName} ${s.shortageQuantity}${s.unit}`).join(", ")}
                  </div>
                )}
                {shortageDep.length > 0 && (
                  <div className="alert warn">
                    未確定発注の入荷に依存しています:{" "}
                    {shortageDep.map((s) => `${s.itemName} ${s.shortageQuantity}${s.unit}`).join(", ")}
                  </div>
                )}
              </>
            ),
          },
          {
            id: "cost",
            label: "原価見積",
            heading: "原価見積",
            content: (
              <>
                <div className="panel grid grid-4">
                  <Stat label="作業費(手間賃)" value={plan.estLaborCost} suffix="円" />
                  <Stat label="原料原価" value={plan.estMaterialCost} suffix="円" />
                  <Stat label="資材原価" value={plan.estPackagingCost} suffix="円" />
                  <Stat label="総原価" value={plan.estTotalCost} suffix="円" />
                </div>
              </>
            ),
          },
          {
            id: "daily-report",
            label: "日報",
            heading: "日報（実績入力）",
            count: dailyReport?.status === "confirmed" ? "確定" : dailyReport ? "下書き" : "未入力",
            content: (
              <>
                <DailyReportForm
                  planId={plan.id}
                  planStatus={plan.status}
                  planned={{
                    quantity: plan.plannedQuantity,
                    unit: plan.unit,
                    casePackQty: plan.product.casePackQty,
                    peopleCount: plan.plannedPeopleCount,
                    startTime: plan.plannedStartTime,
                    endTime: plan.plannedEndTime ?? plan.desiredEndTime ?? plan.baselineEndTime,
                  }}
                  requirements={plan.requirements.map((r) => ({
                    itemType: r.itemType as "raw_material" | "packaging",
                    itemId: r.itemId,
                    itemName: r.itemName,
                    unit: r.unit,
                    plannedQuantity: r.plannedQuantity,
                    unitPriceSnapshot: r.unitPriceSnapshot,
                  }))}
                  report={
                    dailyReport
                      ? {
                          id: dailyReport.id,
                          status: dailyReport.status,
                          actualStartTime: dailyReport.actualStartTime,
                          actualEndTime: dailyReport.actualEndTime,
                          actualBreakMinutes: dailyReport.actualBreakMinutes,
                          actualPeopleCount: dailyReport.actualPeopleCount,
                          actualQuantity: dailyReport.actualQuantity,
                          note: dailyReport.note,
                          consumptions: dailyReport.consumptions.map((c) => ({
                            itemType: c.itemType,
                            itemId: c.itemId,
                            actualQuantity: c.actualQuantity,
                          })),
                        }
                      : null
                  }
                />
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function tabHref(tabId: string) {
  return `#plan-tab-${tabId}`;
}

function Stat({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value == null ? "—" : value.toLocaleString()} {suffix}
      </div>
    </div>
  );
}
