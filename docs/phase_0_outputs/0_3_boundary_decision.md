# Phase 0-3 境界線確定

調査日: 2026-05-28
担当: Claude Code（このセッションで実施）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_3_boundary_decision.md`](../../prompts/v2/phase_0_subtasks/0_3_boundary_decision.md)
入力資料（必読）:
- [0_0_orientation.md](0_0_orientation.md)
- [0_1_db_schema_audit.md](0_1_db_schema_audit.md)
- [0_2_api_logic_audit.md](0_2_api_logic_audit.md)
- [0_a_screens_inventory.md](0_a_screens_inventory.md)
- [0_b_workflow_diff.md](0_b_workflow_diff.md)
- [0_c_test_coverage_diff.md](0_c_test_coverage_diff.md)

> 本ドキュメントは **判断書**。コード／schema.prisma／既存 docs は1文字も変更していない。

---

## 0. 大方針

0-0 で抽出した不変ルール 15 項目 + 0-1〜0-C の発見をもとに、**Phase 1 以降の実装で守る大方針** を確定する。

1. **既存 app/ は資産として最大限活かす**。既存テーブル23個・既存API46本・既存lib18本のうち、docs/18 で「有」「部分」と判定された箇所は原則「拡張」で対応する。
2. **「候補→人が採用→本予定化」の境界線を Phase 4 と Phase 8 で新設する**。既存 `production-plans/auto-schedule` と `product-planning/monthly-schedule` は **draft Plan を直接生成している** ため、境界線無しで本予定化されている（0-2 §4 / 0-2 §7-3,7-4）。これは docs/18 §13-D 違反。Phase 8 着手時に境界線を入れる。
3. **データの「予定／確定／キャンセル」分離は `StockMovement` への独立 `status` 列追加で実現する**（テーブル分離はしない）。理由：既存 `movementType` 語彙＋既存 API レスポンスを壊さないため。docs/18 §2-1 の語彙寄せは status 列導入の **後** に段階的に実施。
4. **PurchaseOrder は単一テーブル＋status 管理を維持する**。既存 API `/api/purchase-candidates` と `/api/purchase-orders` の URL 設計を壊さない（0-2 §5）。Phase 4 では `urgency` カラム追加と `/confirm` `/receive` 専用エンドポイント追加で対応。
5. **マスタの `valid_from/valid_to` は Phase 1 で一気に揃える**。既存マスタ 9 種すべてに追加。命名は `valid_from/valid_to`（`BillingPrice.effectiveFrom/effectiveTo` は別件として残置）。
6. **休憩窓は Phase 1 でマスタ化**（`DAILY_BREAK_WINDOWS` 定数 → `CalendarBreak` テーブル）。理由：CLAUDE.md「文字起こし上で不確実な語はコード内にハードコードしない」要件、および docs/15 §7「日によって変える必要があるかは今後確認」を吸収するため。
7. **デザインは構造を変えない**。Tailwind v4 + shadcn/ui new-york + zinc + `globals.css` のグローバルスタイル定義（h1/th/button/input 等）は既存ページが強く依存しているため、新規追加コンポーネント以外は触らない。
8. **Phase 1 でテスト基盤を強化する**。Prisma + vitest の DB 統合テスト基盤（testcontainers or in-memory SQLite）を Phase 1 末で導入。これがないと Phase 4 以降の状態遷移テスト（0-C §4 E1〜E10）が書けない。
9. **認証層（actorId）は Phase 5 着手前に導入する**。既存 `audit()` は `actorId` を取れる構造だが渡されていない（0-2 §6）。日報の承認者を識別するため Phase 5 までに必須。
10. **DB プロバイダは Phase 6 完了まで SQLite を維持**。`prisma/dev.db` 運用中。本番化（PostgreSQL）は Phase 7 業務管理連携と同タイミング。理由：早期切替はマイグレーション歪みを生み、デザイン崩しの隠れリスク（接続文字列・型差異・JSON 列挙動）になる。

---

## 1. テーブル単位の判断

### 凡例

- **A**: 既存テーブルにカラム追加（NULL 許容 + デフォルト値、既存レスポンス互換）
- **B**: 既存テーブル温存 + 新規テーブル追加（拡張部分を別テーブルに切り出す）
- **C**: 既存テーブル置換（マイグレーション計画立てて段階的に置換）
- **新規**: 既存なし、新規追加

### 1-1. Phase 1（マスタ・DB 拡張）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| products 拡張 | Product | 部分 | **A** | productionType enum 拡張、`forecastMethod`, `equivalenceGroupId`, `valid_from/to` 追加。既存 enum 値（stock/make_to_order/both）は維持。`Product.productionType` の表現拡張は破壊性が高いため Phase 1 では追加せず、`forecastMethod` を新カラムで分離する | M |
| materials | Material | 有 | **A** | `safety_stock_quantity`, `order_lot_qty`, `min_order_qty`, `valid_from/to` 追加。`leadTimeDays` は既存。 | S |
| packaging_materials | PackagingMaterial | 部分 | **A** | 同上 | S |
| product_boms | ProductBomItem | 部分 | **A** | `valid_from/to` 追加（BOM の有効期間管理） | S |
| work_centers | WorkArea | 部分 | **A** | `equipment_kind` (ROOM/LINE/MACHINE)、`concurrent_operation_allowed` 追加。`areaType=internal/external/warehouse` は維持。`valid_from/to` 追加 | M |
| production_capacities | ProductionCapacity | 部分 | **A** | `source_type` (MANUAL/DAILY_REPORT_MEDIAN)、`locked` 追加。`reviewStatus/reviewMemo/reviewedAt` は残置（用途が違うため）。`valid_from/to` 追加 | M |
| shift_patterns | （なし） | 無 | **新規** | 標準シフトパターン保持。docs/18 §1-6 で Phase 1 必須。仮シフト（Phase 8）で再利用 | M |
| shift_breaks | （なし） | 無 | **新規** | 休憩窓マスタ。`DAILY_BREAK_WINDOWS` 定数を移行。日別変動対応（docs/15 §7）の余地を残す | S |
| employee_shifts | Shift | 有 | **A** | `shift_pattern_id` を任意外部キーで追加（既存日付ベース運用と共存）。`valid_from/to` は **不要**（日付ベースのため） | S |
| product_equivalence_groups | （なし） | 無 | **新規** | 規格変更グループマスタ。Phase 1 では枠だけ、Phase 8 で本格利用 | S |
| product_equivalence_group_items | （なし） | 無 | **新規** | 上のメンバーテーブル | S |
| special_demand_events | （なし） | 無 | **新規** | 特殊案件マスタ（チラシ等）。Phase 1 では枠だけ、Phase 8 で本格利用 | S |
| 既存 ProductAlias | （docs/18 に明示なし） | - | **残置** | 別名マスタ。Phase 1 の正式名称キー運用に必要なため残置 | - |
| 既存 Supplier | （docs/18 に明示なし） | - | **A** | `valid_from/to` 追加 | S |
| 既存 BillingPrice | （docs/18 §Phase 6） | - | **残置** | `effectiveFrom/effectiveTo` を `valid_from/valid_to` に **改名しない**（既存 API 互換性のため）。Phase 1 は触らない | - |
| 既存 User | （docs/18 に認証要件明示なし） | - | **残置** | 認証層が Phase 5 までに必要（大方針 §9）。Phase 1 ではスキーマ変更しない | - |

### 1-2. Phase 2（在庫台帳分離）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| inventory_ledger | StockMovement | 部分 | **A** | 既存テーブル名 `StockMovement` を維持し、独立 `status` 列（PLANNED/CONFIRMED/CANCELLED）を追加。`(sourceType, sourceId, movementType)` ユニーク制約も追加。`movementType` enum 値は段階的に docs/18 語彙へ拡張（既存値 `opening/planned_reserve/actual_consume/inbound/adjustment/transfer` は維持し、新規 `PLANNED_PRODUCTION_IN`, `PLANNED_MATERIAL_USE`, `ACTUAL_PRODUCTION_IN`, `ACTUAL_MATERIAL_USE`, `INBOUND_CONFIRMED`, `INBOUND_UNCONFIRMED` を追加して並存） | L |
| 任意日付の理論在庫計算関数 | `lib/inventory.ts:getInventoryFor` | 部分 | **既存拡張** | 既存関数は原料・資材のみ。商品在庫も統一インターフェイスに寄せる（共通関数化） | M |

### 1-3. Phase 3（手動生産予定 MVP）対象

既存実装でほぼ満たされている。**Phase 3 は新規テーブルを追加しない**。

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| production_schedules | ProductionPlan | 有 | **残置** | テーブル名は `ProductionPlan` のまま。命名統一の改名はやらない（既存 API 互換性のため） | - |
| 所要時間計算 | calculations.ts | 有 | **残置** | テスト 41 件のうち主要 7 関数を網羅 | - |
| BOM 展開 → planned 使用量 | plan-engine.ts + ProductionPlanRequirement | 部分 | **既存拡張** | StockMovement(status=PLANNED) への発行を追加（Phase 2 完了後）。`ProductionPlanRequirement` は集計ビュー的に維持 | M |
| 製品在庫 planned 増加 | （なし） | 無 | **新規発行ロジック** | テーブル追加なし。`plan-engine.ts` が `StockMovement` に `PLANNED_PRODUCTION_IN` を発行する処理を追加 | S |

### 1-4. Phase 4（原料・資材の発注アラート）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| material_requirements | ProductionPlanRequirement | 有 | **残置** | テーブル名違いだが役割同じ。テーブル分離はしない | - |
| material_shortage_alerts | （なし） | 無 | **新規（横断 alerts に統合）** | 独立テーブルにせず、§19-1 横断 `alerts` テーブルで吸収 | S |
| purchase_order_candidates | PurchaseOrder(status=candidate) | 部分 | **A** | `urgency` (CRITICAL/WARNING/INFO) 追加、`required_order_date` は既存 `recommendedOrderDate` を使用 | M |
| 発注承認エンドポイント | （なし） | 無 | **API 追加** | `POST /api/purchase-orders/[id]/confirm`, `/receive` を新設。`audit("confirm_purchase_order")`, `audit("receive_purchase_order")` を発火 | M |
| 発注書 PDF/Excel 自動生成 | （なし） | 無 | **新規（実装のみ）** | テーブル不要。`PurchaseOrder` の状態が `confirmed` 以上のときに PDF/Excel を生成。テンプレ・ライブラリ選定は判断保留 | L |

### 1-5. Phase 5（日報・実績反映）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| daily_reports | DailyReport | 有 | **A** | `submitted_at` / `approved_by` / `approved_at` 追加。既存 `confirmedAt` も残置（cancel 用途で再定義） | M |
| daily_report_lines | DailyReportConsumption | 部分 | **A** | 行レベル `defect_quantity` / `note` 追加 | S |
| capacity_observations | （なし） | 無 | **新規** | 中央値計算用の観測テーブル | M |
| 日報入力 UI（タブレット） | （なし） | 無 | **新規（画面のみ）** | テーブル不要。`/daily-reports` 系のページ新規作成。タブレット最適化（Button size=lg、min-height 拡大）は別途デザイン補正 | L |
| 日報承認 UI | （なし） | 無 | **新規（画面のみ）** | `/daily-reports/approval` 系のページ新規作成 | L |
| 予定との差分・残数翌日振替 | （なし） | 無 | **新規ロジック** | 既存 `confirm` エンドポイントに副作用を増やすのではなく、別 service `lib/actual-reconciliation.ts` を切り出す | L |
| 能力値中央値更新（locked ガード付き） | （なし） | 無 | **新規ロジック** | 別 service `lib/capacity-learner.ts` を切り出す | M |

### 1-6. Phase 6（請求・売上伝票・手間賃）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| 手間賃集計 | BillingPrice + computeCostEstimate | 部分 | **残置** | 既存の `BillingPrice` + `Product.billingEnabled` で兼用。専用テーブル追加なし | - |
| 製造原価集計（実績ベース） | computeCostEstimate（予定原価のみ） | 部分 | **API 追加** | 実績ベース集計 API を新設（`/api/cost/actual-summary`） | M |
| 請求 CSV/Excel | invoice-exports（CSV のみ） | 部分 | **A** | Excel 出力を追加（`xlsx` ライブラリは既存導入済）。CSV は既存維持 | M |
| 既存 InvoiceExport | （docs/18 §Phase 6） | - | **残置** | 出力履歴。Phase 1 で `valid_from/to` 対象外（履歴系のため） | - |

### 1-7. Phase 7（業務管理システム連携）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| external_import_runs | （なし） | 無 | **新規** | 取込ジョブメタ | S |
| external_order_staging | （なし） | 無 | **新規** | 取込前 staging | M |
| ImportAdapter 抽象化 | api/import/* route 直書き | 無 | **既存改修** | route から `lib/import-adapter.ts` に切り出す。既存 API レスポンスは維持 | M |
| 既存 ProductDemand | docs/18 §7 受注取込先 | - | **A** | `external_order_id` UNIQUE 制約追加（二重取込防止） | S |

### 1-8. Phase 8（需要予測・自動割当・複数シナリオ）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| monthly_production_plans | （なし） | 無 | **新規** | 月間計画ヘッダ。既存 `ProductMonthlyActual` は「実績」専用に維持 | M |
| monthly_forecast_sources | （なし） | 無 | **新規** | 予測根拠の分解保持 | M |
| production_plan_runs | （なし） | 無 | **新規** | 自動生成ランのメタ | S |
| production_schedule_candidates | （なし） | 無 | **新規** | 候補テーブル。既存 `monthly-production-schedule.ts` を **候補生成側に書き換え**、direct draft Plan 作成は停止（大方針 §2） | L |
| production_schedule_warnings | （なし） | 無 | **新規** | 候補ごとの警告 | S |
| 既存 monthly-production-forecast.ts | docs/18 §8-5 と一致 | - | **残置** | テスト5件あり。Phase 8 でロジック拡張 | - |
| 既存 monthly-shift-simulation.ts | docs/18 §8-10 仮シフト | - | **既存拡張** | シナリオ並列対応の引数追加 | M |
| 既存 production-plans/auto-schedule | docs/18 とは齟齬 | - | **要再設計** | Phase 8 で「候補生成 → 採用」フローへ統合。Phase 3〜7 中は現状維持（直接 draft 作成）。**Phase 8 着手時に必ず本予定化境界を入れる** | L |

### 1-9. Phase 9（AI高度化・異常検知）対象

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| 異常検知ルールエンジン | （なし） | 無 | **新規実装** | `lib/anomaly-detection.ts` 新設 | L |
| calculation_reasons | monthly-production-forecast.ts の `reason` 文字列のみ | 部分 | **新規テーブル** | 構造化メモを DB に残す | M |
| 自動再計算ジョブ統合 | refreshCumulativeMaterialRequirements の同期処理 | 部分 | **既存改修＋新規** | キュー化（`calculation_locks` テーブル併用） | L |

### 1-10. 横断テーブル

| docs/18 テーブル | 既存対応 | 状態 | 判断 | 理由 | 工数感 |
|---|---|---|---|---|---|
| alerts（§19-1） | ProductionPlanRequirement 内 shortageType のみ | 部分 | **新規** | 10 種の alert_type を統合管理。Phase 4 で着手、Phase 9 で異常検知も乗せる | M |
| calculation_locks | （なし） | 無 | **新規** | Phase 4 着手と同タイミングで導入（同時更新の競合防止） | S |
| 既存 AuditLog | docs/18 §全フェーズ横断 | - | **A** | `actorId` を確実に入れるための拡張（Phase 5 認証導入時） | - |

### サマリ

| Phase | 新規テーブル | A 拡張 | 残置 | 合計 |
|---|---|---|---|---|
| Phase 1 | 5 | 9 | 4 | 18 |
| Phase 2 | 0 | 1 | 0 | 1 |
| Phase 3 | 0 | 0 | 2 | 2（ロジック追加のみ） |
| Phase 4 | 0 | 2 | 0 | 2（API/UI 追加のみ） |
| Phase 5 | 1 | 2 | 0 | 3（UI 大量追加） |
| Phase 6 | 0 | 1 | 2 | 3（API/出力追加） |
| Phase 7 | 2 | 1 | 0 | 3 |
| Phase 8 | 5 | 0 | 2 | 7 |
| Phase 9 | 1 | 1 | 0 | 2 |
| 横断 | 2 | 1 | 0 | 3 |
| **合計** | **16** | **18** | **10** | **44** |

---

## 2. 命名・カラム規則

### 2-1. 共通

- **DB スキーマ命名**：Prisma の `model` は **PascalCase**（既存に統一）、テーブル名（`@@map`）は **snake_case**（既存に統一）。docs/18 が `snake_case` 複数形を要求しているのは「テーブル名」、Prisma `model` は既存に揃える。
- **カラム名**：camelCase（既存に統一）、DB カラムは snake_case（Prisma の標準命名規則）。
- **マスタ系の3点セット**：`active: Boolean @default(true)`, `valid_from: DateTime?`, `valid_to: DateTime?`（NULL 許容、`valid_to=NULL` は無期限有効）。
- **`BillingPrice.effectiveFrom/effectiveTo` は改名しない**（既存 API 互換性）。
- **`id` 型**：既存に倣い `cuid`。docs/10 の `uuid` 記載は **本ドキュメントで cuid に統一を宣言**。
- **enum 値**：DB 上は文字列 enum（Prisma の `enum` 機構を使用）。既存値は **削除しない**。新規値は **追加** のみ。

### 2-2. status / state 系

- **新規 `status` 列**：UPPER_SNAKE_CASE（例：`PLANNED`, `CONFIRMED`, `CANCELLED`）。既存 `movementType` 等の lowercase enum は **既存値を維持**し、新規値のみ UPPER_SNAKE_CASE で追加。
- **混在を恐れない**：CLAUDE.md「既存を壊さない」を優先するため、語彙の完全統一は将来課題。

### 2-3. 監査ログ

- **action 命名**：snake_case（既存に統一）。例：`create`, `update`, `confirm`, `cancel`, `import_products`。
- **新規追加 action**：`confirm_purchase_order`, `receive_purchase_order`, `submit_daily_report`, `approve_daily_report`, `reject_daily_report`, `adopt_schedule_candidate`, `lock_capacity`, `unlock_capacity`。
- **`actorId`**：Phase 5 までは null 許容。Phase 5 着手時に認証導入し、以後必須化。

---

## 3. 既存 API 互換性ルール

0-2 §5 で抽出した「レスポンス互換性に注意するエンドポイント」を踏まえ、Phase 1〜9 を通じて守るルール：

### 3-1. 絶対に壊さない

- 既存 `GET /api/products/[id]` のレスポンスシェイプ（`aliases / defaultWorkArea / bomItems / capacities` 4つ込み）
- 既存 `GET /api/production-plans` の `requirements[]` フィールド名（`onHandQuantity / confirmedInbound / unconfirmedInbound / shortageQuantity / shortageType`）
- 既存 `POST /api/calculations/*` の `warnings` 文字列リテラル（例：`exceeds_baseline_end`）
- 既存 `POST /api/production-plans/auto-schedule` の `printUrls` キー名（print 画面が依存）
- 既存 `POST /api/invoice-exports` の `{ id, fileName, rowCount, totalAmount, csv }` シェイプ
- 既存 enum 値：`PlanStatusEnum`, `PurchaseOrderStatusEnum`, `shortageType`, `movementType`
- 既存 CSV ヘッダー列順（invoice 出力、master-template）

### 3-2. 追加は OK、削除は NG

- フィールド追加は OK（既存クライアントが無視するため）
- フィールド削除・型変更は NG（既存画面が壊れる）

### 3-3. URL パス

- 既存 URL は **変更しない**。`/api/inventory?itemType=` を `/api/inventory/raw-materials` 等の docs/11 寄せに変える話は **棄却**（既存画面が壊れるため）。逆に docs/11 を docs/18 の補足で更新する方針。
- 新規エンドポイントは **新規 URL** で追加。例：`POST /api/purchase-orders/[id]/confirm`。

### 3-4. ステータス遷移

- `PurchaseOrder.status` の取りうる値（`candidate|draft|ordered_unconfirmed|confirmed|received|cancelled`）は維持。新規 status 値の追加は OK だが既存値の意味変更は NG。
- `ProductionPlan.status` 同様。

---

## 4. Phase 1 のスコープ

### 4-1. Phase 1 で着手するサブタスク（docs/18 §3 の 1-1〜1-7 に対応）

| サブタスク | 内容 | 既存状態 | 工数感 | 担当ツール |
|---|---|---|---|---|
| **1-1** 商品マスタ拡張 | `forecastMethod`, `equivalenceGroupId`, `valid_from/to` 追加。既存 productionType enum は維持 | 部分実装 | M | Codex |
| **1-2** 原材料・資材マスタ拡張 | `safety_stock_quantity`, `order_lot_qty`, `min_order_qty`, `valid_from/to` 追加 | 有 | S | Codex |
| **1-3** BOM 有効期間追加 | `valid_from/to` 追加 | 部分実装 | S | Codex |
| **1-4** 作業場所マスタ拡張 | `equipment_kind`, `concurrent_operation_allowed`, `valid_from/to` 追加 | 部分実装 | M | Codex |
| **1-5** 生産能力マスタ拡張 | `source_type`, `locked`, `valid_from/to` 追加。reviewStatus は残置 | 部分実装 | M | Codex |
| **1-6** シフトパターン・休憩マスタ新設 | `shift_patterns`, `shift_breaks` 新規。`employee_shifts` に `shift_pattern_id` 追加。`DAILY_BREAK_WINDOWS` 定数を `shift_breaks` レコードに移行 | 部分実装 | M | Codex（実装）→ Claude Code（定数移行と動作確認） |
| **1-7** 統合グループ・特殊案件マスタ新設 | `product_equivalence_groups`, `product_equivalence_group_items`, `special_demand_events` 新規。Phase 1 では枠だけ | 無 | S | Codex |
| **1-S** 仕入先マスタ拡張 | `valid_from/to` 追加 | 有 | S | Codex |
| **1-T** テスト基盤強化 | Prisma + vitest の DB 統合テスト基盤。Phase 4 以降のために導入 | 無 | M | Claude Code |
| **1-U** マスタ管理画面の拡張カラム表示 | 拡張カラム（valid_from/to 等）を一覧／編集画面に追加表示。**既存レイアウトを保持** | 部分 | M | Claude Code |
| **1-V** CSV 取込スクリプトの拡張カラム対応 | `scripts/import-*.ts` 系で新カラムを読み取る | 有 | S | Codex |

### 4-2. Phase 1 で着手しない（後ろ倒し）

- **休憩窓の日別変動**（docs/15 §7、判断保留）：Phase 1 は **固定窓**で実装。日別変動は Phase 5 着手前の判断事項として残す。
- **規格変更グループの実運用**：Phase 1 はテーブル枠だけ。実際の合算予測は Phase 8。
- **特殊案件マスタの実運用**：同上。Phase 8 で除外ロジック実装。
- **shift_patterns の運用**：Phase 1 はテーブル新設＋optional 外部キーのみ。仮シフトでの利用は Phase 8。
- **認証層導入**：Phase 5 着手前。Phase 1 では `actorId` 未記録のまま。
- **DB プロバイダ切替**（SQLite → PostgreSQL）：Phase 7 着手と同時。
- **デザインシステム拡張**（Dialog/Select/Toast 等の追加 shadcn コンポーネント）：判断保留事項として残す。

### 4-3. Phase 1 の完了条件

`docs/18` §3 §「完了条件」を本リポ用に具体化：

- [ ] 全マスタテーブル（Product / Material / PackagingMaterial / Supplier / WorkArea / ProductBomItem / ProductionCapacity / Employee）に `valid_from/to` カラムが追加され、マイグレーション適用済み。
- [ ] `Product.forecastMethod` / `Product.equivalenceGroupId` が追加され、既定値で既存データが影響を受けないこと。
- [ ] `Material.safetyStockQuantity` / `Material.orderLotQty` / `Material.minOrderQty` が追加。
- [ ] `WorkArea.equipmentKind` / `WorkArea.concurrentOperationAllowed` が追加。
- [ ] `ProductionCapacity.sourceType` / `ProductionCapacity.locked` が追加。
- [ ] `shift_patterns` / `shift_breaks` / `product_equivalence_groups` / `product_equivalence_group_items` / `special_demand_events` テーブルが新設され、最低限の CRUD API が動作。
- [ ] `DAILY_BREAK_WINDOWS` 定数が `shift_breaks` テーブルのシードレコードに移行され、`calculations.ts` がマスタを読むようになる（fallback で定数も残す）。
- [ ] 既存 API のレスポンスシェイプが変わっていない（型レベルの validation が通る）。
- [ ] 既存マスタ管理画面が拡張カラム表示で動作（デザイン崩れ無し）。
- [ ] DB 統合テスト基盤が動作し、Phase 1 で追加した拡張カラムのバリデーションテストが通る。
- [ ] CSV インポートスクリプトが新カラムを取り込めること。

---

## 5. Phase 1 で触らないもの（デザイン保護）

### 5-1. ファイル単位で触らない

- `app/src/app/layout.tsx`
- `app/src/app/globals.css`
- `app/src/app/app-nav.tsx`
- `app/src/components/layout/Header.tsx`
- `app/src/components/layout/MainLayout.tsx`
- `app/src/components/layout/Sidebar.tsx`（メニュー追加は Phase 5 で）
- `app/src/components/ui/` 配下全部（Button / Badge / Card / Input / MenuCard / Table）
- `app/components.json`（shadcn 設定）

### 5-2. ページ単位で構造を変えない

- `/`（HOME）の `MenuCard` 配置は維持。統計カードの追加 OK、削除 NG。
- `/inventory` の Excel 風シートのスタイル維持。新カラム追加は OK だが、`.excel-inventory-*` クラスを使うこと。
- `/production-plans` 系の一覧・詳細画面は構造維持。
- `/shifts` の月モード／日モード切替は維持。

### 5-3. 触ってよい場所

- `app/src/app/masters/` 配下の各マスタ画面（拡張カラムの**表示追加・編集フォームの行追加**は OK）。
- `app/src/app/api/` 配下の各 route.ts（**フィールド追加**は OK、削除は NG）。
- `app/src/lib/` 配下の各 .ts（**新規ファイル追加・既存ファイル内に関数追加**は OK）。
- `app/prisma/schema.prisma`（**カラム追加・テーブル追加**は OK、既存カラム削除は NG）。
- `app/prisma/migrations/`（**新規マイグレーション追加**は OK）。
- `app/prisma/seed.ts`（**新規 seed 追加**は OK）。
- `app/scripts/import-*.ts`（新カラム対応の編集 OK）。

---

## 6. デザイン保護ルール

### 6-1. 不変ルール（Phase 1〜9 横断）

1. **Tailwind v4 + shadcn/ui new-york + zinc + `globals.css` のグローバル定義** を前提とする。これを書き換えると `<h1>`, `<th>`, `<button>`, `<input>` 等の生 HTML タグのスタイルが連鎖崩壊する。
2. **新規コンポーネント追加**は OK。`app/src/components/ui/` に追加する場合は、既存の Button/Badge/Card パターン（`cva` + CSS 変数）に**揃える**。
3. **CSS 変数（`--primary`, `--text` 等）**を新規定義しない。既存トークンを使う。
4. **配色・余白・タイポグラフィの「改善提案」はやらない**。デザインリニューアル要望が来るまで現状維持。
5. **`@radix-ui/react-dialog` 等の Radix プリミティブ未投入の前提**は維持。Dialog/Modal が必要な場合は `globals.css` の `.modal-*` クラス系統を使う。
6. **Toast は使わない**（未導入）。通知が必要な場合は `alert()` / `confirm()` または専用ページ遷移で代用。
7. **タブレット最適化（Phase 5 着手時）**：`/daily-reports` 系の新規ページのみ大型タップ領域を許容。既存ページの `globals.css` 改変は禁止。
8. **印刷ビュー（`/prints/*`）**：構造維持。`@media print` の挙動に依存しているため、`<Header>` `<Sidebar>` の `.no-print` クラスは触らない。

### 6-2. アイコン

- `lucide-react@^1.16.0` を継続使用。バージョンアップは判断保留。
- 新規アイコンは既存 `Sidebar` の使用パターン（色クラスとペア）に揃える。

### 6-3. レスポンシブ

- 既存の `MainLayout` の `lg:` ブレークポイント（>=1024px）でサイドバー常時表示、未満ではドロワー、を維持。
- `<= 760px` の `@media` クエリは `globals.css` で既に効いているため、新規ページもこれに追従する。

---

## 7. 判断保留事項（人間判断に戻すもの）

0-1〜0-C で挙がった保留事項を統合し、**Phase 1 着手判断に必要なもの**を整理する。

### 7-1. Phase 1 着手前に**必ず**確定すべき

| # | 保留事項 | 出典 | 必要なアクション |
|---|---|---|---|
| 1 | **アクター 5 区分のうち「管理者」「人」がどれを指すか** | 0-B §7-1 | 現場ヒアリング（製造管理者・経理・システム管理者の役割境界） |
| 2 | **承認フローの粒度（1段／多段）** | 0-B §7-5 | 業務責任者ヒアリング |
| 3 | **「請求」と聞こえるチラシ系案件の正式名称** | 0-1 §6-5、0-B §7-3 | 現場ヒアリング（特殊案件マスタの初期データ確定のため） |
| 4 | **作業場所・部屋・ラインの正式名称一覧** | 0-1 §6-11、0-B §7-4 | 現場ヒアリング（`work_centers` の `equipment_kind` 初期値設定） |
| 5 | **作業場所マスタの追加・改廃の権限者** | 0-B §6-#11 | 業務責任者ヒアリング |

### 7-2. Phase 1 完了までに確定すべき

| # | 保留事項 | 出典 | 必要なアクション |
|---|---|---|---|
| 6 | **休憩窓の日別変動有無** | 0-B §4、0-C §7-#4 | 現場ヒアリング。Phase 1 では固定窓だが、設計上の余地は持たせる |
| 7 | **shift_patterns の初期データ**（標準シフトパターン何種類か） | 0-3 §1-1 | 現場ヒアリング |
| 8 | **`Product.productionType` の 5 値拡張（external/trial を Product 側にも入れるか）** | 0-1 §6-10、0-2 §7-5 | 業務判断（外注予定をマスタレベルで持つか、Plan レベルだけで持つか） |
| 9 | **`uuid` vs `cuid`** | 0-1 §6-8 | 大方針 §1-2-1 で `cuid` 統一を宣言済。docs/10 を後で更新する |

### 7-3. Phase 4 着手前に確定すべき

| # | 保留事項 | 出典 | 必要なアクション |
|---|---|---|---|
| 10 | **発注書フォーマット（仕入先別、項目、メール添付可否）** | 0-2 §7-7、0-B §4 | 業務責任者ヒアリング |
| 11 | **`PurchaseOrder` を単一テーブル維持 vs `purchase_order_candidates` 分離** | 0-1 §6-2、0-2 §7-9 | 大方針 §1-4 で単一テーブル維持を宣言済。判断確定 |
| 12 | **緊急度（CRITICAL/WARNING/INFO）の閾値** | 0-C §3 Phase 4 | 業務判断（required_order_date と today の差分日数） |
| 13 | **PDF 生成ライブラリの選定** | 0-3 §1-4 | 技術判断（`pdfkit`, `pdf-lib`, `react-pdf`, 等） |

### 7-4. Phase 5 着手前に確定すべき

| # | 保留事項 | 出典 | 必要なアクション |
|---|---|---|---|
| 14 | **日報入力者の範囲・代理入力可否** | docs/18 §17 Phase 5、0-B §6-#4 | 業務責任者ヒアリング |
| 15 | **実績承認者・不在時の代理承認ルート** | docs/18 §17 Phase 5、0-B §6-#3 | 業務責任者ヒアリング |
| 16 | **タブレット端末数・Wi-Fi 到達範囲** | docs/18 §17 Phase 5、0-B §4 | 現地調査 |
| 17 | **能力値 `locked` 操作者** | 0-B §6-#7 | 業務責任者ヒアリング |
| 18 | **土曜・祝日稼働ルール** | docs/18 §17 Phase 5、0-B §6-#8 | 業務責任者ヒアリング |
| 19 | **認証方式の選定**（NextAuth / Clerk / Lucia / 自作） | 0-2 §7-8、大方針 §9 | 技術判断 |
| 20 | **タブレット UI の戦略**（別ルートグループ vs Button size=lg 兼用） | 0-A §7-6 | 技術＋デザイン判断 |

### 7-5. Phase 6〜9 着手前に確定すべき

| # | 保留事項 | 出典 |
|---|---|---|
| 21 | 売上伝票／請求 CSV のフォーマット、外注/AX の請求対象除外ルール（Phase 6） | docs/18 §17 |
| 22 | 業務管理システム連携方式（CSV から始めるか API まで行くか）（Phase 7） | docs/18 §17 |
| 23 | 予測計算で前々月を標準にするか商品別に切り替えるか（Phase 8） | docs/18 §17 |
| 24 | 規格変更商品の紐付けルール、特殊案件除外ルール（Phase 8） | docs/18 §17 |
| 25 | 自動計算結果を現場がどこまで修正してよいか（Phase 8） | docs/18 §17 |
| 26 | ローリング予測のホライズン（3か月 or 6か月）（Phase 8） | docs/18 §17 |
| 27 | 異常検知の閾値（標準偏差 n倍など）（Phase 9） | docs/18 §17 |
| 28 | LLM 説明文生成を有効化するか（Phase 9） | docs/18 §17 |
| 29 | DB プロバイダ切替時期（SQLite → PostgreSQL）（Phase 7） | 0-1 §6-9、大方針 §10 |

### 7-6. デザイン関連の保留事項

| # | 保留事項 | 出典 |
|---|---|---|
| 30 | HOME とダッシュボードの統合 / 分離 | 0-A §7-1 |
| 31 | Sidebar メニュー項目の追加位置・グルーピング | 0-A §7-2 |
| 32 | `/product-planning`・`/production-plans/monthly`・`/inventory` の関係整理 | 0-A §7-3 |
| 33 | shadcn コンポーネント追加投入の方針（Dialog/Select/Toast/Form/Tabs 等） | 0-A §7-4 |
| 34 | Tailwind v4 と `globals.css` の役割境界 | 0-A §7-5 |
| 35 | `AppNav` コンポーネントの位置づけ（デッドコードか） | 0-A §7-7 |

---

## 8. Phase 0 完了の宣言

| サブタスク | 出力ファイル | 状態 |
|---|---|---|
| 0-0 | [`0_0_orientation.md`](0_0_orientation.md) | 完了 |
| 0-1 | [`0_1_db_schema_audit.md`](0_1_db_schema_audit.md) | 完了 |
| 0-2 | [`0_2_api_logic_audit.md`](0_2_api_logic_audit.md) | 完了 |
| 0-3 | このファイル | 完了 |
| 0-A | [`0_a_screens_inventory.md`](0_a_screens_inventory.md) | 完了 |
| 0-B | [`0_b_workflow_diff.md`](0_b_workflow_diff.md) | 完了 |
| 0-C | [`0_c_test_coverage_diff.md`](0_c_test_coverage_diff.md) | 完了 |

**Phase 0 完了** ✅

---

## 9. 次のアクション（Phase 1 着手に向けて）

### 9-1. 人間判断が必要

§7-1 の **5 項目**（アクター区分、承認フロー粒度、チラシ案件正式名、作業場所一覧、マスタ改廃権限者）を業務責任者と確定する。

### 9-2. ツール側準備

§4-1 のサブタスク 1-1〜1-V に対応する **Codex / Claude Code 用プロンプト**を `prompts/v2/phase_1_subtasks/` に作成する。粒度は §4-1 のサブタスク単位（11 本）。

ツール分担：
- **Codex**：1-1, 1-2, 1-3, 1-4, 1-5, 1-6（実装側）, 1-7, 1-S, 1-V（Prisma マイグレーション・モデル追加・スキーマ拡張・サービス層実装）
- **Claude Code**：1-6（定数移行と動作確認）, 1-T（テスト基盤強化）, 1-U（マスタ画面の拡張カラム表示・デザイン崩れ確認）

### 9-3. 着手順（直列／並列）

```
人間判断 (§7-1) ─┐
                 ▼
       1-T (テスト基盤強化)  ← 先行
                 │
   ┌─────────────┼─────────────┐
   ▼             ▼             ▼
 1-1 (商品)   1-2 (原料)   1-S (仕入先)        ‖ 並列可
                 │
                 ▼
        1-3 (BOM)                              ← 1-1, 1-2 後
                 │
   ┌─────────────┼─────────────┐
   ▼             ▼             ▼
 1-4 (場所)   1-5 (能力)   1-7 (統合グループ)    ‖ 並列可
                 │
                 ▼
        1-6 (シフト・休憩)                       ← 1-4 後
                 │
   ┌─────────────┼─────────────┐
   ▼             ▼
 1-U (画面表示) 1-V (CSV 取込)                  ‖ 並列可
```

Phase 1 の見通し工数：S=6, M=9, L=0 → 中規模。テスト基盤を含めて 2〜3 週間程度のスケジュール感（並列実行前提）。
