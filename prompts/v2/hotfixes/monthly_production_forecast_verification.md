# Hotfix: 月間生産予測（前年実績 × 前々月前年比）の実装仕様適合性検証

## 使用ツール

Claude Code 推奨（**検証中心**、修正は仕様確定後に別プロンプトで実施）。Codex でも可。

## ミッション

「**前年度の在庫と今年度の前月の在庫、過去の数量から月間生産量を自動配分**」する実装が、docs / 文字起こしの仕様通りに動いているかを **検証する**。仕様逸脱があれば **原因特定して報告**（即修正はしない）。

**スコープは検証メイン**。バグ判明→ユーザー判断→修正は別プロンプトで対応。

---

## ⚠️ 検証対象の中心

### 数式（docs/18 §C, 文字起こし要約.md §C 由来）

```
予測数量 = 前年対象月実績 × (今年-2ヶ月実績 / 前年-2ヶ月実績)
                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                              「前々月の前年比率」
```

**例**（docs/18 §C より）：
- 前年5月 = 700ケース
- 今年3月 = 1000ケース、前年3月 = 800ケース → 前々月前年比 = 125%
- 今年5月予測 = 700 × 1.25 = 875ケース

### docs と文字起こしの微妙な差異

| 出典 | 採用比率 |
|---|---|
| `docs/18 §C` | **前々月の前年比** （リードタイム理由で前月確定を待たない） |
| `docs/文字起こし要約.md §C` | 例は「前月の前年比」だが要件として「直近月または前々月の実績から前年比率を計算する」と書く |

**既存実装は前々月のみ採用**（`previousMonthYoYRate` は計算だけして forecastQuantity には未使用）。
**この設計が業務的に正しいか確認**したい。

---

## 必読ファイル（この順番で読む）

1. [`app/src/lib/monthly-production-forecast.ts`](../../../app/src/lib/monthly-production-forecast.ts) — 月間予測ロジック（純関数）
2. [`app/src/lib/monthly-production-forecast.test.ts`](../../../app/src/lib/monthly-production-forecast.test.ts) — 既存テスト 5 件
3. [`app/src/lib/monthly-production-schedule.ts`](../../../app/src/lib/monthly-production-schedule.ts) — 日別補充提案（純関数）
4. [`app/src/lib/monthly-production-schedule.test.ts`](../../../app/src/lib/monthly-production-schedule.test.ts) — 既存テスト
5. [`app/src/lib/product-planning-service.ts`](../../../app/src/lib/product-planning-service.ts) — 両者を結合する service 層
6. [`app/src/app/api/product-monthly-actuals/route.ts`](../../../app/src/app/api/product-monthly-actuals/route.ts) — 月次実績の取込・読み出し
7. [`app/src/app/api/product-planning/monthly-schedule/route.ts`](../../../app/src/app/api/product-planning/monthly-schedule/route.ts) — 月間スケジュール生成 API
8. [`app/src/app/production-plans/monthly/page.tsx`](../../../app/src/app/production-plans/monthly/page.tsx) — UI（前々月前年比モード）
9. [`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §C / §Phase 8 §8-5
10. [`docs/文字起こし要約.md`](../../../docs/文字起こし要約.md) §C
11. [`docs/phase_0_outputs/0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) §3 Phase 8

---

## 検証チェックリスト

### A. 数式正しさ

- [ ] `monthly-production-forecast.ts:163` の `rawForecastQuantity = previousYearTargetQuantity × twoMonthsAgoYoYRate` が docs/18 §C と完全一致するか
- [ ] `twoMonthsAgoYoYRate = currentTwoMonthsAgoQuantity / previousYearTwoMonthsAgoQuantity` の分子・分母の年が正しいか（**よくある間違い**：年が逆になる）
- [ ] 既存テスト 5 件が docs の例と一致：1000 × 1.25 = 1250 → ロット 500 丸め → 1500
- [ ] `getHistoricalForecastReferenceMonths` の月オフセット（-1, -2, -12, -13, -14）が正しいか

