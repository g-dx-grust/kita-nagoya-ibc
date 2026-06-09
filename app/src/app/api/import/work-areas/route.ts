import { audit } from "@/lib/audit";
import { parseCsvWithHeader } from "@/lib/csv";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { rows } = parseCsvWithHeader(await req.text());
    const results: { name: string; action: "created" | "updated" }[] = [];
    const errors: { row: number; name?: string; message: string }[] = [];

    for (const [index, r] of rows.entries()) {
      const row = index + 2;
      const name = value(r.name);
      const areaType = value(r.area_type) ?? "internal";
      const equipmentKind = value(r.equipment_kind) ?? "ROOM";
      const validFrom = parseDate(r.valid_from);
      const validTo = parseDate(r.valid_to);
      if (!name) {
        errors.push({ row, message: "name required" });
        continue;
      }
      if (!["internal", "external", "warehouse"].includes(areaType)) {
        errors.push({ row, name, message: "invalid area_type" });
        continue;
      }
      if (!["ROOM", "LINE", "MACHINE", "OTHER"].includes(equipmentKind)) {
        errors.push({ row, name, message: "invalid equipment_kind" });
        continue;
      }
      if (validFrom === false || validTo === false || (validFrom && validTo && validFrom >= validTo)) {
        errors.push({ row, name, message: "invalid validity period" });
        continue;
      }

      const data = {
        name,
        areaType,
        defaultStartTime: value(r.default_start_time),
        defaultEndTime: value(r.default_end_time),
        maxPeopleCount: positiveInt(r.max_people_count) ?? 4,
        displayOrder: integer(r.display_order) ?? 0,
        externalFlag: parseBool(r.external_flag) ?? areaType === "external",
        note: value(r.note),
        equipmentKind,
        concurrentOperationAllowed: parseBool(r.concurrent_operation_allowed) ?? true,
        validFrom: validFrom || null,
        validTo: validTo || null,
        active: true,
      };
      const existing = await prisma.workArea.findUnique({ where: { name } });
      if (existing) {
        await prisma.workArea.update({ where: { id: existing.id }, data });
        results.push({ name, action: "updated" });
      } else {
        await prisma.workArea.create({ data });
        results.push({ name, action: "created" });
      }
    }

    await audit({ action: "import_work_areas", entityType: "WorkArea", after: { count: results.length, errors: errors.length } });
    return ok({ imported: results.length, results, errors });
  } catch (e) {
    return handleError(e);
  }
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function integer(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function positiveInt(v: string | undefined): number | null {
  const n = integer(v);
  return n != null && n > 0 ? n : null;
}
function parseBool(v: string | undefined): boolean | null {
  const s = value(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}
function parseDate(v: string | undefined): Date | false | null {
  const s = value(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : false;
}
