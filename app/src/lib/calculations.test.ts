import { describe, expect, it } from "vitest";
import {
  addWorkingMinutesSkippingBreaks,
  computeCostEstimate,
  computeMaterialRequirements,
  computeMaxQuantityInTimeWindow,
  computeProductionDuration,
  computeQuantityWithinTimeWindow,
  computeRequiredPeople,
  computeUnitsPerPersonHourFromLaborUnitPrice,
} from "./calculations";

// Acceptance test inputs are drawn from docs/14_acceptance_tests.md.

describe("computeProductionDuration", () => {
  it("数量固定モード: 1000袋, 5人, 100袋/人時, 9時開始 → 休憩にかからず11:00終了", () => {
    const r = computeProductionDuration({
      quantity: 1000,
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "09:00",
    });
    expect(r.workingMinutes).toBe(120);
    expect(r.blockedMinutes).toBe(0);
    expect(r.requiredMinutes).toBe(120);
    expect(r.endTime).toBe("11:00");
    expect(r.overtimeMinutes).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it("昼休憩と15時休憩をまたぐ場合は作業不可時間を飛ばして終了時刻を出す", () => {
    const r = computeProductionDuration({
      quantity: 4500,
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "09:00",
    });
    expect(r.workingMinutes).toBe(540);
    expect(r.blockedMinutes).toBe(75);
    expect(r.endTime).toBe("19:15");
    expect(r.overtimeMinutes).toBe(135);
    expect(r.warnings).toContain("exceeds_baseline_end");
  });

  it("昼休憩直前から始まる作業は12-13時を作業時間に含めない", () => {
    const r = computeProductionDuration({
      quantity: 1000,
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "11:30",
    });
    expect(r.workingMinutes).toBe(120);
    expect(r.blockedMinutes).toBe(60);
    expect(r.endTime).toBe("14:30");
  });

  it("人数0で警告を返し計算を中止する", () => {
    const r = computeProductionDuration({
      quantity: 100,
      unitsPerPersonHour: 100,
      peopleCount: 0,
      startTime: "09:00",
    });
    expect(r.warnings).toContain("non_positive_people");
    expect(r.endTime).toBe("09:00");
  });

  it("48時間を超える長時間予定でも落ちずに残業時間を返す", () => {
    const r = computeProductionDuration({
      quantity: 10000,
      unitsPerPersonHour: 100,
      peopleCount: 1,
      startTime: "09:00",
    });
    expect(r.endTime).toBe("115:15");
    expect(r.blockedMinutes).toBe(375);
    expect(r.overtimeMinutes).toBe(5895);
    expect(r.warnings).toContain("exceeds_baseline_end");
  });
});

describe("addWorkingMinutesSkippingBreaks", () => {
  it("休憩開始ちょうどに終わる場合は休憩を足さない", () => {
    expect(addWorkingMinutesSkippingBreaks("09:00", 180)).toBe("12:00");
  });

  it("休憩中に開始された場合は休憩明けから作業時間を数える", () => {
    expect(addWorkingMinutesSkippingBreaks("12:30", 30)).toBe("13:30");
  });
});

describe("computeMaxQuantityInTimeWindow", () => {
  it("時間枠固定モード: 9-17時は固定休憩75分を除き、5人, 100袋/人時 → 3375袋", () => {
    const r = computeMaxQuantityInTimeWindow({
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(r.blockedMinutes).toBe(75);
    expect(r.workingHours).toBe(6.75);
    expect(r.maxQuantity).toBe(3375);
  });

  it("要求数量があふれる場合 overflowQuantity を返す", () => {
    const r = computeMaxQuantityInTimeWindow({
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "09:00",
      endTime: "17:00",
      requestedQuantity: 4000,
    });
    expect(r.overflowQuantity).toBe(625);
  });
});

describe("computeQuantityWithinTimeWindow", () => {
  it("指定数量が時間枠内に収まる場合は実所要時間の終了時刻へ縮める", () => {
    const r = computeQuantityWithinTimeWindow({
      quantity: 1000,
      unitsPerPersonHour: 162.8664,
      peopleCount: 4,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(r.plannedQuantity).toBe(1000);
    expect(r.workingMinutes).toBe(93);
    expect(r.endTime).toBe("10:33");
    expect(r.usedFullWindow).toBe(false);
    expect(r.overflowQuantity).toBe(0);
  });

  it("指定数量が時間枠に収まらない場合は枠内の最大数量に丸める", () => {
    const r = computeQuantityWithinTimeWindow({
      quantity: 4000,
      unitsPerPersonHour: 100,
      peopleCount: 5,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(r.plannedQuantity).toBe(3375);
    expect(r.overflowQuantity).toBe(625);
    expect(r.endTime).toBe("17:00");
    expect(r.usedFullWindow).toBe(true);
  });
});

describe("computeRequiredPeople", () => {
  it("9-17, 100袋/人時, 固定休憩75分, 要求1400袋 → 1人6.75時間なので3人必要", () => {
    const r = computeRequiredPeople({
      quantity: 1400,
      unitsPerPersonHour: 100,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(r.workingHours).toBe(6.75);
    expect(r.requiredPeople).toBe(3);
    expect(r.candidates.find((c) => c.people === 3)?.overtimeMinutes).toBe(0);
  });

  it("利用可能人数より必要人数が多いと shortagePeople を返す", () => {
    const r = computeRequiredPeople({
      quantity: 3000,
      unitsPerPersonHour: 100,
      startTime: "09:00",
      endTime: "17:00",
      availablePeople: 2,
    });
    expect(r.requiredPeople).toBeGreaterThan(2);
    expect(r.shortagePeople).toBeGreaterThan(0);
  });
});

describe("computeUnitsPerPersonHourFromLaborUnitPrice", () => {
  it("1袋手間賃から1500円時給換算の袋/人時を計算する", () => {
    expect(
      computeUnitsPerPersonHourFromLaborUnitPrice({
        laborUnitPrice: 12,
      }),
    ).toBe(125);
  });

  it("小数の手間賃は4桁丸めで返す", () => {
    expect(
      computeUnitsPerPersonHourFromLaborUnitPrice({
        laborUnitPrice: 19.11,
      }),
    ).toBe(78.4929);
    expect(
      computeUnitsPerPersonHourFromLaborUnitPrice({
        laborUnitPrice: 9.21,
      }),
    ).toBe(162.8664);
  });

  it("手間賃または時給が0以下なら0を返す", () => {
    expect(
      computeUnitsPerPersonHourFromLaborUnitPrice({
        laborUnitPrice: 0,
      }),
    ).toBe(0);
    expect(
      computeUnitsPerPersonHourFromLaborUnitPrice({
        laborUnitPrice: 12,
        hourlyLaborRate: 0,
      }),
    ).toBe(0);
  });
});

describe("computeMaterialRequirements", () => {
  const bom = [
    {
      itemType: "raw_material" as const,
      itemId: "rm-x",
      itemName: "原料X",
      unit: "kg",
      quantityPerUnit: 0.05, // 50g per piece
      lossRate: 0,
      unitPrice: 200,
    },
  ];

  it("原料不足アラート: 必要50kg, 現在庫20kg, 確定入荷0 → 不足30kg, hard_shortage", () => {
    const out = computeMaterialRequirements({
      quantity: 1000,
      bom,
      inventory: { "rm-x": { onHand: 20, confirmedInbound: 0, unconfirmedInbound: 0 } },
    });
    expect(out[0].plannedQuantity).toBe(50);
    expect(out[0].shortageQuantity).toBe(30);
    expect(out[0].shortageType).toBe("hard_shortage");
  });

  it("未確定発注依存: 現在庫20kg, 必要50kg, 未確定入荷40kg → unconfirmed_dependency", () => {
    const out = computeMaterialRequirements({
      quantity: 1000,
      bom,
      inventory: { "rm-x": { onHand: 20, confirmedInbound: 0, unconfirmedInbound: 40 } },
    });
    expect(out[0].shortageQuantity).toBe(30);
    expect(out[0].shortageType).toBe("unconfirmed_dependency");
  });

  it("十分な在庫なら shortageType=none", () => {
    const out = computeMaterialRequirements({
      quantity: 1000,
      bom,
      inventory: { "rm-x": { onHand: 100, confirmedInbound: 0, unconfirmedInbound: 0 } },
    });
    expect(out[0].shortageQuantity).toBe(0);
    expect(out[0].shortageType).toBe("none");
  });

  it("ロス率を加算する", () => {
    const out = computeMaterialRequirements({
      quantity: 1000,
      bom: [{ ...bom[0], lossRate: 0.1 }],
      inventory: {},
    });
    expect(out[0].plannedQuantity).toBe(55); // 50 * 1.1
  });
});

describe("computeCostEstimate", () => {
  it("Phase 5 請求例: 数量5640, 単価12 → 67,680円", () => {
    const r = computeCostEstimate({
      quantity: 5640,
      billingUnitPrice: 12,
      materialCost: 0,
      packagingCost: 0,
    });
    expect(r.revenueEstimate).toBe(67680);
    expect(r.laborCost).toBe(67680);
    expect(r.totalCost).toBe(67680);
  });
});
