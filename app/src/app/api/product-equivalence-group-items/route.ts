import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductEquivalenceGroupItemCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const productId = url.searchParams.get("productId") ?? undefined;
    const rows = await prisma.productEquivalenceGroupItem.findMany({
      where: { groupId, productId },
      include: { group: true, product: true },
      orderBy: { createdAt: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductEquivalenceGroupItemCreateSchema);
    const row = await prisma.productEquivalenceGroupItem.create({
      data: body,
      include: { group: true, product: true },
    });
    await audit({
      action: "create",
      entityType: "ProductEquivalenceGroupItem",
      entityId: row.id,
      after: row,
    });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
