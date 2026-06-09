import { describe, expect, it } from "vitest";
import { computeUrgency } from "./purchase-order-urgency";

const asOfDate = new Date("2026-05-28T09:00:00.000Z");

describe("computeUrgency", () => {
  it.each([
    ["today", "2026-05-28T00:00:00.000Z", "CRITICAL"],
    ["yesterday", "2026-05-27T00:00:00.000Z", "CRITICAL"],
    ["tomorrow", "2026-05-29T00:00:00.000Z", "CRITICAL"],
    ["two days later", "2026-05-30T00:00:00.000Z", "WARNING"],
    ["seven days later", "2026-06-04T00:00:00.000Z", "WARNING"],
    ["eight days later", "2026-06-05T00:00:00.000Z", "INFO"],
    ["large future", "2026-07-01T00:00:00.000Z", "INFO"],
  ])("%s is %s", (_label, requiredOrderDate, expected) => {
    expect(computeUrgency({ requiredOrderDate: new Date(requiredOrderDate), asOfDate })).toBe(expected);
  });

  it("returns NONE when requiredOrderDate is null", () => {
    expect(computeUrgency({ requiredOrderDate: null, asOfDate })).toBe("NONE");
  });
});
