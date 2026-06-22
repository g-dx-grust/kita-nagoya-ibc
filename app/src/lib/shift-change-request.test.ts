import { describe, expect, it } from "vitest";
import {
  diffShiftChangeDays,
  normalizeShiftChangeDays,
  serializeShiftChangeDays,
} from "./shift-change-request";

describe("shift change request helpers", () => {
  it("normalizes duplicate days with the latest entry and stable ordering", () => {
    expect(
      normalizeShiftChangeDays([
        { day: 3, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
        { day: 1, startTime: "08:30", endTime: "16:30", breakMinutes: 45 },
        { day: 3, startTime: "10:00", endTime: "18:00", breakMinutes: 60 },
      ]),
    ).toEqual([
      { day: 1, startTime: "08:30", endTime: "16:30", breakMinutes: 45 },
      { day: 3, startTime: "10:00", endTime: "18:00", breakMinutes: 60 },
    ]);
  });

  it("detects added, removed, and time-changed shift days", () => {
    expect(
      diffShiftChangeDays(
        [
          { day: 1, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
          { day: 2, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
          { day: 3, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
        ],
        [
          { day: 2, startTime: "09:30", endTime: "17:00", breakMinutes: 60 },
          { day: 3, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
          { day: 4, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
        ],
      ),
    ).toEqual({
      addedDays: [4],
      removedDays: [1],
      changedDays: [2],
      hasChanges: true,
    });
  });

  it("serializes equivalent day sets to the same value", () => {
    const a = serializeShiftChangeDays([
      { day: 2, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
      { day: 1, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
    ]);
    const b = serializeShiftChangeDays([
      { day: 1, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
      { day: 2, startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
    ]);
    expect(a).toBe(b);
  });
});
