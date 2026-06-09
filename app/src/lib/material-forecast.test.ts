import { describe, expect, it } from "vitest";
import { buildMaterialForecast } from "./material-forecast";

describe("buildMaterialForecast", () => {
  it("複数予定を日付順に累積して不足を検出する", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "raw_material:rm1": 100 },
      inbounds: [],
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-05-20",
          sortKey: "09:00",
          itemType: "raw_material",
          itemId: "rm1",
          itemName: "原料X",
          unit: "kg",
          plannedQuantity: 60,
        },
        {
          requirementId: "r2",
          productionPlanId: "p2",
          date: "2026-05-21",
          sortKey: "09:00",
          itemType: "raw_material",
          itemId: "rm1",
          itemName: "原料X",
          unit: "kg",
          plannedQuantity: 60,
        },
      ],
    });

    expect(lines[0].shortageType).toBe("none");
    expect(lines[1].shortageQuantity).toBe(20);
    expect(lines[1].shortageType).toBe("hard_shortage");
  });

  it("未確定入荷だけで足りる場合は未確定依存にする", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "packaging:pk1": 20 },
      inbounds: [
        {
          itemType: "packaging",
          itemId: "pk1",
          date: "2026-05-20",
          quantity: 40,
          status: "ordered_unconfirmed",
        },
      ],
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-05-21",
          sortKey: "09:00",
          itemType: "packaging",
          itemId: "pk1",
          itemName: "標準袋",
          unit: "枚",
          plannedQuantity: 50,
        },
      ],
    });

    expect(lines[0].shortageQuantity).toBe(30);
    expect(lines[0].shortageType).toBe("unconfirmed_dependency");
  });

  it("安全在庫を渡さない場合は従来どおりの判定", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "raw_material:rm1": 100 },
      inbounds: [],
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-05-20",
          sortKey: "09:00",
          itemType: "raw_material",
          itemId: "rm1",
          itemName: "原料X",
          unit: "kg",
          plannedQuantity: 80,
        },
      ],
    });

    // 在庫100 ≥ 所要80、安全在庫なし → 不足なし
    expect(lines[0].shortageType).toBe("none");
    expect(lines[0].shortageQuantity).toBe(0);
    expect(lines[0].safetyStock).toBe(0);
  });

  it("所要は確定在庫で賄えるが安全在庫を割り込むと below_safety 早期警告になる", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "raw_material:rm1": 100 },
      inbounds: [],
      safetyByItemKey: { "raw_material:rm1": 30 },
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-05-20",
          sortKey: "09:00",
          itemType: "raw_material",
          itemId: "rm1",
          itemName: "原料X",
          unit: "kg",
          plannedQuantity: 80,
        },
      ],
    });

    // 確定在庫100 ≥ 所要80(作れる) だが 使用後20 < 安全在庫30 → 早期警告
    // effectiveThreshold = 80 + 30 = 110、不足 = 110 - 100 = 10
    expect(lines[0].shortageType).toBe("below_safety");
    expect(lines[0].shortageQuantity).toBe(10);
    expect(lines[0].safetyStock).toBe(30);
  });

  it("安全在庫があっても確定在庫が素の所要量に届かなければ hard_shortage", () => {
    const lines = buildMaterialForecast({
      openingByItemKey: { "raw_material:rm1": 50 },
      inbounds: [],
      safetyByItemKey: { "raw_material:rm1": 30 },
      requirements: [
        {
          requirementId: "r1",
          productionPlanId: "p1",
          date: "2026-05-20",
          sortKey: "09:00",
          itemType: "raw_material",
          itemId: "rm1",
          itemName: "原料X",
          unit: "kg",
          plannedQuantity: 80,
        },
      ],
    });

    // 確定在庫50 < 所要80 → hard_shortage、不足は安全在庫込み = (80+30)-50 = 60
    expect(lines[0].shortageType).toBe("hard_shortage");
    expect(lines[0].shortageQuantity).toBe(60);
    expect(lines[0].safetyStock).toBe(30);
  });
});
