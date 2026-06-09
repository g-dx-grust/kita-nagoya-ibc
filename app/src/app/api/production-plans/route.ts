import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { recalculateProductionPlan } from "@/lib/plan-engine";
import { prisma } from "@/lib/prisma";
import { ProductionPlanCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const workAreaId = url.searchParams.get("workAreaId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const rows = await prisma.productionPlan.findMany({
      where: {
        ...(dateFrom || dateTo
          ? {
              date: {
                gte: dateFrom ? new Date(dateFrom) : undefined,
                lte: dateTo ? new Date(dateTo) : undefined,
              },
            }
          : {}),
        workAreaId,
        status,
      },
      include: { product: true, workArea: true, requirements: true },
      orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductionPlanCreateSchema);
    const created_ = await prisma.productionPlan.create({
      data: { ...body, date: new Date(body.date) },
    });
    const calc = await recalculateProductionPlan(created_.id);
    const fresh = await prisma.productionPlan.findUnique({
      where: { id: created_.id },
      include: { product: true, workArea: true, requirements: true },
    });
    await audit({
      action: "create",
      entityType: "ProductionPlan",
      entityId: created_.id,
      after: fresh,
    });
    return created({ plan: fresh, ...calc });
  } catch (e) {
    return handleError(e);
  }
}
