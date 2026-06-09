import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { MaterialCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const rows = await prisma.material.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(q ? { OR: [{ materialCode: { contains: q } }, { name: { contains: q } }] } : {}),
      },
      include: { supplier: true },
      orderBy: { materialCode: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, MaterialCreateSchema);
    const row = await prisma.material.create({ data: body });
    await audit({ action: "create", entityType: "Material", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
