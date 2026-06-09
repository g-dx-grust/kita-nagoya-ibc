import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductMonthlyActualUpsertSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const yearMonth = url.searchParams.get("yearMonth") ?? undefined;
    const productId = url.searchParams.get("productId") ?? undefined;
    const rows = await prisma.productMonthlyActual.findMany({
      where: {
        ...(yearMonth ? { yearMonth } : {}),
        ...(productId ? { productId } : {}),
        product: { active: true },
      },
      include: { product: true },
      orderBy: [{ yearMonth: "desc" }, { product: { productCode: "asc" } }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductMonthlyActualUpsertSchema);
    const row = await prisma.productMonthlyActual.upsert({
      where: {
        productId_yearMonth: {
          productId: body.productId,
          yearMonth: body.yearMonth,
        },
      },
      update: {
        actualQuantity: body.actualQuantity,
        sourceType: body.sourceType,
        note: body.note,
      },
      create: body,
      include: { product: true },
    });
    await audit({
      action: "upsert",
      entityType: "ProductMonthlyActual",
      entityId: row.id,
      after: row,
    });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
