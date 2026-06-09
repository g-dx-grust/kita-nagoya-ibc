import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const status = url.searchParams.get("status") ?? undefined;
    const reports = await prisma.dailyReport.findMany({
      where: { status, ...(dateFrom || dateTo ? {} : {}) },
      include: { consumptions: true },
      orderBy: { createdAt: "desc" },
    });
    // Pull related production plan info in a follow-up; cheap join via map.
    const planIds = [...new Set(reports.map((r) => r.productionPlanId))];
    const plans = await prisma.productionPlan.findMany({
      where: {
        id: { in: planIds },
        ...(dateFrom || dateTo
          ? {
              date: {
                gte: dateFrom ? new Date(dateFrom) : undefined,
                lte: dateTo ? new Date(dateTo) : undefined,
              },
            }
          : {}),
      },
      include: { product: true },
    });
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const filtered = reports.filter((r) => planMap.has(r.productionPlanId));
    return ok(filtered.map((r) => ({ ...r, plan: planMap.get(r.productionPlanId) })));
  } catch (e) {
    return handleError(e);
  }
}
