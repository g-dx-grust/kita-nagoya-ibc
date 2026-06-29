import { describe, expect, it, vi } from "vitest";

import { regenerateAndAdoptMonthlyDrafts } from "./monthly-reschedule";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("product-planning monthly reschedule", () => {
  it("受注変更後の再生成は候補runを採用まで進める", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/product-planning/monthly-schedule")) {
        expect(init?.method).toBe("POST");
        return jsonResponse(
          {
            runId: "run-1",
            adoptUrl: "/planning/monthly-runs/run-1/adopt",
            status: "simulated",
            candidateCount: 2,
            skipped: [{ reason: "capacity" }],
          },
          201,
        );
      }
      if (url.endsWith("/planning/monthly-runs/run-1/adopt")) {
        expect(init?.method).toBe("POST");
        return jsonResponse({
          runId: "run-1",
          batchId: "batch-1",
          createdCount: 2,
          replacedPlanCount: 1,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await regenerateAndAdoptMonthlyDrafts(
      {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        productionLeadDays: 1,
        planningBasis: "historical_actual",
        defaultStartTime: "09:00",
        baselineEndTime: "17:00",
        replaceExistingDrafts: true,
        replaceGeneratedDraftsOnly: true,
      },
      { fetcher, apiPath: (path) => path },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      replaceExistingDrafts: true,
      replaceGeneratedDraftsOnly: true,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      replaceExistingDrafts: true,
      replaceGeneratedDraftsOnly: true,
    });
    expect(result).toMatchObject({
      runId: "run-1",
      batchId: "batch-1",
      status: "adopted",
      candidateCount: 2,
      createdCount: 2,
      replacedDraftCount: 1,
    });
    expect(result.skipped).toHaveLength(1);
  });

  it("adopt 失敗時は throw し、サイレント成功にしない", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/product-planning/monthly-schedule")) {
        return jsonResponse({
          runId: "run-failed-adopt",
          adoptUrl: "/planning/monthly-runs/run-failed-adopt/adopt",
          status: "simulated",
          candidateCount: 1,
        });
      }
      if (url.endsWith("/planning/monthly-runs/run-failed-adopt/adopt")) {
        return jsonResponse({ error: "monthly_planning_run_already_adopted" }, 409);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await expect(
      regenerateAndAdoptMonthlyDrafts(
        {
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          productionLeadDays: 1,
          planningBasis: "historical_actual",
          defaultStartTime: "09:00",
          baselineEndTime: "17:00",
          replaceExistingDrafts: true,
          replaceGeneratedDraftsOnly: true,
        },
        { fetcher, apiPath: (path) => path },
      ),
    ).rejects.toThrow("monthly_planning_run_already_adopted");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("schedule 成功/adopt 失敗では simulated run が残る既知挙動を呼び出し順で明示する", async () => {
    const calledUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.endsWith("/product-planning/monthly-schedule")) {
        return jsonResponse({
          runId: "run-left-simulated",
          adoptUrl: "/planning/monthly-runs/run-left-simulated/adopt",
          status: "simulated",
          candidateCount: 1,
        });
      }
      if (url.endsWith("/planning/monthly-runs/run-left-simulated/adopt")) {
        return jsonResponse({ error: "adopt_failed" }, 500);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await expect(
      regenerateAndAdoptMonthlyDrafts(
        {
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          productionLeadDays: 1,
          planningBasis: "historical_actual",
          defaultStartTime: "09:00",
          baselineEndTime: "17:00",
          replaceExistingDrafts: true,
          replaceGeneratedDraftsOnly: false,
        },
        { fetcher, apiPath: (path) => path },
      ),
    ).rejects.toThrow("adopt_failed");

    // schedule API は既に simulated run を作成済み。adopt が失敗しても、
    // この helper は rollback API を呼ばず、run の確認・再採用は後続運用に残す。
    expect(calledUrls).toEqual([
      "/product-planning/monthly-schedule",
      "/planning/monthly-runs/run-left-simulated/adopt",
    ]);
  });
});
