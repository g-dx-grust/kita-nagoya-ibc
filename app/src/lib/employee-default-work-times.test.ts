import { describe, expect, it } from "vitest";
import {
  changedEmployeeDefaultWorkTimes,
  groupEmployeeDefaultWorkTimes,
} from "./employee-default-work-times";

describe("changedEmployeeDefaultWorkTimes", () => {
  it("keeps only rows whose default work time changed", () => {
    expect(
      changedEmployeeDefaultWorkTimes(
        [
          { employeeId: "e1", startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
          { employeeId: "e2", startTime: "08:30", endTime: "17:30", breakMinutes: 60 },
        ],
        [
          {
            id: "e1",
            defaultStartTime: "09:00",
            defaultEndTime: "17:00",
            defaultBreakMinutes: 60,
          },
          {
            id: "e2",
            defaultStartTime: "09:00",
            defaultEndTime: "17:00",
            defaultBreakMinutes: 60,
          },
        ],
      ),
    ).toEqual([{ employeeId: "e2", startTime: "08:30", endTime: "17:30", breakMinutes: 60 }]);
  });
});

describe("groupEmployeeDefaultWorkTimes", () => {
  it("groups rows with the same default work time for updateMany", () => {
    const groups = groupEmployeeDefaultWorkTimes([
      { employeeId: "e1", startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
      { employeeId: "e2", startTime: "09:00", endTime: "17:00", breakMinutes: 60 },
      { employeeId: "e3", startTime: "10:00", endTime: "16:00", breakMinutes: 45 },
    ]);

    expect(groups.map((group) => group.map((row) => row.employeeId))).toEqual([
      ["e1", "e2"],
      ["e3"],
    ]);
  });
});
