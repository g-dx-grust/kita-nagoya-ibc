// 発注ロット丸めユーティリティ(純粋関数)。
//
// 方針: 不足量(基本単位の生数値)を、品目マスターの発注ロット(orderLotQty)と
// 最小発注量(minOrderQty)に合わせて実発注量へ丸める。
//   - orderLotQty が設定されていれば、その倍数まで「切り上げ」る。
//   - minOrderQty が設定されていれば、最終的にこの量を下回らないよう引き上げる。
// どちらも未設定なら不足量をそのまま返す。
// ケース表記とは無関係(在庫台帳・原価・BOM計算には影響しない発注量の決定のみ)。

const EPSILON = 1e-9;

export type OrderLotOptions = {
  /** 1ロットあたりの基本単位数。設定時はこの倍数へ切り上げる。 */
  orderLotQty?: number | null;
  /** 最小発注量。最終発注量はこれを下回らない。 */
  minOrderQty?: number | null;
};

/**
 * 不足量を発注ロット/最小発注量に合わせて実発注量へ丸める(切り上げ→最小クランプ)。
 * shortage が 0 以下の場合は 0 を返す(発注不要)。
 */
export function roundOrderQuantity(shortage: number, opts: OrderLotOptions = {}): number {
  if (!Number.isFinite(shortage) || shortage <= 0) return 0;

  let quantity = shortage;

  const lot = opts.orderLotQty;
  if (lot != null && lot > 0) {
    // 浮動小数の誤差で1ロット余分に切り上がらないよう EPSILON を引いてから ceil する。
    const lots = Math.ceil(quantity / lot - EPSILON);
    quantity = round4(lots * lot);
  }

  const min = opts.minOrderQty;
  if (min != null && min > 0 && quantity < min) {
    quantity = min;
    // 最小発注量がロットの倍数でない場合でも、ロット制約を満たすよう再度切り上げる。
    if (lot != null && lot > 0) {
      const lots = Math.ceil(quantity / lot - EPSILON);
      quantity = round4(lots * lot);
    }
  }

  return round4(quantity);
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
