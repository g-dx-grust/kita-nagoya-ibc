import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange } from "@/lib/schedule";
import { EmployeeUpdateSchema } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, EmployeeUpdateSchema);
    const nextWorkTime = {
      startTime: body.defaultStartTime ?? before.defaultStartTime,
      endTime: body.defaultEndTime ?? before.defaultEndTime,
    };
    if (!isValidTimeRange(nextWorkTime)) return badRequest("invalid_default_work_time");
    const after = await prisma.employee.update({ where: { id }, data: body });
    await audit({ action: "update", entityType: "Employee", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.employee.findUnique({ where: { id } });
  if (!before) return notFound();
  const after = await prisma.employee.update({ where: { id }, data: { active: false } });
  await audit({ action: "deactivate", entityType: "Employee", entityId: id, before, after });
  return ok(after);
}
