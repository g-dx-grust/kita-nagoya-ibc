import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ShiftChangeRequestReviewSchema } from "@/lib/schemas";
import { normalizeShiftChangeDays, type ShiftChangeDay } from "@/lib/shift-change-request";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, ShiftChangeRequestReviewSchema);
    const request = await prisma.shiftChangeRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!request) return notFound();
    if (request.status !== "pending") return badRequest("request_not_pending");

    if (body.action === "reject") {
      const rejected = await prisma.shiftChangeRequest.update({
        where: { id },
        data: {
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: body.reviewedBy ?? null,
          reviewNote: body.reviewNote ?? null,
        },
      });
      await audit({
        action: "reject_shift_change",
        entityType: "ShiftChangeRequest",
        entityId: id,
        before: request,
        after: rejected,
      });
      return ok({ id, status: rejected.status });
    }

    const requestedDays = parseShiftChangeDays(request.requestedDaysJson);
    const { year, month } = parseYearMonth(request.yearMonth);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const before = await prisma.shift.findMany({
      where: { employeeId: request.employeeId, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    });

    const after = await prisma.$transaction(async (tx) => {
      await tx.shift.deleteMany({
        where: { employeeId: request.employeeId, date: { gte: start, lt: end } },
      });
      if (requestedDays.length > 0) {
        await tx.shift.createMany({
          data: requestedDays.map((day) => ({
            employeeId: request.employeeId,
            date: new Date(Date.UTC(year, month - 1, day.day)),
            startTime: day.startTime,
            endTime: day.endTime,
            breakMinutes: day.breakMinutes,
            status: "confirmed",
          })),
        });
      }
      await tx.shiftChangeRequest.update({
        where: { id },
        data: {
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: body.reviewedBy ?? null,
          reviewNote: body.reviewNote ?? null,
          appliedAt: new Date(),
        },
      });
      return tx.shift.findMany({
        where: { employeeId: request.employeeId, date: { gte: start, lt: end } },
        orderBy: { date: "asc" },
      });
    });

    await audit({
      action: "approve_shift_change",
      entityType: "ShiftChangeRequest",
      entityId: id,
      before,
      after: { requestId: id, employeeId: request.employeeId, count: after.length },
    });

    return ok({ id, status: "approved", employeeId: request.employeeId, count: after.length });
  } catch (e) {
    return handleError(e);
  }
}

function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
}

function parseShiftChangeDays(value: unknown): ShiftChangeDay[] {
  let rows: unknown;
  try {
    rows = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return normalizeShiftChangeDays(
    rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const candidate = row as Partial<ShiftChangeDay>;
      if (
        typeof candidate.day !== "number" ||
        typeof candidate.startTime !== "string" ||
        typeof candidate.endTime !== "string" ||
        typeof candidate.breakMinutes !== "number"
      ) {
        return [];
      }
      return [
        {
          day: candidate.day,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          breakMinutes: candidate.breakMinutes,
        },
      ];
    }),
  );
}
