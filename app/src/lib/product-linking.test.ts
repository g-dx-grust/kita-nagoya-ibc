import { describe, expect, it } from "vitest";
import {
  buildClassificationPackagingComponents,
  inferPackagingKind,
  splitPackagingText,
  stableClassificationPackagingCode,
} from "./product-linking";

describe("product-linking", () => {
  it("splits bag and tray components while skipping empty tray markers", () => {
    expect(splitPackagingText("金袋 中 180ｘ280、トレー無")).toEqual(["金袋 中 180x280", "トレー無"]);

    const { components } = buildClassificationPackagingComponents({
      bagTrayName: "金袋 中 180ｘ280、トレー無",
      cartonName: null,
    });

    expect(components).toMatchObject([
      {
        source: "bag_tray",
        name: "金袋 中 180x280",
        kind: "bag",
        quantityPerUnit: 1,
      },
    ]);
  });

  it("calculates carton quantity per product unit from case pack quantity", () => {
    const { components } = buildClassificationPackagingComponents({
      cartonName: "KS-1",
      casePackQty: 20,
    });

    expect(components).toMatchObject([
      {
        source: "carton",
        name: "KS-1",
        kind: "carton",
        quantityPerUnit: 0.05,
      },
    ]);
  });

  it("does not invent a carton quantity without case pack quantity", () => {
    const { components, issues } = buildClassificationPackagingComponents({
      cartonName: "KS-1",
      casePackQty: null,
    });

    expect(components).toHaveLength(0);
    expect(issues).toContainEqual({
      source: "carton",
      value: "KS-1",
      reason: "carton_without_case_pack_qty",
    });
  });

  it("uses a named seal from notes when only a seal count is present", () => {
    const { components } = buildClassificationPackagingComponents({
      sealCount: 2,
      classificationNote: "和紙シール",
    });

    expect(components).toMatchObject([
      {
        source: "seal",
        name: "和紙シール",
        kind: "other",
        quantityPerUnit: 2,
      },
    ]);
  });

  it("keeps generated packaging codes stable across width variants", () => {
    expect(stableClassificationPackagingCode("バイタロン 100")).toBe(
      stableClassificationPackagingCode("ﾊﾞｲﾀﾛﾝ　100"),
    );
  });

  it("infers common packaging kinds", () => {
    expect(inferPackagingKind("バイタロン 250", "accessory")).toBe("desiccant");
    expect(inferPackagingKind("三方無地袋 200×310", "bag_tray")).toBe("bag");
    expect(inferPackagingKind("KS-1", "carton")).toBe("carton");
    expect(inferPackagingKind("TM-204", "bag_tray")).toBe("other");
    expect(inferPackagingKind("バリア静防 No.4", "bag_tray")).toBe("bag");
    expect(inferPackagingKind("しいたけNO.9トレー", "bag_tray")).toBe("other");
    expect(inferPackagingKind("No.16", "accessory")).toBe("desiccant");
  });
});
