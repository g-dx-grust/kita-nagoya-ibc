import { audit } from "@/lib/audit";
import { handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { CapacityUpsertSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? undefined;
  const workAreaId = url.searchParams.get("workAreaId") ?? undefined;
  const rows = await prisma.productionCapacity.findMany({
    where: { productId, workAreaId },
    include: { product: true, workArea: true },
  });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, CapacityUpsertSchema);
    const data = {
      productId: body.productId,
      workAreaId: body.workAreaId,
      unitsPerPersonHour: body.unitsPerPersonHour,
      standardPeople: body.standardPeople,
      standardBreakMinutes: body.standardBreakMinutes,
      note: body.note ?? null,
      sourceType: body.sourceType,
      locked: body.locked,
      active: body.active,
      validFrom: body.validFrom ?? null,
      validTo: body.validTo ?? null,
      ...(body.reviewStatus
        ? {
            reviewStatus: body.reviewStatus,
            reviewedAt: body.reviewStatus === "confirmed" ? new Date() : null,
          }
        : {}),
      ...(body.reviewMemo !== undefined ? { reviewMemo: body.reviewMemo ?? null } : {}),
    };
    const row = await prisma.productionCapacity.upsert({
      where: {
        productId_workAreaId: { productId: body.productId, workAreaId: body.workAreaId },
      },
      create: data,
      update: data,
    });
    await audit({
      action: "upsert",
      entityType: "ProductionCapacity",
      entityId: row.id,
      after: row,
    });
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
