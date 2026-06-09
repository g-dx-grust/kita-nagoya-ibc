import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { SpecialDemandEventCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const targetYearMonth = url.searchParams.get("targetYearMonth") ?? undefined;
    const productId = url.searchParams.get("productId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const rows = await prisma.specialDemandEvent.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(includeInactive ? {} : { product: { active: true } }),
        targetYearMonth,
        productId,
        status,
      },
      include: { product: true },
      orderBy: [{ targetYearMonth: "desc" }, { createdAt: "desc" }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, SpecialDemandEventCreateSchema);
    const row = await prisma.specialDemandEvent.create({
      data: body,
      include: { product: true },
    });
    await audit({
      action: "create",
      entityType: "SpecialDemandEvent",
      entityId: row.id,
      after: row,
    });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
