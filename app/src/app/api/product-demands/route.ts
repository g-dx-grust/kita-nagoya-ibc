import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
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
      },
      include: { product: true },
    });
    await audit({ action: "create", entityType: "ProductDemand", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
