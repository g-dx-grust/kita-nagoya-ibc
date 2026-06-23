import Link from "next/link";
import { CalendarDays, ClipboardList, PackageCheck, Search } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import MonthlyPlanDecisionClient from "./monthly-plan-decision-client";
import { computeDemandPlanCoverage } from "@/lib/monthly-production-decision";
import { kitagoyaPath } from "@/lib/paths";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MonthlyProductionConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = sp.dateFrom ?? today;
  const dateTo = sp.dateTo ?? endOfMonth(dateFrom);

  const [plans, demands] = await Promise.all([
    prisma.productionPlan.findMany({
      where: {
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        status: { in: ["draft", "confirmed"] },
      },
      include: {
        product: {
          include: {
            capacities: {
              where: { active: true, workArea: { active: true } },
              include: { workArea: true },
            },
          },
        },
        workArea: true,
        requirements: true,
      },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }, { product: { productCode: "asc" } }],
    }),
    prisma.productDemand.findMany({
      where: {
        status: "open",
        dueDate: { lte: new Date(dateTo) },
        product: { active: true, productionType: { in: ["make_to_order", "both"] } },
      },
      include: {
        product: {
          include: {
            capacities: {
              where: { active: true, workArea: { active: true } },
              include: { workArea: true },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { product: { productCode: "asc" } }],
    }),
  ]);

  const coverageRows = computeDemandPlanCoverage({
    dateFrom,
    dateTo,
    demands: demands.map((demand) => ({
      id: demand.id,
      productId: demand.productId,
      dueDate: demand.dueDate.toISOString().slice(0, 10),
      demandType: demand.demandType,
      quantity: demand.quantity,
      status: demand.status,
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      productId: plan.productId,
      date: plan.date.toISOString().slice(0, 10),
      productionType: plan.productionType,
      plannedQuantity: plan.plannedQuantity,
      status: plan.status,
    })),
  });
  const coverageByDemandId = new Map(coverageRows.map((row) => [row.id, row]));
  const draftCount = plans.filter((plan) => plan.status === "draft").length;
  const confirmedCount = plans.filter((plan) => plan.status === "confirmed").length;
  const stockDraftCount = plans.filter((plan) => plan.status === "draft" && plan.productionType === "stock").length;
  const orderDraftCount = plans.filter((plan) => plan.status === "draft" && plan.productionType !== "stock").length;
  const uncoveredDemandCount = coverageRows.filter((row) => row.coverageStatus !== "covered").length;

  return (
    <>
      <div className="page-title-row">
        <h1>月間生産予定の本決定</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/monthly?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>
            <CalendarDays size={16} aria-hidden="true" />
            月間予定へ
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/product-planning?dateFrom=${dateFrom}&dateTo=${dateTo}`)}>
            <PackageCheck size={16} aria-hidden="true" />
            製品計画へ
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans?dateFrom=${dateFrom}&dateTo=${dateTo}&status=draft`)}>
            <ClipboardList size={16} aria-hidden="true" />
            下書き一覧
          </Link>
        </div>
      </div>

      <CollapsiblePanel
        title="表示・再計算条件"
        summary={`${dateFrom} 〜 ${dateTo} / 下書き ${draftCount} / 未予定受注 ${uncoveredDemandCount}`}
        className="monthly-decision-period-accordion"
      >
        <form className="toolbar compact-controls monthly-decision-period-form" method="GET">
          <label>
            <span>開始日</span>
            <input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label>
            <span>終了日</span>
            <input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <button type="submit" className="secondary">
            <Search size={15} aria-hidden="true" />
            再表示
          </button>
        </form>
      </CollapsiblePanel>

      <MonthlyPlanDecisionClient
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        plans={plans.map((plan) => ({
          id: plan.id,
          date: plan.date.toISOString().slice(0, 10),
          productId: plan.productId,
          productCode: plan.product.productCode,
          productName: plan.product.displayName || plan.product.officialName,
          productProductionType: plan.product.productionType,
          productionType: plan.productionType as "stock" | "make_to_order" | "external" | "trial" | "other",
          unit: plan.unit,
          casePackQty: plan.product.casePackQty,
          workAreaId: plan.workAreaId,
          workAreaName: plan.workArea.name,
          workAreaOptions: workAreaOptionsForPlan(plan),
          plannedQuantity: plan.plannedQuantity,
          plannedStartTime: plan.plannedStartTime,
          plannedEndTime: plan.plannedEndTime,
          plannedPeopleCount: plan.plannedPeopleCount,
          status: plan.status,
          hardShortage: plan.requirements.some((requirement) => requirement.shortageType === "hard_shortage"),
          unconfirmedDependency: plan.requirements.some((requirement) => requirement.shortageType === "unconfirmed_dependency"),
          note: plan.note,
        }))}
        demands={demands.map((demand) => {
          const coverage = coverageByDemandId.get(demand.id);
          return {
            id: demand.id,
            dueDate: demand.dueDate.toISOString().slice(0, 10),
            demandType: demand.demandType,
            quantity: demand.quantity,
            plannedQuantity: coverage?.plannedQuantity ?? 0,
            remainingQuantity: coverage?.remainingQuantity ?? demand.quantity,
            coverageStatus: coverage?.coverageStatus ?? "unplanned",
            customerName: demand.customerName,
            externalRef: demand.externalRef,
            note: demand.note,
            product: {
              id: demand.product.id,
              productCode: demand.product.productCode,
              officialName: demand.product.displayName || demand.product.officialName,
              productionType: demand.product.productionType,
              unit: demand.product.unit,
              casePackQty: demand.product.casePackQty,
              workAreaOptions: workAreaOptionsForProduct(demand.product),
            },
          };
        })}
        summary={{
          draftCount,
          confirmedCount,
          stockDraftCount,
          orderDraftCount,
          uncoveredDemandCount,
        }}
      />
    </>
  );
}