### B. 「前月の前年比」を使わない設計の妥当性

- [ ] `previousMonthYoYRate` は計算されるが `forecastQuantity` に使われない。これは**意図通り**か（docs/18 §C：前月確定を待たない方針）
- [ ] `previousMonthYoYRate` の値が UI 表示で「参考情報」として出ているか、それとも完全な不使用カラムか
- [ ] **要確認事項**：業務的に「前月の前年比」も予測値計算に含めるべき場面はないか（例：前々月実績が異常値の場合のフォールバック）

### C. 境界・例外

- [ ] `previousYearTwoMonthsAgoQuantity <= 0` で 0 除算回避（実装確認）
- [ ] `missingRequiredMonths` で必須月不足を正しく検出
- [ ] `productionType = make_to_order` のときロット丸めをスキップ
- [ ] `standardProductionLotSize = 0` のときロット丸めをスキップ
- [ ] 負の actualQuantity を除外（line 57）
- [ ] テストでカバーされていない境界：
  - 前年対象月が null + 必須月（前々月系）は揃う → status 何になる？
  - 前々月実績が極小値（例：1）でブースト率が暴走するケース
  - 前年実績が 0 で予測 0 になるケース

### D. データ供給ルート

- [ ] `ProductMonthlyActual` テーブルへのデータ投入手段：手動入力 API のみか、CSV インポートもあるか
- [ ] seed.ts に何ヶ月分のサンプル実績があるか（seed では P001/P002 × 2025-03〜2026-04 の 10 件）
- [ ] 業務側が**何ヶ月遡って**実績を入れる必要があるか文書化されているか
- [ ] **前年実績取込が抜けると insufficient_data になる**点が画面で警告されているか

### E. UI 表示（`/production-plans/monthly`）

- [ ] `forecastQuantity` が画面に表示される
- [ ] `reason` 文字列が画面に出る（計算根拠の説明）
- [ ] `status = insufficient_data` の商品が一覧で見分けられる
- [ ] `missingRequiredMonths` のメッセージが表示される
- [ ] 標準ロット丸めが視覚的にわかる（rawForecastQuantity と forecastQuantity の差を表示）

### F. monthly-production-schedule との連携

- [ ] `monthly-production-forecast`（月間合計予測）と `monthly-production-schedule`（日別配分）が混同なく使い分けられているか
- [ ] `product-planning-service:loadMonthlyProductionSchedulePreview` で `planningBasis: "historical_actual"` を選んだとき、前者の結果がどう日別に展開されるか
- [ ] 月間予測値が日別補充提案にどう反映されているか追跡

### G. 既存実装と Phase 8 計画の関係

[`docs/phase_0_outputs/0_3_boundary_decision.md §1-8`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) は「既存 `monthly-production-forecast.ts` は残置、Phase 8 でロジック拡張」と整理済み。

- [ ] 現状実装が Phase 8 着手前の **暫定実装** か、それとも Phase 8 で計画されている **monthly_forecast_sources** に置き換える前提か
- [ ] docs/18 §B が要求する「自動予測値 + 営業予測 + スポット + 手動補正 = 最終月間生産予定」のうち、現状は「自動予測値」のみ実装されている認識で正しいか

---

## 期待出力

### `docs/phase_0_outputs/forecast_verification.md`（新規作成）

