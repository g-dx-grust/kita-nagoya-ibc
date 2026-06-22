import { describe, expect, it } from "vitest";
import { filterSelectedSchedulePlans, summarizeScheduleSelection } from "./auto-schedule-selection";

const plans = [
  { tempId: "preview-1", quantity: 100 },
  { tempId: "preview-2", quantity: 200 },
  { tempId: "preview-3", quantity: 300 },
];

describe("auto schedule day selection", () => {
  it("keeps all preview plans when no selection is provided", () => {
    expect(filterSelectedSchedulePlans(plans).map((plan) => plan.tempId)).toEqual([
      "preview-1",
      "preview-2",
      "preview-3",
    ]);
  });

  it("keeps only the plans selected for the day", () => {
    expect(filterSelectedSchedulePlans(plans, ["preview-1", "preview-3"]).map((plan) => plan.tempId)).toEqual([
      "preview-1",
      "preview-3",
    ]);
  });

  it("summarizes selected and excluded plans", () => {
    expect(summarizeScheduleSelection(plans, ["preview-2"])).toEqual({
      totalCount: 3,
      selectedCount: 1,
      excludedCount: 2,
      selectedQuantity: 200,
    });
  });
});
