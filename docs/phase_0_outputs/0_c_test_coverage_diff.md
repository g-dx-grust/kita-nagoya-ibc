# Phase 0-C テストカバレッジ差分

調査日: 2026-05-28
担当: Claude Code（Phase 0-C 並列タスク）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_parallel_c_tests.md`](../../prompts/v2/phase_0_subtasks/0_parallel_c_tests.md)
前提文脈: [`docs/phase_0_outputs/0_0_orientation.md`](./0_0_orientation.md)

> 既存テストの実行・新規作成・編集は一切していない。本ドキュメントは「テスト過不足の地図」のみ。

---

## 1. 既存テストファイル一覧

`vitest.config.ts` の include は `src/**/*.test.ts` / `*.test.tsx`。`*.test.tsx` は現状ゼロ。`src/lib/` に 9 ファイル存在し、テストケースは合計 30 件前後。

| # | ファイル（`app/src/lib/` 配下） | テスト数 | describe / it 概要 | カバー関数（同名 `.ts`） |
|---|---|---|---|---|
| 1 | `calculations.test.ts` | 15 | `computeProductionDuration` ×5（数量固定・休憩跨ぎ・休憩直前開始・人数0・48h超）／`addWorkingMinutesSkippingBreaks` ×2（休憩開始ちょうど・休憩中開始）／`computeMaxQuantityInTimeWindow` ×2（時間枠固定モード・あふれ）／`computeRequiredPeople` ×2（必要人数算出・人手不足）／`computeUnitsPerPersonHourFromLaborUnitPrice` ×3（換算・小数丸め・0以下）／`computeMaterialRequirements` ×4（hard_shortage・unconfirmed_dependency・none・ロス率）／`computeCostEstimate` ×1（請求例 5640×12=67,680） | `calculations.ts` の主要 7 関数 |
| 2 | `csv.test.ts` | 3 | `parseCsvWithHeader` ×2（引用符内カンマ・改行、空行/BOM）／`toCsv` ×1（カンマ・引用符のエスケープ） | `csv.ts` の 2 関数 |
| 3 | `material-forecast.test.ts` | 2 | `buildMaterialForecast` ×2（複数予定の日付順累積で hard_shortage、未確定入荷依存で unconfirmed_dependency） | `material-forecast.ts` の `buildMaterialForecast` |
| 4 | `monthly-inventory-sheet.test.ts` | 2 | `buildMonthlyInventorySheet` ×2（前月繰越・日別入出庫・月末残、対象月外の除外） | `monthly-inventory-sheet.ts` |
| 5 | `monthly-production-forecast.test.ts` | 5 | `getHistoricalForecastReferenceMonths` ×1（前年同月・前月・前々月の参照月算出）／`computeHistoricalMonthlyProductionForecasts` ×4（前々月前年比×前年同月、前月未確定でも予測可、受注生産はロット丸めなし、必須月不足は対象外） | `monthly-production-forecast.ts` の 2 関数 |
| 6 | `monthly-production-schedule.test.ts` | 5 | `computeMonthlyProductionSchedule` ×4（不足前に候補配置・現在庫充足で候補ゼロ・既存予定加味で減算・受注生産は丸めず・期限超過は計画開始日寄せ）／`aggregateMonthlySuggestions` ×1（同日同商品の集約） | `monthly-production-schedule.ts` の 2 関数 |
| 7 | `monthly-shift-simulation.test.ts` | 3 | `simulateMonthlyShiftSchedule` ×3（1日能力超過は複数日分割・シフト無は未配置にスキップ・既存予定占有時は空き時間配置） | `monthly-shift-simulation.ts` |
| 8 | `product-planning.test.ts` | 2 | `computeProductPlanningSuggestions` ×2（在庫生産は安全在庫＋標準ロット丸め・受注生産は不足そのまま提案） | `product-planning.ts` |
| 9 | `schedule.test.ts` | 4 | `timeRangesOverlap` ×2（重複検出・隣接は非重複）／`isValidTimeRange` ×1（start<end）／`computeAssignablePeople` ×3（部屋上限・人数不足・人数0時の上限値） | `schedule.ts` の 3 関数 |

**合計**: 9 ファイル / 41 テストケース（it 数の数え上げ）

**未テストの実装ファイル**（`app/src/lib/` に存在するが対応する `*.test.ts` が無い）:
- `audit.ts`（監査ログ）
- `http.ts`
- `inventory.ts`（在庫計算）
- `labels.ts`
- `paths.ts`
- `plan-engine.ts`（計画エンジン）
- `prisma.ts`
- `product-planning-service.ts`
- `schemas.ts`（Zod スキーマ）
- `time.ts`
- `utils.ts`

→ Phase 5 以降で扱う `audit.ts`、Phase 2/3 の `inventory.ts`、Phase 3 の `plan-engine.ts`、Zod 定義の `schemas.ts` あたりは今後のユニットテスト追加対象になりうる。

---

## 2. docs/14 受け入れテスト × 既存テスト 対応表

判定凡例: 有 = 計算式レベルで既存テストが要件を直接カバー。部分 = 計算式の一部または周辺関数のみ。無 = 対応する自動テストが存在しない（手動検証 or 統合・E2E 必要）。

| docs/14 のケース（章 → ケース名） | 既存カバー | 既存ファイル | コメント |
|---|---|---|---|
| Phase 0 / 商品マスター登録（BOM・1人時生産量の登録） | 無 | — | マスタ CRUD のテストは現状ゼロ。Phase 1 で追加要 |
| Phase 1 / 数量固定モード（1000袋, 5人, 100袋/人時, 9:00→11:00） | 有 | `calculations.test.ts`（`computeProductionDuration` 第1 it） | 数値完全一致で検証済み |
| Phase 1 / 時間枠固定モード（9-17時, 75分休憩, 5人 → 6.75時間, 3375袋） | 有 | `calculations.test.ts`（`computeMaxQuantityInTimeWindow` 第1 it） | 数値完全一致 |
| Phase 1 / 17時超過アラート（19:15終了, 残業135分, 翌営業日持ち越し） | 部分 | `calculations.test.ts`（`computeProductionDuration` 第2 it = `exceeds_baseline_end` + overtime135） | 「翌営業日持ち越し候補表示」は UI/サービス層なので無 |
| Phase 1 / 原料不足アラート（必要50kg、現20kg、確定0 → 不足30kg, 発注候補表示） | 部分 | `calculations.test.ts`（`computeMaterialRequirements` 第1 it = hard_shortage） | 「発注候補に出る」部分はサービス層なので無 |
| Phase 1 / 未確定発注依存アラート（未確定込みなら足りる、確定では不足、警告表示） | 有 | `calculations.test.ts`（`computeMaterialRequirements` 第2 it = unconfirmed_dependency）／`material-forecast.test.ts` 第2 it | 計算ロジックは網羅。画面表示部は別途 |
| Phase 2 / 発注確定（発注候補→発注済み未確定→確定数量＆入荷予定日で確定） | 無 | — | 状態遷移ロジック・API のテストが無い。Phase 4 で追加要 |
| Phase 3 / 重複割り振り防止（A を 9-12 一般部屋、同時間に機械部屋へ） | 部分 | `schedule.test.ts`（`timeRangesOverlap`） | 時間帯重複の純関数のみ。「保存できない／警告承認」の挙動は無 |
| Phase 3 / 合流候補（一般15:00終了→機械17:30、15:00以降移動候補） | 無 | — | 合流候補生成ロジックそのものの実装/テストが見当たらない。Phase 8 系の領域 |
| Phase 4 / 日報実績で在庫差し替え（予定180kg、実170kg → 在庫170kg消費＋差異10kg表示） | 無 | — | 日報承認→在庫反映の `actual_*` 経路はテスト未整備 |
| Phase 5 / 請求 CSV 出力（5640×12=67,680、CSV に商品コード・数量・単価・金額、出力履歴） | 部分 | `calculations.test.ts`（`computeCostEstimate` 第1 it = 67,680）／`csv.test.ts`（CSV エスケープ） | 金額計算と CSV ユーティリティは網羅。請求 CSV 全体組み立て・出力履歴監査ログは無 |

**未カバー件数の集計**（部分カバーも「計算は通っているがフェーズ完了条件を満たすには追加要」として未カバー寄りに数える）:
- 完全未カバー: 5 件（商品マスター登録、発注確定、合流候補、日報実績で在庫差し替え、— 加えて Phase 1「17時超過の翌営業日持ち越し」「原料不足→発注候補出現」「重複割り振り防止の保存ガード」「請求CSV出力履歴」の各サービス層）
- 計算式は有・サービス/UI/監査ログ層が未カバー（部分）: 5 件
- 完全カバー（純粋計算式）: 3 件（数量固定モード／時間枠固定モード／未確定発注依存）

→ docs/14 全 11 ケース中、**完全カバーは 3 件のみ。残り 8 件は何らかの追加（ユニット+統合）が必要**。

---

## 3. Phase 別 追加ユニットテスト要件

docs/18 の各フェーズ完了条件と §15 監査表から、計算式・判定式レベルで追加すべきユニットテストを抽出。既存と重複しないものだけ列挙する。

### Phase 1：マスタ・DB拡張

| 対象計算/判定 | 推奨テストケース |
|---|---|
| マスタの `active` / `valid_from` / `valid_to` 適用フィルタ | 有効期間内のみ抽出、改廃済みは除外、`valid_to` 当日は含む/含まない境界 |
| 商品 BOM（同商品×同原料×期間重複）バリデーション | 期間重複が同 itemId で 1 件のみとなることを検証 |
| 生産能力マスタ（商品×作業場所×人数）の主キー一意 | 同キーで二重作成不可 |
| 商品マスタ：請求対象フラグ（`billingEnabled`） | true/false 切替が伝票出力対象に反映されるかの境界 |
| 1時間1人あたり生産量の入力下限 0 以下を弾く | Zod スキーマ単体のバリデーション |
| 商品 alias 検索（旧A → P001 への解決） | seed の `aliases: [{aliasName:"旧A"}]` を踏まえ |

### Phase 2：在庫台帳

| 対象計算/判定 | 推奨テストケース |
|---|---|
| 任意日付の理論在庫計算（PLANNED と CONFIRMED の合算） | 5/1=opening100、5/2 PLANNED -20、5/3 CONFIRMED -10 で各日付の理論在庫を検証 |
| 未確定発注（status=PLANNED）の確定在庫への混入禁止 | 確定在庫だけ取る関数と全体取る関数で値が変わることを検証 |
| `source_type + source_id` 二重登録防止 | 同じ source で 2 回呼んでも movement が増えないこと（冪等） |
| 在庫マイナス検出 | 連続消費で残高が負になるケースを検出 |
| 確定／未確定／予定の 3 状態タグ判別 | 同じ商品ID で各 status を持つときの台帳一覧表示 |

### Phase 3：手動生産予定 MVP（CLAUDE.md MVP ライン）

| 対象計算/判定 | 推奨テストケース | 既存との関係 |
|---|---|---|
| 所要時間計算：13:00 ちょうど開始 | 休憩明け即開始、休憩 0 分扱い | 既存に直接ケース無 |
| 所要時間計算：15:00〜15:15 休憩のみまたぐ | blockedMinutes = 15、終了時刻の境界 | 既存 1 件は 12-13 のみ |
| 所要時間計算：開始 = 終了（数量 0） | requiredMinutes=0, endTime=startTime, 警告 `zero_quantity` 等 |  |
| 所要時間計算：稼働可能時刻外（22:00 開始など）の扱い | 警告 or 翌営業日繰り越し | 48h 超は既存にあるが「夜開始」未確認 |
| 時間枠あふれ判定：endTime < startTime 入力 | バリデーションエラー | 既存 `isValidTimeRange` で部分カバー |
| 時間枠あふれ判定：休憩を完全に包含しない枠（9:30-11:30） | 休憩 0 分、最大数量計算 |  |
| 必要人数計算：必要時間が枠を超えるとき shortagePeople を返す | 既存第2 it（3000袋, available=2）あり、人数下限 1 のときも要 | 既存部分カバー |
| BOM 展開 → planned 使用量 inventory_ledger への発行（純関数部分） | 数量×ロス率の `planned_*` 単位での出力 | `computeMaterialRequirements` で計算は OK、ledger 発行ペイロード組み立ては未テスト |
| 製品在庫の planned 増加発行 | 生産予定数量がそのまま `PLANNED_PRODUCTION_IN` で出力されるか |  |

### Phase 4：原料・資材の発注アラート

| 対象計算/判定 | 推奨テストケース |
|---|---|
| BOM 展開（複数商品の同一原料合算） | 商品 A 50kg + 商品 B 30kg → 同日同原料 80kg にまとまる |
| リードタイム逆算 `required_order_date` | leadTimeDays=3, 必要日=5/10 → 発注期限=5/7（営業日カレンダー考慮の有無で 2 ケース） |
| 緊急度判定（CRITICAL / WARNING / INFO） | required_order_date < today → CRITICAL、当日 → WARNING、3 日以上余裕 → INFO の閾値検証 |
| 発注候補生成（不足量＋発注単位丸め） | 不足 17.3kg、発注単位 5kg → 候補 20kg、複数候補のマージ |
| 安全在庫割れ判定 | 残量 < safety_stock の境界（== は許容するかしないか） |
| 候補→本発注化の冪等性 | 同じ候補 ID で 2 度承認しても二重発注しない |

### Phase 5：日報・実績反映

| 対象計算/判定 | 推奨テストケース |
|---|---|
| 予定 vs 実績差分（数量） | planned=1000, actual=950 → 差分 -50、差分率の閾値で実績差異アラート発火 |
| 予定 vs 実績差分（原料消費） | docs/14 Phase 4 のケース：planned 180kg, actual 170kg → 差分 +10kg を返す |
| 残数の翌日以降振替計算 | 残 200 袋 → 翌日の同商品 PLAN に上乗せ、複数日跨ぎ |
| 能力値中央値計算 | capacity_observations 5 件中央値、外れ値含む奇数件、偶数件の補間 |
| 能力値更新の locked ガード | `production_capacities.locked = true` のとき中央値計算は走るが更新しないこと |
| 不良数の集計 | actual_quantity と defect_quantity の合算が planned に一致するかの整合チェック |

### Phase 6：請求／売上伝票／手間賃

| 対象計算/判定 | 推奨テストケース |
|---|---|
| 手間賃集計：actual_quantity × laborUnitPrice | 数量 5640、単価 12 → 67,680（既存 `computeCostEstimate` に近いが「実績由来」セルでの再検証） |
| 製造原価：原料 + 資材 + 手間賃 + その他 | 各要素の単体検証と合算境界 |
| 請求対象フラグ適用 | billingEnabled=false の商品は CSV から除外 |
| 外注/AX 振り分け | workArea.externalFlag=true の生産は請求対象外として除外 |
| CSV 出力フォーマット（商品コード・名・数量・単価・金額） | 順序・ヘッダ名・空値の扱い |
| 出力履歴の監査ログ書き込み（純関数部） | 出力に対し 1 件の audit_log エントリが期待される |

### Phase 7：業務管理連携（CSV取込）

| 対象計算/判定 | 推奨テストケース |
|---|---|
| staging バリデーション | 商品コード未存在、顧客コード未存在、必須欠落の各エラー型 |
| `external_order_id` による重複防止 | 同 ID の 2 度目取込が staging で弾かれること |
| 商品 alias の解決ロジック | 「旧A」→ `P001` への自動マッピング |
| 取込後の出荷予定再計算 | 取込前後で `productDemand` の状態差を検証 |

### Phase 8：需要予測・自動割当・複数シナリオ

| 対象計算/判定 | 推奨テストケース |
|---|---|
| 前年比率予測（前年同月 × 前々月前年比） | 既存 `monthly-production-forecast.test.ts` でカバーされている範囲を超えて：前月前年比優先のパス、ハイブリッド（前月＋前々月の平均）の境界 |
| ローリング予測（3〜6か月先） | rolling_horizon=3 / 6 の切替、月またぎの参照月計算 |
| 特殊案件（チラシ等）除外フラグ | 通常実績に混ぜないことを `actuals` の filter で検証 |
| 商品統合（規格変更）グループの合算予測 | 旧商品+新商品の数量を 1 つのグループとして合算 |
| シナリオスコアリング（通常／残業／前倒し） | 残業時間、原料不足、場所衝突の重み付き合算 → 最良シナリオの選定 |
| 仮シフト生成（標準シフト or 前月コピー） | 将来月のシフト枠 → 能力上限値の算出 |
| 期限超過の未処理需要は計画開始日に寄せる | 既存 `monthly-production-schedule.test.ts` 第4 it でカバー済 → Phase 8 自動候補での再検証 |
| `final_plan_qty` = 予測 + 営業予測 + スポット + 手動補正 | 各成分の加減算境界 |

### Phase 9：AI高度化・異常検知

| 対象計算/判定 | 推奨テストケース |
|---|---|
| 標準偏差 n 倍超え判定 | 実績数列に対する σ 計算、平均±2σ を超えるサンプルの検出 |
| 能力値急変検知 | 中央値の前後比較（直近 N 件 vs 過去 N 件）、変化率 X% 超で発火 |
| 原料消費急増検知 | 1 日あたり消費の閾値超え（複数日平均比 X 倍） |
| 在庫マイナス頻発検知 | 直近 N 日で M 回以上のマイナス発生 |
| シナリオ推奨スコアリング（重み付き合算） | 在庫不足×w1 + 原料不足×w2 + 残業×w3 + 場所衝突×w4 → 最小スコアの候補に `recommended` タグ |
| `calculation_reason` 構造化メモ生成 | 候補1件に対し、なぜこの数量・日・場所かのキーが揃っていること |

**Phase 3〜9 追加ユニットテスト概数**: 各フェーズ 5〜10 件目安で **合計 50〜60 件**（Phase 3≒10、Phase 4≒6、Phase 5≒6、Phase 6≒6、Phase 7≒4、Phase 8≒8、Phase 9≒6）。

---

## 4. 統合テスト要件（E2E / DB絡み）

ユニットテストでは捕捉できない、パイプライン（docs/18 §13）レベルの検証。Playwright もしくは Prisma + vitest の DB 統合スイートを別 include に用意することが想定される。

| # | シナリオ | 関与フェーズ | 期待挙動 |
|---|---|---|---|
| E1 | 生産予定登録 → BOM 展開 → 在庫推移 → 不足検出 → 発注候補生成 | Phase 3 → 4 | 1 トランザクションで `production_plans` → `production_plan_requirements` → `inventory_ledger(PLANNED)` → `purchase_candidates` まで一気通貫 |
| E2 | 発注候補承認 → 発注済み未確定 → 確定数量入力 → 確定入荷予定反映 | Phase 4 | 監査ログ 2 件（承認・確定）、未確定アラート消滅 |
| E3 | 日報入力 → 提出 → 管理者承認 → `ACTUAL_*` 発行 → 在庫差し替え | Phase 5 | 承認前は在庫不変、承認後に planned が actual に置換、監査ログ 1 件 |
| E4 | 日報承認後の能力値中央値再計算 → `production_capacities` 更新 | Phase 5 | locked=false のレコードのみ更新、locked=true は据え置き |
| E5 | CSV 取込 → staging → バリデーション → 本テーブル反映 → 出荷予定再計算 | Phase 7 | 失敗時は staging のまま、`external_order_id` 重複は弾く、成功時のみ `productDemand` 反映 |
| E6 | 月間予定確定 → 日別候補生成（複数シナリオ並列） → 人が採用 → 本予定化 | Phase 8 → 3 | 採用前は `production_schedule_candidates` のまま、採用イベントで `productionPlan` 発生 |
| E7 | 受注変更検知 → 自動再計算ジョブ起動 → 候補再生成 → 失敗時ロールバック | Phase 9 → 7 → 8 | ジョブキュー、排他制御、リトライ、ロールバック挙動 |
| E8 | 請求 CSV 出力 → 監査ログ → 履歴画面で確認 | Phase 6 | billingEnabled=false と externalFlag=true の除外、出力 1 回につき監査 1 件 |
| E9 | 同一 `monthly-plan:2026-07` への二重再計算リクエスト | 全フェーズ横断 | calculation_locks で 2 件目を待機 or 拒否、候補二重生成しない |
| E10 | 異常検知ヒット → アラート発火 → ダッシュボード集計 | Phase 9 → §19 | alert_type / severity が正しい、画面集計件数が DB と一致 |

**統合テスト概数**: 10 シナリオ程度。現状 0 件。

---

## 5. Seed データ雛形

`app/prisma/seed.ts` の現状を確認した上で、テスト基盤として必要な追加 Seed を列挙する。

### 5-1. 既存 seed.ts に **有り**

| エンティティ | 既存件数 / 内容 |
|---|---|
| User | 3 件（admin / production_mgr / floor） |
| WorkArea | 4 件（一般部屋, 機械部屋, 仕上げ部屋, 外注先A=externalFlag:true） |
| Supplier | 1 件（デフォルト仕入先） |
| Material | 2 件（RM001 原料X, RM002 原料Y） |
| PackagingMaterial | 1 件（PK001 標準袋） |
| Product | 2 件（P001=stock+alias「旧A」, P002=make_to_order） |
| ProductBomItem | 2 件（P001 → 原料X 0.05kg + 標準袋 1枚） |
| ProductionCapacity | 2 件（P001=100袋/人時/一般部屋, P002=80袋/人時/機械部屋） |
| BillingPrice | 1 件（P001=12円, billingTarget:true） |
| StockMovement (opening) | 3 件（原料X 20kg, 袋 5000枚, 製品 200袋）※ docs/14 原料不足ケースと整合 |
| ProductDemand | 2 件（P001 5/25 1100袋, P002 5/24 240袋） |
| ProductMonthlyActual | 10 件（P001/P002 × 2025-03〜2026-04）※ 予測テスト用 |
| Employee | 5 件（山田・佐藤・鈴木・高橋・田中） |
| Shift | 5 件（全員 2026-05-20 のシフト） |
| ProductionPlan | 1 件（2026-05-20 P001 1000袋 一般部屋 印刷確認用） |
| ProductionPlanRequirement | 2 件（原料X 不足30kg/hard_shortage, 袋 充足） |
| ProductionPlanAssignment | 5 件（全社員 09:00-11:00 割当） |

### 5-2. 既存 seed.ts に **無し** / 追加すべき雛形

| エンティティ | 何故必要か | 想定件数 |
|---|---|---|
| inventory_ledger（Phase 2 新規） | `movement_type=PLANNED_*/CONFIRMED_*/ACTUAL_*`、`status=PLANNED/CONFIRMED/CANCELLED` の状態遷移テスト | 状態ごとに 2〜3 件 |
| material_requirements 単体（Phase 4） | BOM 展開後の行レベル保存テスト | 商品×原料の組合せ 5 件 |
| purchase_order_candidates（Phase 4 新規） | 発注候補・緊急度・required_order_date を持つレコード | severity 別 3 件 |
| purchase_orders（Phase 4） | 「発注済み未確定」「確定」「キャンセル」の各状態 | 各 1 件 |
| daily_reports / daily_report_lines（Phase 5 新規） | 提出中／承認済の両ステータス、planned との差分シナリオ | 各 2 件 |
| capacity_observations（Phase 5 新規） | 中央値計算用の実績群（奇数件・偶数件） | 商品×場所で 5〜10 件 |
| monthly_production_plans / monthly_forecast_sources（Phase 8 新規） | 月間計画・複数根拠（自動/営業/スポット/手動）の合算テスト | 月×商品で 4 件 |
| production_schedule_candidates（Phase 8 新規） | 複数シナリオの並列保存と「採用済み」フラグ | シナリオ×2 |
| external_import_runs / external_order_staging（Phase 7 新規） | 取込失敗、`external_order_id` 重複の検証 | 成功/失敗/重複 各 1 件 |
| alerts（§19-1 新規） | 各 alert_type（10 種）× severity の発火検証 | 種別ごとに 1 件 |
| audit_log（既存テーブルあり、件数増） | 在庫減・日報確定・発注確定・請求出力の 4 系統 × 数件 | 系統×3 件 |
| product_alias の複数件 | 既存は P001 に「旧A」1 件のみ。alias 解決衝突や複数 alias テストには増量必要 | 5 件 |
| WorkArea：機械部屋の同時稼働不可制約 | 重複割り振り防止テスト E1 で必要 | フラグ追加 |
| ProductDemand：特殊案件（チラシ）フラグ付きデータ | Phase 8 除外ロジックテスト | 1〜2 件 |
| Holiday / 営業日カレンダー | リードタイム逆算で営業日考慮するなら必須 | 月 1〜2 件 |

`prisma/seed.ts` は現状 351 行。MVP（Phase 3）までは十分網羅。Phase 4 以降で **新規テーブル追加に伴う seed 拡張**が要る（このタスクでは編集しない）。

---

## 6. テスト基盤現状

- **vitest**: バージョン `^2.1.5`（devDependencies）。`vitest.config.ts` は `globals: true` / `environment: "node"` / include は `src/**/*.test.{ts,tsx}`。`@` → `src` の alias 解決。setupFiles・coverage・testMatch オーバーライドなし。`test` スクリプトは `vitest run`、watch は `vitest`。
- **DB の扱い**: 既存 `*.test.ts` は **全て純関数ベース**で、Prisma クライアントを触らない。`prisma/dev.db`（SQLite, 約 1MB）はローカル開発用。DB マイグレーション系のスクリプト（`db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:reset`）は揃っているが、テスト時には参照していない（テスト用 DB スキーマ・トランザクション分離・fixture リセット機構なし）。
- **モック方針**: 既存テストはすべて **モック無し**。`vi.mock` や spy の使用例はゼロ。入力は全部リテラルオブジェクト、出力は `toBe` / `toMatchObject` / `toContain` などの単純アサート。Prisma も外部 API もモックしていない（呼び出していないので）。
- **環境**: `environment: "node"`、React/JSDOM 不要のロジック層中心。UI コンポーネントのレンダリングテスト（`*.test.tsx`）はゼロ。Playwright も未導入（推奨スタック側には記載あり）。
- **総評**: ロジック層の **純関数テストは厚いが、DB を絡めた統合・API・UI・監査ログ・状態遷移のテストは全く整備されていない**。Phase 4 以降に進むと、`audit.ts` の検証、Prisma を絡めた integration test、Playwright E2E のいずれかを導入する判断が必要になる。

---

## 7. 判断保留事項

このサブタスクで決められない／後続で要確認の項目：

1. **DB 統合テストの方針**：Prisma + vitest を組み合わせるか、Playwright を導入するか、testcontainers で PostgreSQL を立てるか。docs/18 では PostgreSQL 推奨だが既存は SQLite。Phase 0-1（DB 調査）の結論待ち。
2. **`*.test.tsx`（コンポーネントテスト）導入要否**：CLAUDE.md「計算式はユニットテスト化する」は計算式に閉じる解釈で、画面側は手動 or Playwright のみで良いか。Phase 0-A（画面棚卸し）と要すり合わせ。
3. **`monthly-shift-simulation.ts`／`monthly-production-forecast.ts` の docs/18 上の位置づけ**：Phase 8 前倒し実装。Phase 8 着手時にテストを大幅増やすか、現状の薄いカバレッジで止めるか。**Phase 0-3（境界線確定）が決める**。
4. **既存テストでハードコードされている時刻文字列**（`"09:00"` `"12:00"` `"15:00"` `"15:15"` `"17:00"`）の扱い：休憩時間がマスタ化される（Phase 1 シフトマスタ）と、これらの定数を共有するか個別に定義し直すか。テスト側のリファクタリング判断。
5. **`computeProductionDuration` の長時間テスト（48 時間超 → 115:15）**：時刻表記が HH:MM ではなく 3 桁時間（115:15）になっている。この表記仕様が Phase 3 完了条件として正なのか、それとも翌営業日への持ち越し計算に切り替えるべきか。**docs/14 の「翌営業日持ち越し候補」要件と矛盾しないかの確認**が要る。
6. **`schedule.test.ts` の `computeAssignablePeople` 第3 it（availablePeople=0 で部屋上限 4 を返す）**：直感的には 0 を返すべきにも見える。意図的かバグかの判断は Phase 0-2 サブタスクとの突き合わせが必要（このタスクは既存テスト編集禁止のため触らない）。
7. **監査ログのテスト粒度**：`audit.ts` のテストが無いまま、CLAUDE.md「在庫を減らす処理、日報確定、発注確定、請求出力は監査ログを残す」を満たせる根拠が現状ない。Phase 3〜6 の各サービス層追加テストで「audit_log が 1 件追加される」を必ず含めるべき、と提案するレベル。
8. **Seed リセット戦略**：`prisma/seed.ts` の冒頭が `deleteMany` を多用しているため、テスト中の seed 利用は破壊的。テスト用 seed と開発用 seed を分けるかは Phase 0-1／0-2 と連動。