```markdown
# 月間生産予測 実装適合性検証レポート

調査日: YYYY-MM-DD
担当: <Codex|Claude Code>

## 1. 数式適合性

| 項目 | 仕様 | 実装 | 一致 |
|---|---|---|---|
| 公式 | 前年対象月 × 前々月前年比 | line 163 | ◯ |
| 前々月前年比 | 今年/前年 | line 162 | ◯ |
| ロット丸め | 在庫生産のみ | line 196-200 | ◯ |
| ... | ... | ... | ... |

## 2. テストカバレッジ

| 既存テストケース | 検証している境界 |
|---|---|
| ... | ... |

未カバーの境界:
- ...

## 3. UI 表示

`/production-plans/monthly` で確認:
- forecastQuantity 表示: 有 / 無
- reason 文字列: 有 / 無
- ...

## 4. データ供給ルート

- ProductMonthlyActual 投入手段: <列挙>
- seed 状況: <件数>
- ドキュメント化: 有 / 無

## 5. 連携（monthly-schedule との関係）

<2 つの関数がどう協調しているか>

## 6. 発見した問題点

| 問題 | 重要度 | 原因 | 提案 |
|---|---|---|---|
| ... | High/Med/Low | ... | 修正方針案 |

## 7. 「前月前年比」設計判断の確認事項（人間判断必要）

`previousMonthYoYRate` を予測値に組み込まない現状は docs/18 §C 通りだが、文字起こし §C の例は前月比率を使う。
業務責任者に確認すべき:
- 前々月前年比のみで良いか
- 前々月実績が異常値のとき前月前年比をフォールバックに使うか
- 表示上は前月前年比も並べて見せたいか

## 8. 結論

| 検証項目 | 結果 |
|---|---|
| 数式適合性 | ◯ / △ / × |
| 境界処理 | ◯ / △ / × |
| UI 表示完成度 | ◯ / △ / × |
| データ供給 | ◯ / △ / × |
| 監査ログ | ◯ / △ / × |
| **総合** | **「修正不要」/「軽微修正必要」/「要再設計」** |

## 9. 次のアクション

- [ ] 業務判断待ち項目: ...
- [ ] 修正不要 / 別プロンプトで対応する項目: ...
```

---

## 検証実施手順

### Step 1. 純関数の数式検証

`monthly-production-forecast.ts` を読みながら、docs/18 §C の例（前年5月 700 / 今年3月 1000 / 前年3月 800 → 875）を手計算で当てはめ、コードが同じ結果を返すかテストで再現する。

### Step 2. 境界テストの不足を洗い出す

既存テスト 5 件で未カバーの境界（C 節）を `it.todo` で 5〜10 件列挙する（実装はしない、リストアップのみ）。

### Step 3. UI 動作確認

`npm run dev` で `/production-plans/monthly` を開き、サンプル商品で表示を確認。スクリーンショット不要、現状の表示要素を文字で記録。

### Step 4. データ供給ルート確認

`ProductMonthlyActual` への投入経路を grep で全パス洗い出し：
- API `POST /api/product-monthly-actuals`
- CSV インポートに含まれているか
- seed.ts の件数

### Step 5. 連携追跡

`product-planning-service.ts` の `loadProductPlanningSuggestions` と `loadMonthlyProductionSchedulePreview` を読み、両関数（forecast / schedule）がどう協調しているか順序立てて記述。

### Step 6. 検証レポート出力

`docs/phase_0_outputs/forecast_verification.md` に上記テンプレで書き出す。

---

## 絶対遵守

- **コードを編集しない**（schema, lib, route, UI 全部触らない）
- 既存テストを編集しない・実行は OK
- `npm run dev` の起動は OK（手動確認用）、画面の編集はしない
- 新規 npm パッケージを追加しない
- 出力は `docs/phase_0_outputs/forecast_verification.md` のみ（新規 1 ファイル）
- バグ判明しても **このタスク内では修正しない**。レポートに記載して次のアクションに残す

---

## 報告

完了後 400 字以内で：

- レポートファイルのフルパス
- 数式適合性の結論（◯/△/×）
- 発見した問題点の件数（High / Med / Low 別）
- 業務責任者に確認が必要な事項の件数
- 次のアクション提案（修正不要 / 別プロンプトで修正）
- 特筆すべき発見 1 行
