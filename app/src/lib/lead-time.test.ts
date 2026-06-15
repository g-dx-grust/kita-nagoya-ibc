import { describe, expect, it } from "vitest";
import { parseLeadTimeDays } from "./lead-time";

describe("parseLeadTimeDays", () => {
  it("parses Excel lead time expressions with full-width digits", () => {
    expect(parseLeadTimeDays("中２日")).toBe(2);
    expect(parseLeadTimeDays("中１０日")).toBe(10);
    expect(parseLeadTimeDays("２週間")).toBe(14);
    expect(parseLeadTimeDays("１か月")).toBe(30);
  });

  it("keeps notes after a leading duration", () => {
    expect(parseLeadTimeDays("中２日　本社から支給")).toBe(2);
  });

  it("does not treat locations or ordering deadlines as lead time days", () => {
    expect(parseLeadTimeDays("北名古屋")).toBeNull();
    expect(parseLeadTimeDays("本社→北名古屋")).toBeNull();
    expect(parseLeadTimeDays("次月分 毎月10日まで")).toBeNull();
    expect(parseLeadTimeDays("")).toBeNull();
  });
});
