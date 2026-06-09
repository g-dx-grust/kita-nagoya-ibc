import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isValidTimeRange, timeRangesOverlap } from "@/lib/schedule";
import { ProductionPlanAssignmentsReplaceSchema } from "@/lib/schemas";
import { parseHM } from "@/lib/time";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const rows = await prisma.productionPlanAssignment.findMany({
      where: { productionPlanId: id },
      include: { employee: true },
      orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const plan = await prisma.productionPlan.findUnique({
      where: { id },
      include: { product: true, workArea: true },
    });
    if (!plan) return notFound();

    const body = await parseJson(req, ProductionPlanAssignmentsReplaceSchema);
    const duplicateEmployee = findDuplicate(body.assignments.map((a) => a.employeeId));
    if (duplicateEmployee) {
      return badRequest("duplicate_employee_in_plan", { employeeId: duplicateEmployee });
    }

    const invalid = body.assignments.find((a) => !isValidTimeRange(a));
    if (invalid) return badRequest("invalid_time_range", invalid);

    const employeeIds = body.assignments.map((a) => a.employeeId);
    if (employeeIds.length > 0) {
      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds }, active: true },
      });
      if (employees.length !== new Set(employeeIds).size) {
        return badRequest("employee_not_found_or_inactive");
      }
    }

    const [dayStart, dayEnd] = dayRange(plan.date);
    const shifts = await prisma.shift.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: { gte: dayStart, lt: dayEnd },
        status: { not: "off" },
      },
      include: { employee: true },
    });
    const shiftMap = new Map(shifts.map((shift) => [shift.employeeId, shift]));
    for (const assignment of body.assignments) {
      const shift = shiftMap.get(assignment.employeeId);
      if (!shift) return badRequest("employee_not_scheduled", { employeeId: assignment.employeeId });
      if (
        parseHM(assignment.startTime) < parseHM(shift.startTime) ||
        parseHM(assignment.endTime) > parseHM(shift.endTime)
      ) {
        return badRequest("employee_assignment_outside_shift", {
          employee: shift.employee.name,
          shift: { startTime: shift.startTime, endTime: shift.endTime },
          assignment,
        });
      }
    }

    const sameDayPlans = await prisma.productionPlan.findMany({
      where: { date: plan.date, id: { not: id } },
      include: {
        product: true,
        workArea: true,
        assignments: {
          where: { employeeId: { in: employeeIds } },
          include: { employee: true },
        },
      },
    });
    for (const assignment of body.assignments) {
      for (const otherPlan of sameDayPlans) {
        const overlapping = otherPlan.assignments.find(
          (other) =>
            other.employeeId === assignment.employeeId &&
            timeRangesOverlap(assignment, other),
        );
        if (overlapping) {
          return badRequest("employee_assignment_overlap", {
            employee: overlapping.employee.name,
            currentPlan: {
              product: plan.product.officialName,
              workArea: plan.workArea.name,
              startTime: assignment.startTime,
              endTime: assignment.endTime,
            },
            otherPlan: {
              product: otherPlan.product.officialName,
              workArea: otherPlan.workArea.name,
              startTime: overlapping.startTime,
              endTime: overlapping.endTime,
            },
          });
        }
      }
    }

    const before = await prisma.productionPlanAssignment.findMany({
      where: { productionPlanId: id },
      include: { employee: true },
    });

    const after = await prisma.$transaction(async (tx) => {
      await tx.productionPlanAssignment.deleteMany({ where: { productionPlanId: id } });
      if (body.assignments.length > 0) {
        await tx.productionPlanAssignment.createMany({
          data: body.assignments.map((a) => ({
            productionPlanId: id,
            employeeId: a.employeeId,
            startTime: a.startTime,
            endTime: a.endTime,
            moveAfterPlanId: a.moveAfterPlanId ?? null,
          })),
        });
      }
      return tx.productionPlanAssignment.findMany({
        where: { productionPlanId: id },
        include: { employee: true },
        orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
      });
    });

    await audit({
      action: "replace_assignments",
      entityType: "ProductionPlan",
      entityId: id,
      before,
      after,
    });
    return ok({ assignments: after });
  } catch (e) {
    return handleError(e);
  }
}

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function dayRange(date: Date): [Date, Date] {
  const start = new Date(date.toISOString().slice(0, 10));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start, end];
}
