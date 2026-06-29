import { audit } from "@/lib/audit";
import { handleError, HttpError, notFound, ok } from "@/lib/http";
import { assertTentativeConfirmEligible } from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionPlan.findUnique({ where: { id } });
    if (!before) return notFound();
    if (before.status === "tentative_confirmed") {
      const backing = await assertTentativeConfirmEligible(id);
      return ok({ plan: before, backing, changed: false, purchaseCandidateRefresh: purchaseCandidateRefreshFor(before.date) });
    }
    if (before.status !== "draft") {
      throw new HttpError(400, "invalid_status_for_tentative_confirm", {
        expected: "draft",
        actual: before.status,
      });
    }

    const backing = await assertTentativeConfirmEligible(id);
    const claimed = await prisma.productionPlan.updateMany({
      where: { id, status: "draft" },
      data: { status: "tentative_confirmed" },
    });
    if (claimed.count !== 1) throw new HttpError(409, "production_plan_status_changed");

    const after = await prisma.productionPlan.findUnique({ where: { id } });
    await audit({
      action: "tentative_confirm",
      entityType: "ProductionPlan",
      entityId: id,
      before,
      after: { plan: after, backing },
    });
    return ok({
      plan: after,
      backing,
      changed: true,
      purchaseCandidateRefresh: after ? purchaseCandidateRefreshFor(after.date) : null,
    });
  } catch (e) {
    return handleError(e);
  }
}

function purchaseCandidateRefreshFor(date: Date) {
  const targetMonth = date.toISOString().slice(0, 7);
  return {
    required: true,
    mode: "month_end" as const,
    targetMonth,
    endpoint: "/api/purchase-candidates/generate",
    message: "仮確定後に月末在庫予測の発注候補を更新してください。",
  };
}
