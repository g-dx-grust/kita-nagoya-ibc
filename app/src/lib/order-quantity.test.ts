import { describe, expect, it } from "vitest";
import { roundOrderQuantity } from "./order-quantity";

describe("roundOrderQuantity", () => {
  it("ロット・最小がない場合は不足量をそのまま返す", () => {
    expect(roundOrderQuantity(37, {})).toBe(37);
    expect(roundOrderQuantity(37, { orderLotQty: null, minOrderQty: null })).toBe(37);
  });

  it("0以下の不足量は0(発注不要)", () => {
    expect(roundOrderQuantity(0, { orderLotQty: 10 })).toBe(0);
    expect(roundOrderQuantity(-5, { orderLotQty: 10, minOrderQty: 10 })).toBe(0);
  });

  it("ロットの倍数に切り上げる", () => {
    // 37 → 次の10の倍数 = 40
    expect(roundOrderQuantity(37, { orderLotQty: 10 })).toBe(40);
  });

  it("ちょうど倍数の場合はそのまま(余分に切り上げない)", () => {
    expect(roundOrderQuantity(40, { orderLotQty: 10 })).toBe(40);
    expect(roundOrderQuantity(20, { orderLotQty: 20 })).toBe(20);
  });

  it("最小発注量を下回る場合は最小まで引き上げる", () => {
    expect(roundOrderQuantity(3, { minOrderQty: 10 })).toBe(10);
    // 最小を上回る不足はそのまま
    expect(roundOrderQuantity(15, { minOrderQty: 10 })).toBe(15);
  });

  it("ロットと最小の両方が設定されている場合は両制約を満たす", () => {
    // 不足3, ロット10, 最小25 → 25以上かつ10の倍数 = 30
    expect(roundOrderQuantity(3, { orderLotQty: 10, minOrderQty: 25 })).toBe(30);
    // 不足37, ロット10, 最小25 → 37を10の倍数へ = 40(最小25は既に満たす)
    expect(roundOrderQuantity(37, { orderLotQty: 10, minOrderQty: 25 })).toBe(40);
    // 不足12, ロット5, 最小20 → 12→15(ロット)、最小20未満なので20、20は5の倍数 = 20
    expect(roundOrderQuantity(12, { orderLotQty: 5, minOrderQty: 20 })).toBe(20);
  });

  it("浮動小数の不足でも余分に切り上がらない", () => {
    // 30.0000001 のような誤差は1ロット余分に切り上げない想定だが、実不足が超えていれば切り上げる
    expect(roundOrderQuantity(30, { orderLotQty: 10 })).toBe(30);
    expect(roundOrderQuantity(30.5, { orderLotQty: 10 })).toBe(40);
  });
});
