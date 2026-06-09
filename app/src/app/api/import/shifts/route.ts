import { audit } from "@/lib/audit";
import { parseCsvWithHeader } from "@/lib/csv";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// Accepts text/csv body (raw). Columns:
// employee_name, date, start_time, end_time, break_minutes, status, shift_pattern_name
// Optional: employee_code (matched against Employee.name as a stable key fallback)
//
// IMPORTANT (master integrity):
// - Per-day shift rows MUST NOT mutate the employee master. We never overwrite
//   Employee.defaultStartTime/defaultEndTime from a shift row.
// - Employees are matched by a stable key (exact name; or employee_code when the
//   CSV supplies one). A row whose employee does not already exist is SKIPPED and
//   reported as a warning — we never silently create a new active employee from a
//   possibly-typo'd name.
// - Matched employees get their Shift rows upserted (employeeId+date unique).
export async function POST(req: Request) {
  try {
    const { rows } = parseCsvWithHeader(await req.text());
    const [patterns, employees] = await Promise.all([
      prisma.shiftPattern.findMany({ where: { active: true } }),
      prisma.employee.findMany({ where: { active: true } }),
    ]);
    const patternByName = new Map(patterns.map((pattern) => [pattern.name, pattern.id]));
    // Stable-key lookup. There is no employee_code column on the master, so the
    // stable key is the exact official name. employee_code (if present in the CSV)
    // is also matched against the name so a future code-keyed export still works.
    const employeeByKey = new Map(employees.map((employee) => [employee.name, employee.id]));

    const results: { row: number; action: "upserted" }[] = [];
    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];
    const skipped: { row: number; message: string }[] = [];

    for (const [index, r] of rows.entries()) {
      const row = index + 2;
      const employeeName = value(r.employee_name);
      const employeeCode = value(r.employee_code);
      const date = parseDate(r.date);
      const startTime = value(r.start_time);
      const endTime = value(r.end_time);
      const status = value(r.status) ?? "confirmed";
      const patternName = value(r.shift_pattern_name);
      let shiftPatternId: string | null = null;
      if (!employeeName || !date || !startTime || !endTime) {
        errors.push({ row, message: "employee_name, date, start_time, and end_time required" });
        continue;
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
        errors.push({ row, message: "invalid time" });
        continue;
      }
      if (!["draft", "confirmed", "off"].includes(status)) {
        errors.push({ row, message: "invalid status" });
        continue;
      }
      if (patternName) {
        shiftPatternId = patternByName.get(patternName) ?? null;
        if (!shiftPatternId) warnings.push({ row, message: `shift_pattern_name not found: ${patternName}` });
      }

      // Match against the existing master only — never create from a shift row.
      const employeeId = employeeByKey.get(employeeCode ?? "") ?? employeeByKey.get(employeeName);
      if (!employeeId) {
        skipped.push({
          row,
          message: `employee not found in master: ${employeeCode ?? employeeName}`,
        });
        continue;
      }

      await prisma.shift.upsert({
        where: { employeeId_date: { employeeId, date } },
        update: {
          startTime,
          endTime,
          breakMinutes: nonnegativeInt(r.break_minutes) ?? 60,
          status,
          shiftPatternId,
        },
        create: {
          employeeId,
          date,
          startTime,
          endTime,
          breakMinutes: nonnegativeInt(r.break_minutes) ?? 60,
          status,
          shiftPatternId,
        },
      });
      results.push({ row, action: "upserted" });
    }

    await audit({
      action: "import_shifts",
      entityType: "Shift",
      after: {
        count: results.length,
        skipped: skipped.length,
        errors: errors.length,
        warnings: warnings.length,
      },
    });
    return ok({
      imported: results.length,
      skipped: skipped.length,
      results,
      errors,
      warnings,
      skippedRows: skipped,
    });
  } catch (e) {
    return handleError(e);
  }
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function nonnegativeInt(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}
function parseDate(v: string | undefined): Date | null {
  const s = value(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}
