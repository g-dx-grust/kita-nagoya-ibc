// 生産スケジュール自動作成（時間枠固定→最大数量）の部屋割り当て補助。
//
// 商品を社内部屋へ「均等に」配分してから当日エンジン (allocateDayStaff) に渡すことで、
// 出勤者を複数部屋へ並行配置し、作業の終わった人を別部屋へ合流させる。商品を1件ずつ
// 終業まで占有して後半の商品が無人になる従来方式の遊休・大量不足を解消する。
//
// ここは純関数のみ。DB/HTTP は持ち込まない。

/**
 * 商品(items)を、各商品が使える部屋候補(candidatesByTempId, 希望順)から
 * 「現在の割り当て商品数が最も少ない部屋」を選んで配分する。
 * 同数のときは候補リストの先頭（＝標準/既定部屋）を優先する。
 * これにより、商品が既定部屋に偏らず複数部屋へ散らばり、出勤者を並行稼働できる。
 */
export function assignBalancedRooms<C extends { workAreaId: string }>(
  items: { tempId: string }[],
  candidatesByTempId: Map<string, C[]>,
  forcedRoomByTempId?: Map<string, string>,
): Map<string, C> {
  const load = new Map<string, number>();
  const chosen = new Map<string, C>();

  for (const item of items) {
    const candidates = candidatesByTempId.get(item.tempId);
    if (!candidates || candidates.length === 0) continue;

    const forcedRoomId = forcedRoomByTempId?.get(item.tempId);
    let pick: C | undefined;
    if (forcedRoomId) {
      pick = candidates.find((c) => c.workAreaId === forcedRoomId);
    }
    if (!pick) {
      let bestLoad = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const l = load.get(candidate.workAreaId) ?? 0;
        if (l < bestLoad) {
          bestLoad = l;
          pick = candidate;
        }
      }
    }
    if (!pick) continue;

    chosen.set(item.tempId, pick);
    load.set(pick.workAreaId, (load.get(pick.workAreaId) ?? 0) + 1);
  }

  return chosen;
}
