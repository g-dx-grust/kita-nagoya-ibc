# Hotfix: `/production-plans/auto` のシフト連動人員配分・17時超過アラート

## 使用ツール

Codex 推奨（修正規模が大きいため）。Claude Code でも可。

## ミッション

1日単位の自動生産予定生成（`POST /api/production-plans/auto-schedule`）について、以下の症状を **調査 → 仮説検証 → 修正 → テスト追加** まで一気に通す。

## 報告された症状（ユーザー観察）

1. **シフトの時間と作業場所にうまく振り分けできていない** ように見える
2. **1時間1人あたり生産量との計算がうまくいっていない気がする**
3. **17:00 などの指定時間を超えた場合のエラー表示ができていない**

## 期待する挙動

- **シフトの人数を潜在上限** として使う（人数比例 / 並列配置）
- **商品間で人員を適切に振り分ける**（重複なし、空き時間を埋める）
- **シフト時間内に収まらない場合は明確にアラート**を出す（特に 17:00 超過、シフト終了超過）
- **作業場所マスタ × 商品ごとの `unitsPerPersonHour`** で正しく時間計算

## 前提

- このプロジェクトの不変ルールは [`CLAUDE.md`](../../../CLAUDE.md) と [`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) を参照。
- 既存 41 ユニットテスト + 63 統合テストは pass を維持する（既存挙動を壊さない）。
- DB プロバイダ: SQLite。テスト基盤は [`app/test/README.md`](../../../app/test/README.md)。

---

## Step 1. 必ず最初に読むファイル

以下を**この順番で**読み込んで、現状ロジックを把握してから動く。

1. [`app/src/app/api/production-plans/auto-schedule/route.ts`](../../../app/src/app/api/production-plans/auto-schedule/route.ts)（全 786 行）
2. [`app/src/lib/schedule.ts`](../../../app/src/lib/schedule.ts)（`computeAssignablePeople`, `timeRangesOverlap`）
3. [`app/src/lib/calculations.ts`](../../../app/src/lib/calculations.ts)（`computeProductionDuration`, `computeMaxQuantityInTimeWindow`, `computeRequiredPeople`）
4. [`app/src/app/production-plans/auto/auto-schedule-form.tsx`](../../../app/src/app/production-plans/auto/auto-schedule-form.tsx)（UI 側、warnings の表示方法）
5. [`app/src/lib/calculations.test.ts`](../../../app/src/lib/calculations.test.ts) / [`app/src/lib/schedule.test.ts`](../../../app/src/lib/schedule.test.ts)（既存テスト）

---

## Step 2. 私（Claude Code）が既に立てた仮説リスト

調査の取っかかりとして使う。**各仮説について、コード上で当該箇所を確認し、当てはまるかを Yes/No 判定する**。当てはまる仮説には具体的な再現入力（シフト・商品・モード）を構成して、現状の出力と期待出力を対比すること。

### 仮説 A: `computeAssignablePeople` の謎挙動

`app/src/lib/schedule.ts:20-28`：

```ts
export function computeAssignablePeople(input: {
  roomMaxPeople?: number | null;
  standardPeople?: number | null;
  availablePeople: number;
}): number {
  const roomMax = Math.max(1, Math.floor(input.roomMaxPeople ?? input.standardPeople ?? 1));
  const available = Math.max(0, Math.floor(input.availablePeople));
  return Math.max(1, Math.min(roomMax, available || roomMax));
}
```

- `available || roomMax`：**available = 0 のとき roomMax を返す**（フォールバック）
- `Math.max(1, ...)`：**最低 1 人を保証**

**疑問**：シフトに人がいなくても「1 人配置できる前提」になるのは正しいか？ `available = 0` のとき `0` を返すべきでは？

確認方法：`schedule.test.ts` の第 3 it `(availablePeople=0 で部屋上限 4 を返す)` は意図的か（[`0_c_test_coverage_diff.md §7-#6`](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md) に懸念明示済み）。仕様判断が必要。

### 仮説 B: `estimatePeopleLimitForRemainingRooms` の人員分割

`app/src/app/api/production-plans/auto-schedule/route.ts:454-470`：

```ts
function estimatePeopleLimitForRemainingRooms(items, productMap, internalWorkAreas, staffCount) {
  // ...
  const parallelRoomCount = Math.max(1, Math.min(items.length, workAreaIds.size || 1));
  return Math.max(1, Math.ceil(staffCount / parallelRoomCount));
}
```

これは「残りアイテムが**同時並行**に動く前提」で人員を割っている。
例：シフト 8 人、5 商品 = 5 部屋使う → 各部屋 2 人 ずつ。
**でも実際は順次配置のはず**。最初の商品に 8 人使えるはずなのに 2 人で計算してしまう。

確認方法：複数商品・複数部屋のリクエストで `peopleLimit` の値を `console.log` し、想定と一致するか確認。

### 仮説 C: `pickStaff` の `shiftEnd >= end` 条件が厳しすぎる

`app/src/app/api/production-plans/auto-schedule/route.ts:724-735`：

```ts
function pickStaff(staffStates, start, end, count) {
  return staffStates
    .filter(
      (staff) =>
        staff.freeAt <= start &&
        staff.shiftStart <= start &&
        staff.shiftEnd >= end &&            // ← この条件
        !hasBusyOverlap(staff, start, end),
    )
    // ...
}
```

シフトが 17:00 終了で作業が 17:00 ぴったりに終わる → `shiftEnd(17:00) >= end(17:00)` は **true** なのでセーフ。
シフトが 16:55 終了で作業が 17:00 まで → `16:55 >= 17:00` は **false** で除外。
**でも 17:00 まで残業すれば可能なケースは "なし" と扱われ、結果として作業者 0 人で warning なし**になる可能性。

確認方法：シフトが少し早く終わる人がいるケースで実際の出力を観察。

### 仮説 D: `peopleCount = candidates.length || standardPeople` の謎フォールバック

`app/src/app/api/production-plans/auto-schedule/route.ts:508`：

```ts
const people = Math.max(1, candidates.length || standardPeople);
```

`candidates.length = 0` のとき `standardPeople` で計算してしまう。**スタッフが 0 人なのに「standardPeople 人いる前提」で時間計算**になるバグ候補。

### 仮説 E: 17:00 超過警告の UI 表示

API 側は `warningLabel("exceeds_baseline_end") → "基準終了を超過"` で plan の warnings に入る。
UI 側 `auto-schedule-form.tsx:371`：

```tsx
<td>{plan.warnings.length ? plan.warnings.join(" / ") : "なし"}</td>
```

テーブルセル内のテキスト表示のみ。**色付け・バッジ・上部アラートが無い**。ユーザーが「エラー表示ができていない」と感じる原因の一つ。

### 仮説 F: ProductionCapacity が取れないケース

`getSchedulableCapacities` で当該商品の `unitsPerPersonHour` を持つ ProductionCapacity が見つからない場合、`synthetic capacity` を `template` から仮適用する（route.ts 内）。
仮適用時の `unitsPerPersonHour` が 0 や undefined だと `non_positive_capacity` 警告になるが、それが UI でどう見えているか。

### 仮説 G: 商品の順番依存

`items` 配列の順番で順次配置される。`compareSlotChoices` でルームをソートするが、商品の順番は維持。**先頭商品が部屋を占有すると後続商品が押し出される**。

確認方法：同じ入力で `items` 順序を逆にしたとき結果が変わるか確認。

---

## Step 3. 仮説の検証手順

### 3-1. **再現テスト**を書く

`app/test/integration/auto_schedule_diagnosis.test.ts`（新規）に以下を作る。

**全部 `it.todo` から始める**：症状を書き出すだけ、まだ実装しない。

```ts
describe("Auto-schedule shift assignment diagnosis", () => {
  it.todo("シフト 8 人、商品 A・B（別部屋）、人員が並列で配分される");
  it.todo("シフト 4 人、商品 A・B・C・D・E（同部屋）、順次配置される");
  it.todo("17:00 シフト終了、9:00 開始で 1000袋作る → 17:00 超過 warning が plan.warnings に入る");
  it.todo("16:55 シフト終了の人を 17:00 まで使う必要がある場合、warning + 人員調整");
  it.todo("シフト 0 人時間帯（昼休み等）で作業しようとしたとき、配置可能 0 人が検出される");
  // ...
});
```

その後、**今の API レスポンスを実際に取って**、Markdown に貼り付け（`docs/phase_0_outputs/hotfix_auto_schedule_baseline.md` 新規）。各シナリオの「現状の出力」と「期待される出力」を表で対比。

### 3-2. 仮説の検証

1. 各仮説について該当コード箇所を読み、Yes/No を判定
2. 当てはまる仮説は **再現テスト** を書いて fail することを確認
3. 当てはまらない仮説は **No と判定した根拠** を記録

### 3-3. 検証結果のサマリ

`docs/phase_0_outputs/hotfix_auto_schedule_diagnosis.md`（新規）に：
- 仮説 A〜G の Yes/No と根拠
- 追加発見の仮説（A〜G 以外）
- 修正の優先順位（症状3つにどう対応するか）

を書き出す。**ここで一度立ち止まって**、人間がレビューできるようにする。

---

## Step 4. 修正方針

検証結果に基づき、以下を**慎重に**実施。**既存テスト全件 pass を維持する**ことを最優先。

### 4-1. 仮説 A の修正（`computeAssignablePeople`）

`available || roomMax` を `available > 0 ? Math.min(roomMax, available) : 0` に変更する案：
- ただし**既存テスト `schedule.test.ts` の「availablePeople=0 で部屋上限 4 を返す」が fail する**。これは [`0_c §7-6`](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md) で「仕様判断が必要」と保留されていた箇所。
- **必ずユーザーに確認**：シフト 0 人時間帯で「上限人数で計算 vs 0 として扱う」のどちらが業務的に正しいか
- 確認が取れたら、テストと実装を両方更新

### 4-2. 仮説 B の修正（`estimatePeopleLimitForRemainingRooms`）

「全アイテム並列前提」から「現アイテムだけ単独」に変更する案：
- ただし **同時並行で複数部屋を使うシナリオ**（A=機械部屋4人、B=一般部屋4人）を壊さないこと
- 修正後、`pickStaff` が同一人員を二重に選ばないことを統合テストで確認

### 4-3. 仮説 D の修正（`peopleCount` フォールバック）

`Math.max(1, candidates.length || standardPeople)` を **配置可能 0 のときは明確に 0 として扱う**：

```ts
const people = candidates.length > 0
  ? Math.min(standardPeople, candidates.length)
  : 0;
if (people === 0) warnings.push("出勤シフト内で配置できるスタッフがいません");
```

その上で `result.maxQuantity` が 0 になるので、生成失敗として返す。

### 4-4. 仮説 E の修正（UI 警告表示）

`auto-schedule-form.tsx` の `plan.warnings` 表示を強化：
- warnings 件数バッジ
- 「基準終了を超過」「翌日繰越候補」などのキーワードに `.badge warn` / `.badge danger` を適用
- 上部に「警告 N 件」のサマリを出す
- ただし**デザイン保護**：既存 `.badge` クラスを使い、新規 shadcn コンポーネントは追加しない。`globals.css` も触らない

### 4-5. 17:00 超過時の API レスポンス強化

API レスポンスに `summary.warningCount`, `summary.overflowQuantity` などの**全体サマリ**を追加（既存 plans[] フィールドはそのまま）。これにより UI で目立つ表示が可能になる。

---

## Step 5. テスト追加

### 5-1. 純関数テスト追加

`schedule.test.ts` に：
- `computeAssignablePeople`：available=0 の挙動（修正後の仕様）
- `computeAssignablePeople`：available=部屋上限超過の挙動

`calculations.test.ts` に：
- `computeProductionDuration`：シフト終了をまたぐ場合
- `computeMaxQuantityInTimeWindow`：複数 break window のあるシフト

### 5-2. 統合テスト追加

`test/integration/auto_schedule_shift_assignment.test.ts`（新規）：

**シナリオ 1: 単一商品・シフト 4 人・部屋上限 4**
- 期待：4 人配置、所要時間 = 数量 / (4 × unitsPerPersonHour)
- 17:00 内に収まれば warning なし、超過すれば「基準終了を超過」

**シナリオ 2: 商品 A (機械部屋 4 人) + 商品 B (一般部屋 4 人)・シフト 8 人**
- 期待：人員重複なし、両商品が並行配置

**シナリオ 3: 商品 A・B・C（同部屋）・シフト 4 人**
- 期待：順次配置、A 終了後に B 開始、人員は同じ 4 人が引き継ぐ

**シナリオ 4: シフト 0 人時間帯（10:00-11:00）に作業しようとする**
- 期待：API が配置不能 warning を返す、`exceeds_baseline_end` か `no_staff_available` 相当

**シナリオ 5: シフト 16:55 終了の人を含む、17:00 終了希望**
- 期待：16:55 で抜ける人を考慮した人数調整、warning 出力

### 5-3. UI スモークテスト

`/production-plans/auto` を `npm run dev` で起動し、以下を手動確認：
- 警告が **目立つ表示** で出る（バッジ・色付け）
- plan ごとの warnings が見やすい
- 17:00 を超過したときに **画面上部にアラート** が出る

---

## Step 6. 報告（このタスクの最終出力）

以下を 600 字以内で本セッション（Claude Code）に共有：

```
## 完了報告: Auto-schedule hotfix

### 仮説検証結果
- 仮説 A: <Yes/No> / 修正の有無
- 仮説 B: <Yes/No>
- 仮説 C: <Yes/No>
- 仮説 D: <Yes/No>
- 仮説 E: <Yes/No>
- 仮説 F: <Yes/No>
- 仮説 G: <Yes/No>

### 追加発見した問題
- ...

### 修正したファイル
- ...

### 追加したテスト件数
- ユニット: <数>
- 統合: <数>

### 残る懸念（人間判断必要）
- 「シフト 0 人時間帯の挙動（最低 1 人配置 vs 0 人で警告）」など仕様確認事項

### 既存テスト維持
- ユニット <N/M> pass、統合 <N/M> pass

### UI 改修
- 警告表示の見え方 before/after の説明
```

---

## 絶対遵守

- 既存 41 ユニットテスト + 63 統合テストは **絶対に壊さない**（仕様変更で意図的に壊す場合は **必ず先に質問**）
- 既存 API レスポンスシェイプを壊さない（`printUrls` キー、`plans[]` 配列構造、`warnings` 配列）
- `components/ui/`, `globals.css`, `layout.tsx`, `app-nav.tsx`, `Sidebar.tsx` は触らない
- 新規 shadcn コンポーネントを投入しない
- マイグレーションは **発生しない**（schema 変更なし。あくまでロジック修正）
- Phase 2 用に Codex 別セッションが走っている可能性あり。`schema.prisma` の編集は **しない**

## 着手前のチェック

- [ ] [`CLAUDE.md`](../../../CLAUDE.md) を読んだ
- [ ] [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §3 (既存 API 互換性ルール) を読んだ
- [ ] [`docs/phase_0_outputs/0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) §1-3 production-plans 系を読んだ
- [ ] 上記「Step 1. 必ず最初に読むファイル」を全部読んだ
