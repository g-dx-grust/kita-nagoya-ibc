import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductEquivalenceGroupCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const rows = await prisma.productEquivalenceGroup.findMany({
      where: includeInactive ? undefined : { active: true },
      include: { items: { include: { product: true } }, products: true },
      orderBy: { name: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductEquivalenceGroupCreateSchema);
    const row = await prisma.productEquivalenceGroup.create({ data: body });
    await audit({
      action: "create",
      entityType: "ProductEquivalenceGroup",
      entityId: row.id,
      after: row,
    });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
