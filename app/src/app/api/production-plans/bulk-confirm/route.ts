import { audit } from "@/lib/audit";
import { handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductionPlanBulkConfirmSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductionPlanBulkConfirmSchema);
    const before = await prisma.productionPlan.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, status: true },
    });
    const confirmableIds = before
      .filter((plan) => plan.status === "draft")
      .map((plan) => plan.id);

    if (confirmableIds.length > 0) {
      await prisma.productionPlan.updateMany({
        where: { id: { in: confirmableIds }, status: "draft" },
        data: { status: "confirmed" },
      });
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
      after,
    });

    return ok({
      confirmed: confirmableIds.length,
      skipped: body.ids.length - confirmableIds.length,
      ids: confirmableIds,
    });
  } catch (e) {
    return handleError(e);
  }
}
