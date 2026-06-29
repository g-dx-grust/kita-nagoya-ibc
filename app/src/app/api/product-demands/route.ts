import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enqueueDemandReplanEvent } from "@/lib/replan-service";
import { ProductDemandCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateTo = url.searchParams.get("dateTo");
    const status = url.searchParams.get("status") ?? "open";
    const rows = await prisma.productDemand.findMany({
      where: {
        status,
        ...(dateTo ? { dueDate: { lte: new Date(dateTo) } } : {}),
        product: { active: true },
      },
      include: { product: true },
      orderBy: [{ dueDate: "asc" }, { product: { productCode: "asc" } }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductDemandCreateSchema);
    const row = await prisma.productDemand.create({
      data: {
        ...body,
        dueDate: new Date(body.dueDate),
        productionDueDate: body.productionDueDate ? new Date(body.productionDueDate) : null,
      },
      include: { product: true },
    });
    await audit({ action: "create", entityType: "ProductDemand", entityId: row.id, after: row });
    const replanEvent = await enqueueDemandReplanEvent({
      eventType: "demand_created",
      demand: row,
      action: "create",
    });
    return created({ ...row, replanEventId: replanEvent?.id ?? null, replanJobId: replanEvent?.jobs[0]?.id ?? null });
  } catch (e) {
    return handleError(e);
  }
}
