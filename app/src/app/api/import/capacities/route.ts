import { audit } from "@/lib/audit";
import { parseCsvWithHeader } from "@/lib/csv";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { rows } = parseCsvWithHeader(await req.text());
    const workAreas = await prisma.workArea.findMany();
    const products = await prisma.product.findMany({ where: { active: true } });
    const workAreaByName = new Map(workAreas.map((row) => [row.name, row.id]));
    const productByCode = new Map(products.map((row) => [row.productCode, row.id]));
    const productByName = new Map(products.map((row) => [row.officialName, row.id]));
    const results: { row: number; action: "upserted" }[] = [];
    const errors: { row: number; message: string }[] = [];

    for (const [index, r] of rows.entries()) {
      const row = index + 2;
      const productId =
        value(r.product_id) ??
        (value(r.product_code) ? productByCode.get(value(r.product_code)!) : undefined) ??
        (value(r.product_name) ? productByName.get(value(r.product_name)!) : undefined);
      const workAreaId =
        value(r.work_area_id) ??
        (value(r.work_area_name) ? workAreaByName.get(value(r.work_area_name)!) : undefined);
      const unitsPerPersonHour = positiveNumber(r.units_per_person_hour);
      const sourceType = value(r.source_type) ?? "MANUAL";
      const validFrom = parseDate(r.valid_from);
      const validTo = parseDate(r.valid_to);

      if (!productId || !workAreaId || unitsPerPersonHour == null) {
        errors.push({ row, message: "product, work_area, and units_per_person_hour required" });
        continue;
      }
      if (!["MANUAL", "DAILY_REPORT_MEDIAN"].includes(sourceType)) {
        errors.push({ row, message: "invalid source_type" });
        continue;
      }
      if (validFrom === false || validTo === false || (validFrom && validTo && validFrom >= validTo)) {
        errors.push({ row, message: "invalid validity period" });
        continue;
      }

      await prisma.productionCapacity.upsert({
        where: { productId_workAreaId: { productId, workAreaId } },
        update: {
          unitsPerPersonHour,
          standardPeople: positiveNumber(r.standard_people) ?? 1,
          standardBreakMinutes: nonnegativeInt(r.standard_break_minutes) ?? 0,
          sourceType,
          locked: parseBool(r.locked) ?? false,
          validFrom: validFrom || null,
          validTo: validTo || null,
          note: value(r.note),
        },
        create: {
          productId,
          workAreaId,
          unitsPerPersonHour,
          standardPeople: positiveNumber(r.standard_people) ?? 1,
          standardBreakMinutes: nonnegativeInt(r.standard_break_minutes) ?? 0,
          sourceType,
          locked: parseBool(r.locked) ?? false,
          validFrom: validFrom || null,
          validTo: validTo || null,
          note: value(r.note),
        },
      });
      results.push({ row, action: "upserted" });
    }

    await audit({ action: "import_capacities", entityType: "ProductionCapacity", after: { count: results.length, errors: errors.length } });
    return ok({ imported: results.length, results, errors });
  } catch (e) {
    return handleError(e);
  }
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function positiveNumber(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function nonnegativeInt(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
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
