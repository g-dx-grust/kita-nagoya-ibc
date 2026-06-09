import { describe, expect, it } from "vitest";
import { parseCsvWithHeader, toCsv } from "./csv";

describe("parseCsvWithHeader", () => {
  it("parses headers and rows, handling quoted commas and newlines", () => {
    const csv = `product_code,name,note
P001,商品A,"備考、カンマあり"
P002,"改行\nあり",ok`;
    const { header, rows } = parseCsvWithHeader(csv);
    expect(header).toEqual(["product_code", "name", "note"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toBe("備考、カンマあり");
    expect(rows[1].name).toBe("改行\nあり");
  });

  it("skips empty rows and strips BOM", () => {
    const csv = "﻿code,name\n,\nP001,A\n";
    const { rows } = parseCsvWithHeader(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("P001");
  });
});

describe("toCsv", () => {
  it("quotes fields containing comma or quote", () => {
    const out = toCsv(["a", "b"], [["x", 'y "z"'], ["with,comma", null]]);
    expect(out).toContain('"y ""z"""');
    expect(out).toContain('"with,comma"');
  });
});
