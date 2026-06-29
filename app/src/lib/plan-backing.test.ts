import { describe, expect, it } from "vitest";
import { evaluatePlanBackingFromLines } from "./plan-backing";

describe("evaluatePlanBackingFromLines", () => {
  it("below_safety は仮確定・確定を妨げない", () => {
    const result = evaluatePlanBackingFromLines({
      planId: "plan-1",
      lines: [
        {
          requirementId: "req-1",
          productionPlanId: "plan-1",
          itemType: "raw_material",
          itemId: "rm-1",
          itemName: "原料A",
          plannedQuantity: 80,
          onHandBefore: 100,
          shortageType: "below_safety",
        },
      ],
    });

    expect(result.canTentativeConfirm).toBe(true);
    expect(result.canConfirm).toBe(true);
    expect(result.blockingRequirements).toHaveLength(0);
  });

  it("未確定入荷依存は仮確定できるが確定できない", () => {
    const result = evaluatePlanBackingFromLines({
      planId: "plan-1",
      backingPurchaseOrderIds: ["po-1"],
      lines: [
        {
          requirementId: "req-1",
          productionPlanId: "plan-1",
          itemType: "packaging",
          itemId: "pk-1",
          itemName: "資材A",
          plannedQuantity: 50,
          onHandBefore: 20,
          shortageType: "unconfirmed_dependency",
        },
      ],
    });

    expect(result.canTentativeConfirm).toBe(true);
    expect(result.canConfirm).toBe(false);
    expect(result.blockingRequirements[0]).toMatchObject({
      requirementId: "req-1",
      shortageType: "unconfirmed_dependency",
    });
    expect(result.backingPurchaseOrderIds).toEqual(["po-1"]);
  });

  it("hard_shortage は仮確定も確定もできない", () => {
    const result = evaluatePlanBackingFromLines({
      planId: "plan-1",
      lines: [
        {
          requirementId: "req-1",
          productionPlanId: "plan-1",
          itemType: "raw_material",
          itemId: "rm-1",
          itemName: "原料A",
          plannedQuantity: 50,
          onHandBefore: 10,
          shortageType: "hard_shortage",
        },
      ],
    });

    expect(result.canTentativeConfirm).toBe(false);
    expect(result.canConfirm).toBe(false);
    expect(result.blockingRequirements[0]).toMatchObject({
      requirementId: "req-1",
      shortageType: "hard_shortage",
    });
  });

  it("requirement 0件は仮確定も確定もできない", () => {
    const result = evaluatePlanBackingFromLines({
      planId: "plan-1",
      lines: [],
    });

    expect(result.canTentativeConfirm).toBe(false);
    expect(result.canConfirm).toBe(false);
    expect(result.blockingRequirements).toEqual([
      expect.objectContaining({
        reason: "BOM未登録または所要量未計算です。",
      }),
    ]);
  });
});
