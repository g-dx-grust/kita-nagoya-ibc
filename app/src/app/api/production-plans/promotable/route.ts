import { handleError, ok } from "@/lib/http";
import { evaluatePlanBacking } from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { dateFrom, dateTo } = parseRange(url.searchParams);
    const plans = await prisma.productionPlan.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        status: { in: ["draft", "tentative_confirmed"] },
      },
      include: { product: true, workArea: true },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }, { id: "asc" }],
    });
    const backingResults = await evaluatePlanBacking(plans.map((plan) => plan.id));
    const backingByPlanId = new Map(backingResults.map((result) => [result.planId, result]));
    const rows = plans.map((plan) => {
      const backing = backingByPlanId.get(plan.id);
      return {
        id: plan.id,
        date: plan.date.toISOString().slice(0, 10),
        plannedStartTime: plan.plannedStartTime,
        productId: plan.productId,
        productCode: plan.product.productCode,
        productName: plan.product.displayName || plan.product.officialName,
        workAreaId: plan.workAreaId,
        workAreaName: plan.workArea.name,
        plannedQuantity: plan.plannedQuantity,
        unit: plan.unit,
        status: plan.status,
        canTentativeConfirm: backing?.canTentativeConfirm ?? false,
        canConfirm: backing?.canConfirm ?? false,
        blockingRequirements: backing?.blockingRequirements ?? [],
        backingPurchaseOrderIds: backing?.backingPurchaseOrderIds ?? [],
      };
    });

    return ok({
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: dateTo.toISOString().slice(0, 10),
      rowCount: rows.length,
      promotableToTentative: rows.filter((row) => row.status === "draft" && row.canTentativeConfirm),
      promotableToConfirm: rows.filter((row) => row.canConfirm),
      demotionWarnings: rows.filter((row) => row.status === "tentative_confirmed" && !row.canTentativeConfirm),
      results: rows,
    });
  } catch (e) {
    return handleError(e);
  }
}

function parseRange(searchParams: URLSearchParams) {
  const ym = searchParams.get("ym");
  if (ym && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    const dateFrom = new Date(`${ym}-01T00:00:00.000Z`);
    return { dateFrom, dateTo: endOfMonth(dateFrom) };
  }

  const dateFromInput = searchParams.get("dateFrom");
  const dateToInput = searchParams.get("dateTo");
  const today = new Date();
  const dateFrom = dateFromInput
    ? new Date(`${dateFromInput}T00:00:00.000Z`)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const dateTo = dateToInput ? new Date(`${dateToInput}T23:59:59.999Z`) : endOfMonth(dateFrom);
  return { dateFrom, dateTo };
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
