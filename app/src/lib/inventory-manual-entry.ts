import { MOVEMENT_TYPE } from "./inventory-types";

// 管理者が在庫を手入力するときの「区分」。
// - inbound    : 入庫(＋加算)。実入荷をそのまま在庫へ。賞味期限/出荷期限の主な入力元。
// - shipment   : 出庫/出荷(−減算)。出荷・廃棄など在庫を直接減らす。
// - adjustment : 棚卸調整(±)。差異補正。direction(increase/decrease)で符号を決める。
// - opening    : 期首/初期在庫。入力値を「その時点の目標在庫(絶対値)」として扱い、
//                指定日時点の確定在庫との差分を計上する。
export const MANUAL_ENTRY_KINDS = ["inbound", "shipment", "adjustment", "opening"] as const;
export type ManualEntryKind = (typeof MANUAL_ENTRY_KINDS)[number];

export type ManualEntryDirection = "increase" | "decrease";

export type ResolveManualMovementInput = {
  kind: ManualEntryKind;
  // 入力数量。inbound/shipment/adjustment は絶対量(>0)。opening は目標在庫(絶対値, >=0)。
  quantity: number;
  // adjustment のときの増減方向。
  direction?: ManualEntryDirection;
  // opening のときに差分計算に使う「指定日時点の確定在庫」。
  currentConfirmed?: number;
};

export type ResolvedManualMovement = {
  // StockMovement.movementType に書く値。
  movementType: string;
  // StockMovement.quantity に書く符号付き値(＋入庫/−出庫)。
  quantity: number;
};

// 区分・入力値から、台帳へ書く movementType と符号付き quantity を決める純関数。
// 計算はここに集約し、API/UI からは結果だけを使う(CLAUDE.md: 計算式はユニットテスト化)。
export function resolveManualMovement(input: ResolveManualMovementInput): ResolvedManualMovement {
  const magnitude = Math.abs(input.quantity);
  switch (input.kind) {
    case "inbound":
      return { movementType: MOVEMENT_TYPE.INBOUND, quantity: round4(magnitude) };
    case "shipment":
      return { movementType: MOVEMENT_TYPE.SHIPMENT_OUT, quantity: round4(-magnitude) };
    case "adjustment": {
      const sign = input.direction === "decrease" ? -1 : 1;
      return { movementType: MOVEMENT_TYPE.ADJUSTMENT, quantity: round4(sign * magnitude) };
    }
    case "opening": {
      // 目標在庫 − 現在の確定在庫 = 計上すべき差分。
      const target = input.quantity;
      const current = input.currentConfirmed ?? 0;
      return { movementType: MOVEMENT_TYPE.OPENING, quantity: round4(target - current) };
    }
  }
}

export function manualEntryKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "inbound":
      return "入庫";
    case "shipment":
      return "出庫/出荷";
    case "adjustment":
      return "棚卸調整";
    case "opening":
      return "期首/初期在庫";
    default:
      return kind || "—";
  }
}

// movementType(台帳に保存済みの値)から手入力区分の表示名を引く。
// 一覧表示で「入庫/出庫/調整/期首」を区別するために使う。
export function movementTypeManualLabel(movementType: string | null | undefined): string {
  switch (movementType) {
    case MOVEMENT_TYPE.INBOUND:
      return "入庫";
    case MOVEMENT_TYPE.SHIPMENT_OUT:
      return "出庫/出荷";
    case MOVEMENT_TYPE.ADJUSTMENT:
      return "棚卸調整";
    case MOVEMENT_TYPE.OPENING:
      return "期首/初期在庫";
    default:
      return movementType || "—";
  }
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
