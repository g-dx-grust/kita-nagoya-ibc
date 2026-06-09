import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
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

  const shortageHard = plan.requirements.filter((r) => r.shortageType === "hard_shortage");
  const shortageDep = plan.requirements.filter(
    (r) => r.shortageType === "unconfirmed_dependency",
  );

  return (
    <>
      <h1>
        生産予定 ・ {plan.date.toISOString().slice(0, 10)} · {plan.product.officialName}
      </h1>
      <div className="toolbar">
        <Link href={kitagoyaPath("/production-plans")}>← 一覧へ</Link>
        <Link href={kitagoyaPath(`/prints?date=${plan.date.toISOString().slice(0, 10)}`)}>現場印刷</Link>
        <div className="spacer" />
        <PlanActions planId={plan.id} status={plan.status} />
      </div>

      <h2>登録内容</h2>
      <PlanForm
        products={productOptions}
        workAreas={workAreas}
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

      <h2>スタッフ配置</h2>
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

      <h2>原料・資材の予定使用量</h2>
      {plan.requirements.length === 0 ? (
        <div className="empty-state">この商品にはBOMが登録されていません。</div>
      ) : (
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

      <h2>原価見積</h2>
      <div className="panel grid grid-4">
        <Stat label="作業費(手間賃)" value={plan.estLaborCost} suffix="円" />
        <Stat label="原料原価" value={plan.estMaterialCost} suffix="円" />
        <Stat label="資材原価" value={plan.estPackagingCost} suffix="円" />
        <Stat label="総原価" value={plan.estTotalCost} suffix="円" />
      </div>

      <h2>日報（実績入力）</h2>
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
  );
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