function workAreaOptionsForPlan(plan: {
  workAreaId: string;
  workArea: { id: string; name: string };
  product: Parameters<typeof workAreaOptionsForProduct>[0];
}) {
  const options = workAreaOptionsForProduct(plan.product);
  if (!options.some((option) => option.id === plan.workAreaId)) {
    options.push({
      id: plan.workArea.id,
      name: plan.workArea.name,
      standardPeople: null,
      candidatePriority: null,
      displayOrder: Number.MAX_SAFE_INTEGER,
    });
  }
  return sortWorkAreaOptions(options);
}

function workAreaOptionsForProduct(product: {
  capacities: {
    workAreaId: string;
    standardPeople: number;
    candidatePriority: number | null;
    workArea: { id: string; name: string; displayOrder: number; areaType: string; externalFlag: boolean; active: boolean };
  }[];
}) {
  const byId = new Map<string, { id: string; name: string; standardPeople: number | null; candidatePriority: number | null; displayOrder: number }>();
  for (const capacity of product.capacities) {
    if (!capacity.workArea.active || capacity.workArea.externalFlag || capacity.workArea.areaType !== "internal") continue;
    byId.set(capacity.workAreaId, {
      id: capacity.workArea.id,
      name: capacity.workArea.name,
      standardPeople: capacity.standardPeople,
      candidatePriority: capacity.candidatePriority,
      displayOrder: capacity.workArea.displayOrder,
    });
  }
  return sortWorkAreaOptions([...byId.values()]);
}

function sortWorkAreaOptions<T extends { name: string; candidatePriority?: number | null; displayOrder?: number }>(options: T[]) {
  return options.sort(
    (a, b) =>
      priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority) ||
      (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, "ja"),
  );
}

function priorityKey(value: number | null | undefined) {
  return value == null ? Number.MAX_SAFE_INTEGER : value;
}

function endOfMonth(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}
