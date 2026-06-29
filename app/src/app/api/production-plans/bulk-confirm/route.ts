import { audit } from "@/lib/audit";
import { handleError, ok, parseJson } from "@/lib/http";
import {
  assertConfirmEligible,
  evaluatePlanBacking,
  type PlanBackingResult,
} from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";
import { ProductionPlanBulkConfirmSchema } from "@/lib/schemas";

type RowResult = {
  id: string;
  status: "confirmed" | "skipped";
  reason?: string;
  backing?: PlanBackingResult;
};

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductionPlanBulkConfirmSchema);
    const before = await prisma.productionPlan.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, status: true },
    });
    const beforeById = new Map(before.map((plan) => [plan.id, plan]));
    const backingResults = await evaluatePlanBacking(body.ids);
    const backingByPlanId = new Map(backingResults.map((result) => [result.planId, result]));
    const confirmableIds: string[] = [];
    const results: RowResult[] = [];

    for (const id of body.ids) {
      const plan = beforeById.get(id);
      const backing = backingByPlanId.get(id);
      if (!plan) {
        results.push({ id, status: "skipped", reason: "production_plan_not_found" });
        continue;
      }
      if (plan.status === "confirmed") {
        results.push({ id, status: "skipped", reason: "already_confirmed", backing });
        continue;
      }
      if (plan.status !== "draft" && plan.status !== "tentative_confirmed") {
        results.push({ id, status: "skipped", reason: "invalid_status", backing });
        continue;
      }
      if (!backing?.canConfirm) {
        results.push({ id, status: "skipped", reason: "plan_not_confirmable", backing });
        continue;
      }

      await assertConfirmEligible(id);
      const claimed = await prisma.productionPlan.updateMany({
        where: { id, status: { in: ["draft", "tentative_confirmed"] } },
        data: { status: "confirmed" },
      });
      if (claimed.count === 1) {
        confirmableIds.push(id);
        results.push({ id, status: "confirmed", backing });
      } else {
        results.push({ id, status: "skipped", reason: "production_plan_status_changed", backing });
      }
    }

    const after = await prisma.productionPlan.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, status: true },
    });
    await audit({
      action: "bulk_confirm",
      entityType: "ProductionPlan",
      entityId: confirmableIds.join(","),
      before,
      after: { plans: after, results },
    });

    return ok({
      confirmed: confirmableIds.length,
      skipped: results.filter((result) => result.status === "skipped").length,
      ids: confirmableIds,
      results,
    });
  } catch (e) {
    return handleError(e);
  }
}
