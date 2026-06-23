export type DemandPlanCoverageDemand = {
  id: string;
  productId: string;
  dueDate: string;
  demandType: string;
  quantity: number;
  status?: string;
};

export type DemandPlanCoveragePlan = {
  id: string;
  productId: string;
  date: string;
  productionType: string;
  plannedQuantity: number;
  status: string;
};

export type DemandPlanCoverageRow = DemandPlanCoverageDemand & {
  plannedQuantity: number;
  remainingQuantity: number;
  coverageStatus: "covered" | "partial" | "unplanned";
};

export function computeDemandPlanCoverage({
  demands,
  plans,
  dateFrom,
  dateTo,
}: {
  demands: DemandPlanCoverageDemand[];
  plans: DemandPlanCoveragePlan[];
  dateFrom: string;
  dateTo: string;
}): DemandPlanCoverageRow[] {
  const availablePlans = plans
    .filter(
      (plan) =>
        plan.plannedQuantity > 0 &&
        plan.date >= dateFrom &&
        plan.date <= dateTo &&
        (plan.status === "draft" || plan.status === "confirmed") &&
        plan.productionType !== "stock",
    )
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((plan) => ({ ...plan, remainingQuantity: plan.plannedQuantity }));

  const plansByProduct = new Map<string, typeof availablePlans>();
  for (const plan of availablePlans) {
    const rows = plansByProduct.get(plan.productId) ?? [];
    rows.push(plan);
    plansByProduct.set(plan.productId, rows);
  }

  return demands
    .filter((demand) => demand.quantity > 0 && (!demand.status || demand.status === "open"))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.productId.localeCompare(b.productId) || a.id.localeCompare(b.id))
    .map((demand) => {
      let remainingDemand = demand.quantity;
      let plannedQuantity = 0;
      const productPlans = plansByProduct.get(demand.productId) ?? [];

      for (const plan of productPlans) {
        if (plan.date > demand.dueDate) break;
        if (plan.remainingQuantity <= 0 || remainingDemand <= 0) continue;
        const allocated = Math.min(plan.remainingQuantity, remainingDemand);
        plan.remainingQuantity = round4(plan.remainingQuantity - allocated);
        remainingDemand = round4(remainingDemand - allocated);
        plannedQuantity = round4(plannedQuantity + allocated);
      }

      const remainingQuantity = round4(Math.max(0, demand.quantity - plannedQuantity));
      return {
        ...demand,
        plannedQuantity,
        remainingQuantity,
        coverageStatus:
          remainingQuantity <= 0 ? "covered" : plannedQuantity > 0 ? "partial" : "unplanned",
      };
    });
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
