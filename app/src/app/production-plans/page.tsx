import Link from "next/link";
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
      include: { product: true, workArea: true, requirements: true },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  const tableRows = plans.map((p) => ({
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    productCode: p.product.productCode,
    productName: p.product.officialName,
    casePackQty: p.product.casePackQty,
    workAreaName: p.workArea.name,
    plannedQuantity: p.plannedQuantity,
    unit: p.unit,
    plannedPeopleCount: p.plannedPeopleCount,
    plannedStartTime: p.plannedStartTime,
    plannedEndTime: p.plannedEndTime,
    status: p.status,
    overtimeMinutes: p.overtimeMinutes,
    hardShortage: p.requirements.some((r) => r.shortageType === "hard_shortage"),
    unconfirmedDep: p.requirements.some((r) => r.shortageType === "unconfirmed_dependency"),
  }));

  return (
    <>
      <h1>生産予定</h1>
      <form className="panel toolbar" method="GET">
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
            <option value="draft">仮</option>
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
        <div className="toolbar-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans/monthly")}>
            月間生成
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans/auto")}>
            自動作成
          </Link>
          <Link className="button-link" href={kitagoyaPath("/production-plans/new")}>
            ＋ 新規予定
          </Link>
        </div>
      </form>

      <PlanListTable
        plans={tableRows}
        filter={{ dateFrom, dateTo, status, workAreaId }}
      />
    </>
  );
}
