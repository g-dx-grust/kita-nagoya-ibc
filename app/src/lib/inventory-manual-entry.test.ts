import { describe, expect, it } from "vitest";
import { MOVEMENT_TYPE } from "./inventory-types";
import { resolveManualMovement } from "./inventory-manual-entry";

describe("resolveManualMovement", () => {
  it("入庫は正の数量で inbound", () => {
    expect(resolveManualMovement({ kind: "inbound", quantity: 12 })).toEqual({
      movementType: MOVEMENT_TYPE.INBOUND,
      quantity: 12,
    });
  });

  it("入庫は絶対値を取る(負入力でも加算)", () => {
    expect(resolveManualMovement({ kind: "inbound", quantity: -5 }).quantity).toBe(5);
  });

  it("出庫は負の数量で shipment_out", () => {
    expect(resolveManualMovement({ kind: "shipment", quantity: 8 })).toEqual({
      movementType: MOVEMENT_TYPE.SHIPMENT_OUT,
      quantity: -8,
    });
  });

  it("棚卸調整は increase で加算", () => {
    expect(
      resolveManualMovement({ kind: "adjustment", quantity: 3, direction: "increase" }),
    ).toEqual({ movementType: MOVEMENT_TYPE.ADJUSTMENT, quantity: 3 });
  });

  it("棚卸調整は decrease で減算", () => {
    expect(
      resolveManualMovement({ kind: "adjustment", quantity: 3, direction: "decrease" }),
    ).toEqual({ movementType: MOVEMENT_TYPE.ADJUSTMENT, quantity: -3 });
  });

  it("棚卸調整は direction 未指定なら増加扱い", () => {
    expect(resolveManualMovement({ kind: "adjustment", quantity: 4 }).quantity).toBe(4);
  });

  it("期首在庫は 目標 − 現在確定 の差分を計上", () => {
    expect(
      resolveManualMovement({ kind: "opening", quantity: 100, currentConfirmed: 30 }),
    ).toEqual({ movementType: MOVEMENT_TYPE.OPENING, quantity: 70 });
  });

  it("期首在庫は現在が多ければ負の差分", () => {
    expect(
      resolveManualMovement({ kind: "opening", quantity: 20, currentConfirmed: 50 }).quantity,
    ).toBe(-30);
  });

  it("期首在庫は currentConfirmed 未指定なら目標そのもの", () => {
    expect(resolveManualMovement({ kind: "opening", quantity: 40 }).quantity).toBe(40);
  });

  it("差分計算の浮動小数ノイズを丸めて除去する", () => {
    // 100.1 - 0.2 は 99.90000000000001 になるため round4 で 99.9 に正規化される。
    expect(
      resolveManualMovement({ kind: "opening", quantity: 100.1, currentConfirmed: 0.2 }).quantity,
    ).toBe(99.9);
  });
});
