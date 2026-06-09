import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { BillingPriceCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? undefined;
  const rows = await prisma.billingPrice.findMany({
    where: { productId },
    orderBy: { effectiveFrom: "desc" },
  });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, BillingPriceCreateSchema);
    const row = await prisma.billingPrice.create({
      data: {
        ...body,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });
    await audit({ action: "create", entityType: "BillingPrice", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
