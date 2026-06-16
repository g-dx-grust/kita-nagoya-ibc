import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { WorkAreaCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const rows = await prisma.workArea.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, WorkAreaCreateSchema);
    const row = await prisma.workArea.create({
      data: {
        name: body.name,
        areaType: body.areaType ?? "internal",
        defaultStartTime: body.defaultStartTime ?? null,
        defaultEndTime: body.defaultEndTime ?? null,
        maxPeopleCount: body.maxPeopleCount ?? 4,
        displayOrder: body.displayOrder ?? 0,
        equipmentKind: body.equipmentKind ?? "ROOM",
        autoScheduleRole: body.autoScheduleRole ?? "SHARED",
        concurrentOperationAllowed: body.concurrentOperationAllowed ?? true,
        active: body.active ?? true,
        externalFlag: body.externalFlag ?? false,
        validFrom: body.validFrom ?? null,
        validTo: body.validTo ?? null,
        note: body.note ?? null,
      },
    });
    await audit({ action: "create", entityType: "WorkArea", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
