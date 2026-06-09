import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ShiftPatternCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const rows = await prisma.shiftPattern.findMany({
      where: includeInactive ? undefined : { active: true },
      include: { breaks: true },
      orderBy: { name: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ShiftPatternCreateSchema);
    const row = await prisma.shiftPattern.create({ data: body });
    await audit({ action: "create", entityType: "ShiftPattern", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
