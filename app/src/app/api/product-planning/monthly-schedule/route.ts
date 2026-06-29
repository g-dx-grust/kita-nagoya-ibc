import { created, handleError, parseJson } from "@/lib/http";
import { createMonthlyPlanningRunFromSchedule } from "@/lib/monthly-planning-run-service";
import { kitagoyaPath } from "@/lib/paths";
import { MonthlyProductionScheduleCreateSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, MonthlyProductionScheduleCreateSchema);
    const result = await createMonthlyPlanningRunFromSchedule(body);

    return created({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      runId: result.run.id,
      yearMonth: result.run.yearMonth,
      status: result.run.status,
      candidateCount: result.candidates.length,
      createdCount: 0,
      replacedDraftCount: 0,
      skipped: result.skipped,
      candidates: result.candidates,
      plans: [],
      message: result.message,
      previewUrl: kitagoyaPath(`/production-plans/monthly?runId=${result.run.id}#candidates`),
      adoptUrl: `/planning/monthly-runs/${result.run.id}/adopt`,
    });
  } catch (e) {
    return handleError(e);
  }
}
