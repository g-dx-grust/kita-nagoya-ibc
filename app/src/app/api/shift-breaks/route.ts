import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ShiftBreakCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shiftPatternId = url.searchParams.get("shiftPatternId");
    const includeCommon = url.searchParams.get("includeCommon") !== "false";
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const rows = await prisma.shiftBreak.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(shiftPatternId
          ? includeCommon
            ? { OR: [{ shiftPatternId: null }, { shiftPatternId }] }
            : { shiftPatternId }
          : {}),
      },
      include: { pattern: true },
      orderBy: [{ shiftPatternId: "asc" }, { startTime: "asc" }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ShiftBreakCreateSchema);
    const row = await prisma.shiftBreak.create({ data: body, include: { pattern: true } });
    await audit({ action: "create", entityType: "ShiftBreak", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
