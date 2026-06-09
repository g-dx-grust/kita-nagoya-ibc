import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { PackagingCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const rows = await prisma.packagingMaterial.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(q ? { OR: [{ materialCode: { contains: q } }, { name: { contains: q } }] } : {}),
    },
    include: { supplier: true },
    orderBy: { materialCode: "asc" },
  });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, PackagingCreateSchema);
    const row = await prisma.packagingMaterial.create({ data: body });
    await audit({
      action: "create",
      entityType: "PackagingMaterial",
      entityId: row.id,
      after: row,
    });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
