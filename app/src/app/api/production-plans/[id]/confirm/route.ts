import { audit } from "@/lib/audit";
import { handleError, HttpError, notFound, ok } from "@/lib/http";
import { assertConfirmEligible } from "@/lib/plan-backing";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionPlan.findUnique({ where: { id } });
    if (!before) return notFound();
    if (before.status === "confirmed") return ok(before);
    if (before.status !== "draft" && before.status !== "tentative_confirmed") {
      throw new HttpError(400, "invalid_status_for_confirm", {
        expected: ["draft", "tentative_confirmed"],
        actual: before.status,
      });
    }

    const backing = await assertConfirmEligible(id);
    const claimed = await prisma.productionPlan.updateMany({
      where: { id, status: { in: ["draft", "tentative_confirmed"] } },
      data: { status: "confirmed" },
    });
    if (claimed.count !== 1) throw new HttpError(409, "production_plan_status_changed");
    const after = await prisma.productionPlan.findUnique({ where: { id } });
    // 確定しても実在庫は減らさない: 予定引当として扱う (docs/03 受け入れ条件)
    await audit({ action: "confirm", entityType: "ProductionPlan", entityId: id, before, after: { plan: after, backing } });
    return ok({ plan: after, backing });
  } catch (e) {
    return handleError(e);
  }
}
