import { describe, expect, it } from "vitest";
import { computeAssignablePeople, isValidTimeRange, timeRangesOverlap } from "./schedule";

describe("schedule helpers", () => {
  it("detects overlapping time ranges", () => {
    expect(
      timeRangesOverlap(
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "11:30", endTime: "14:00" },
      ),
    ).toBe(true);
  });

  it("treats adjacent ranges as non-overlapping", () => {
    expect(
      timeRangesOverlap(
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "12:00", endTime: "15:00" },
      ),
    ).toBe(false);
  });

  it("validates start before end", () => {
    expect(isValidTimeRange({ startTime: "09:00", endTime: "17:00" })).toBe(true);
    expect(isValidTimeRange({ startTime: "17:00", endTime: "09:00" })).toBe(false);
  });

  it("caps assigned people by room master max while using available staff", () => {
    expect(computeAssignablePeople({ roomMaxPeople: 4, standardPeople: 1, availablePeople: 8 })).toBe(4);
    expect(computeAssignablePeople({ roomMaxPeople: 6, standardPeople: 1, availablePeople: 3 })).toBe(3);
    expect(computeAssignablePeople({ roomMaxPeople: 4, standardPeople: 1, availablePeople: 0 })).toBe(4);
  });
});
