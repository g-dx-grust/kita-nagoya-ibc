import { kitagoyaApiPath } from "@/lib/paths";

export type MonthlyScheduleRegenerateRequest = {
  dateFrom: string;
  dateTo: string;
  productionLeadDays: number;
  planningBasis: "historical_actual" | "inventory_shortage";
  defaultStartTime: string;
  baselineEndTime: string;
  replaceExistingDrafts: boolean;
  replaceGeneratedDraftsOnly: boolean;
};

export type MonthlyScheduleRegenerateResult = {
  runId?: string;
  batchId?: string;
  status?: string;
  candidateCount?: number;
  createdCount?: number;
  replacedDraftCount?: number;
  replacedPlanCount?: number;
  skipped?: { reason?: string }[];
  message?: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type JsonResponse = MonthlyScheduleRegenerateResult & {
  adoptUrl?: string;
  error?: string;
};

export async function regenerateAndAdoptMonthlyDrafts(
  input: MonthlyScheduleRegenerateRequest,
  options: {
    fetcher?: FetchLike;
    apiPath?: (path: string) => string;
  } = {},
): Promise<MonthlyScheduleRegenerateResult> {
  const fetcher = options.fetcher ?? fetch;
  const apiPath = options.apiPath ?? kitagoyaApiPath;
  const scheduleRes = await fetcher(apiPath("/product-planning/monthly-schedule"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const scheduleJson = (await scheduleRes.json().catch(() => ({}))) as JsonResponse;
  if (!scheduleRes.ok) throw new Error(scheduleJson.error ?? "unknown");

  const runId = scheduleJson.runId;
  const adoptUrl = scheduleJson.adoptUrl ?? (runId ? `/planning/monthly-runs/${runId}/adopt` : null);
  if (!runId || !adoptUrl) throw new Error("monthly_planning_run_adopt_url_missing");

  const adoptRes = await fetcher(apiPath(adoptUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      replaceExistingDrafts: input.replaceExistingDrafts,
      replaceGeneratedDraftsOnly: input.replaceGeneratedDraftsOnly,
    }),
  });
  const adoptJson = (await adoptRes.json().catch(() => ({}))) as JsonResponse;
  if (!adoptRes.ok) throw new Error(adoptJson.error ?? "unknown");

  return {
    ...scheduleJson,
    ...adoptJson,
    runId,
    status: adoptJson.status ?? "adopted",
    candidateCount: scheduleJson.candidateCount,
    createdCount: adoptJson.createdCount ?? 0,
    replacedDraftCount: adoptJson.replacedPlanCount ?? adoptJson.replacedDraftCount ?? 0,
    replacedPlanCount: adoptJson.replacedPlanCount ?? adoptJson.replacedDraftCount ?? 0,
    skipped: scheduleJson.skipped ?? [],
    message: adoptJson.message ?? scheduleJson.message,
  };
}
