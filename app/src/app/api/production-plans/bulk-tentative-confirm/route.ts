import { audit } from "@/lib/audit";
import { handleError, ok, parseJson } from "@/lib/http";
import {
  assertTentativeConfirmEligible,
  evaluatePlanBacking,
  type PlanBackingResult,
} from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";
import { ProductionPlanBulkConfirmSchema } from "@/lib/schemas";

type RowResult = {
  id: string;
  status: "tentative_confirmed" | "skipped";
  reason?: string;
  backing?: PlanBackingResult;
};

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductionPlanBulkConfirmSchema);
    const before = await prisma.productionPlan.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, status: true, date: true },
    });
    const beforeById = new Map(before.map((plan) => [plan.id, plan]));
    const backingResults = await evaluatePlanBacking(body.ids);
    const backingByPlanId = new Map(backingResults.map((result) => [result.planId, result]));

    const confirmedIds: string[] = [];
    const results: RowResult[] = [];

    for (const id of body.ids) {
      const plan = beforeById.get(id);
      const backing = backingByPlanId.get(id);
      if (!plan) {
        results.push({ id, status: "skipped", reason: "production_plan_not_found" });
        continue;
      }
      if (plan.status !== "draft") {
        results.push({
          id,
          status: "skipped",
          reason: plan.status === "tentative_confirmed" ? "already_tentative_confirmed" : "invalid_status",
          backing,
        });
        continue;
      }
      if (!backing?.canTentativeConfirm) {
        results.push({ id, status: "skipped", reason: "plan_not_tentative_confirmable", backing });
        continue;
      }

      await assertTentativeConfirmEligible(id);
      const claimed = await prisma.productionPlan.updateMany({
        where: { id, status: "draft" },
        data: { status: "tentative_confirmed" },
      });
      if (claimed.count === 1) {
        confirmedIds.push(id);
        results.push({ id, status: "tentative_confirmed", backing });
      } else {
        results.push({ id, status: "skipped", reason: "production_plan_status_changed", backing });
      }
    }

    const after = await prisma.productionPlan.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, status: true, date: true },
    });
    await audit({
      action: "bulk_tentative_confirm",
      entityType: "ProductionPlan",
      entityId: confirmedIds.join(","),
      before,
      after: { plans: after, results },
    });

    return ok({
      tentativeConfirmed: confirmedIds.length,
      skipped: results.filter((result) => result.status === "skipped").length,
      ids: confirmedIds,
      results,
      purchaseCandidateRefresh:
        confirmedIds.length > 0
          ? {
              required: true,
              mode: "month_end",
              targetMonths: [
                ...new Set(
                  after
                    .filter((plan) => confirmedIds.includes(plan.id))
                    .map((plan) => plan.date.toISOString().slice(0, 7)),
                ),
              ].sort(),
              endpoint: "/api/purchase-candidates/generate",
              message: "仮確定後に対象月の月末在庫予測から発注候補を更新してください。",
            }
          : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
