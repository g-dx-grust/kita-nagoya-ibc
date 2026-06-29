import { describe, expect, it } from "vitest";

import { buildPurchaseCandidateGeneratePayload } from "./generate-payload";

describe("buildPurchaseCandidateGeneratePayload", () => {
  it("sends month_end mode with targetMonth from the purchases UI", () => {
    expect(
      buildPurchaseCandidateGeneratePayload({
        mode: "month_end",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        targetMonth: "2026-07",
      }),
    ).toEqual({
      mode: "month_end",
      targetMonth: "2026-07",
      replaceExistingCandidates: true,
    });
  });

  it("keeps the window payload backward compatible", () => {
    expect(
      buildPurchaseCandidateGeneratePayload({
        mode: "window",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        targetMonth: "2026-07",
      }),
    ).toEqual({
      mode: "window",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      replaceExistingCandidates: true,
    });
  });
});
