import { audit } from "@/lib/audit";
import { runDayAllocation } from "@/lib/day-allocation-service";
import { handleError, ok, parseJson } from "@/lib/http";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "@/lib/plan-status";
import { enqueueDayAllocationReplanEvent } from "@/lib/replan-service";
import { DayAllocationSchema } from "@/lib/schemas";

// 当日の生産予定 + 出勤シフトから、出勤者を遊休ゼロで作業場所へ割り当てる。
// persist=false ならプレビュー、persist=true なら割り当てを保存し原料在庫を再計算する。
export async function POST(req: Request) {
  try {
    const body = await parseJson(req, DayAllocationSchema);
    const result = await runDayAllocation({
      date: body.date,
      dayStart: body.dayStart ?? "09:00",
      dayEnd: body.dayEnd ?? "17:00",
      stepMinutes: body.stepMinutes ?? 5,
      planStatuses: body.planStatuses ?? [...PLANNED_PRODUCTION_PLAN_STATUSES],
      persist: body.persist ?? false,
      pinnedAssignments: body.pinnedAssignments ?? [],
      planWorkAreaOverrides: body.planWorkAreaOverrides ?? [],
    });

    if (body.persist) {
      await audit({
        action: "allocate_day_staff",
        entityType: "ProductionPlan",
        entityId: body.date,
        after: {
          summary: result.allocation.summary,
          manualPinCount: (body.pinnedAssignments ?? []).length,
          planWorkAreaOverrideCount: (body.planWorkAreaOverrides ?? []).length,
          jobs: result.allocation.jobs.map((job) => ({
            planId: job.jobId,
            productName: job.productName,
            workAreaName: job.workAreaName,
            originalWorkAreaName: job.originalWorkAreaName,
            startTime: job.startTime,
            endTime: job.endTime,
            scheduledQuantity: job.scheduledQuantity,
            overflowQuantity: job.overflowQuantity,
            assignedCount: job.assignments.length,
          })),
        },
      });
      const replanEvent = await enqueueDayAllocationReplanEvent({
        date: body.date,
        payload: {
          summary: result.allocation.summary,
          manualPinCount: (body.pinnedAssignments ?? []).length,
          planWorkAreaOverrideCount: (body.planWorkAreaOverrides ?? []).length,
          planIds: result.allocation.jobs.map((job) => job.jobId),
          skippedPlans: result.skippedPlans,
        },
      });
      return ok({
        ...result,
        replanEventId: replanEvent?.id ?? null,
        replanJobId: replanEvent?.jobs[0]?.id ?? null,
      });
    }

    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
