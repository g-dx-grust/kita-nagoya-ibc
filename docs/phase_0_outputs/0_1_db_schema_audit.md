# Phase 0-1 既存DBスキーマ調査結果

調査日: 2026-05-28
担当: Claude Code（Phase 0-1 サブタスク）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_1_db_schema_audit.md`](../../prompts/v2/phase_0_subtasks/0_1_db_schema_audit.md)
読込元:
- `app/prisma/schema.prisma`（現状の正）
- `app/prisma/migrations/` 配下 6 件
- `docs/10_data_model.md`
- `docs/13_business_rules.md`
- `docs/18_implementation_phase_plan.md`

備考:
- 本資料は **ギャップ可視化まで**。マイグレーション草案・スキーマ書き換え案は出さない（Phase 0-3 マター）。
- 列名はすべて `schema.prisma` から実在を確認した文字列で表記している。

---

## 0. メタ情報

- **DB プロバイダ**: SQLite（`provider = "sqlite"`）。docs/18 では PostgreSQL 推奨。**0-3 検討事項**。
- **`schema.prisma` 内の `model` 数**: 23
- **マイグレーション履歴**:
  | ファイル名 | 内容（概要） |
  |---|---|
  | 202605190001_product_planning | `Product.safetyStockQuantity` / `standardProductionLotSize` 追加、`PurchaseOrder` に shortageDate/recommendedOrderDate/sourceType/sourceId、`ProductDemand` テーブル新設 |
  | 202605190002_work_area_capacity | `WorkArea.maxPeopleCount` 追加、外部は1に補正 |
  | 202605210001_capacity_review | `ProductionCapacity.reviewStatus/reviewMemo/reviewedAt` 追加 |
  | 202605210002_employee_default_work_time | `Employee.defaultStartTime/defaultEndTime/defaultBreakMinutes` 追加 |
  | 202605210003_daily_break_windows | `ProductionPlan.breakMinutes` / `ProductionCapacity.standardBreakMinutes` を 0 に正規化（休憩は1日固定窓に方針変更） |
  | 202605210003_monthly_production_forecast | `ProductMonthlyActual` 新設 |

---

## 1. 既存テーブル一覧（schema.prisma 由来）

| テーブル(model) | 用途 | 主キー | 主な外部キー | docs/18 上の位置づけ |
|---|---|---|---|---|
| User | アプリ利用者・権限 | id | （なし） | docs/18 では明示なし。横断（認証） |
| WorkArea | 作業場所マスタ | id | （なし） | Phase 1（作業場所マスタ） |
| Product | 商品マスタ | id | defaultWorkAreaId → WorkArea | Phase 1（商品マスタ拡張） |
| ProductAlias | 商品別名 | id | productId → Product | Phase 1（曖昧名称→正式名称の名寄せ） |
| Material | 原材料マスタ | id | supplierId → Supplier | Phase 1（原料マスタ） |
| PackagingMaterial | 包装資材マスタ | id | supplierId → Supplier | Phase 1（資材マスタ） |
| Supplier | 仕入先マスタ | id | （なし） | Phase 1（マスタ）／Phase 4（発注先） |
| ProductBomItem | BOM（商品→原料/資材） | id | productId → Product / itemId は polymorphic | Phase 1（BOM） |
| ProductionCapacity | 商品×作業場所の能力 | id | productId / workAreaId | Phase 1（生産能力マスタ） |
| BillingPrice | 商品別請求単価（履歴） | id | productId → Product | Phase 6（請求） |
| Employee | 従業員マスタ | id | （なし） | Phase 1（シフト前提マスタ） |
| Shift | 個別出勤シフト | id | employeeId → Employee | Phase 1（シフト）／Phase 8（仮シフト） |
| ProductionPlan | 生産予定（手動） | id | productId / workAreaId | Phase 3（手動MVP）／Phase 8（採用先） |
| ProductionPlanRequirement | 生産予定→原料/資材 予定使用量 | id | productionPlanId → ProductionPlan、itemId は polymorphic | Phase 3（BOM 展開行）／Phase 4（material_requirements 相当） |
| ProductionPlanAssignment | 予定への従業員割当 | id | productionPlanId / employeeId | Phase 1〜3（割当）／Phase 8（自動割当） |
| StockMovement | 在庫台帳（増減） | id | （itemId は polymorphic、locationId はテキスト） | Phase 2（inventory_ledger 相当）／全フェーズの基盤 |
| PurchaseOrder | 発注（候補〜受領まで状態管理） | id | supplierId なし（itemId は polymorphic） | Phase 4（発注書）／部分的に purchase_order_candidates も兼用 |
| ProductDemand | 製品需要（受注・出荷・予測） | id | productId → Product | Phase 7（受注取込先）／Phase 8（需要予測入力） |
| ProductMonthlyActual | 月次実績数量 | id | productId → Product | Phase 8（前年実績／予測ベース） |
| DailyReport | 日報ヘッダ | id | productionPlanId(unique) | Phase 5（日報） |
| DailyReportConsumption | 日報の原料/資材消費 | id | dailyReportId → DailyReport | Phase 5（実績消費） |
| InvoiceExport | 請求/伝票出力履歴 | id | （なし） | Phase 6（請求出力履歴） |
| AuditLog | 監査ログ | id | （actorId はテキスト） | 横断（監査） |

合計 **23 model**（schema.prisma 内の `model` キーワード数と一致）。

---

## 2. ギャップ表（docs/18 §Phase 1〜9 要求テーブル × 既存実装）

判定基準:
- **有**: 同等のテーブルが既存にある（名称差異は許容、目的・主要カラムが揃っている）。
- **部分**: 同等のテーブルはあるが、docs/18 で求められる主要カラム／意味区分が欠落。
- **無**: 既存に対応テーブルなし。

| docs/18 のテーブル | 既存対応 | 状態 | 不足カラム／差異メモ | Phase |
|---|---|---|---|---|
| **products 拡張** | Product | 部分 | `valid_from` / `valid_to` なし。`production_type` は enum 風 `stock|make_to_order|both` で存在。**「予測方式」「規格情報（パック構成）」**は `packSizeG` / `packCount` で部分カバーだが、docs/18 §3「予測方式」は未定義カラム。`category` あり。 | 1 |
| **materials** | Material | 有 | `valid_from` / `valid_to` なし。`safety_stock_quantity` / `order_unit`（発注単位）が無い。`shelf_life_managed` はあるが「賞味期限管理」具体カラム（賞味期限日数等）は無い。 | 1 |
| **packaging** | PackagingMaterial | 部分 | 同上：`valid_from` / `valid_to` / `safety_stock_quantity` / `order_unit` が無い。 | 1 |
| **product_boms（= product_bom_items）** | ProductBomItem | 部分 | `valid_from` / `valid_to` なし。`mixRatio` あり（ミックス品対応）、`lossRate` あり。BOM 自体に有効期間が無い。 | 1 |
| **work_centers** | WorkArea | 部分 | docs/18 では「ROOM/LINE/MACHINE、同時稼働可否」。既存は `areaType=internal|external|warehouse` のみで `equipment_kind` 相当が無い。**同時稼働可否**を表すカラム（concurrent_operation_allowed 相当）も無い。`maxPeopleCount` あり。 | 1 |
| **production_capacities** | ProductionCapacity | 部分 | `source_type=MANUAL` 相当のカラム無し（docs/18 1-5 要求）。`locked` フラグ（Phase 5 で自動更新除外）も無い。`reviewStatus/reviewMemo/reviewedAt` で部分代替の可能性あり（**0-3 で照合**）。 | 1 / 5 |
| **shift_patterns** | （なし） | 無 | 「標準シフト・繰り返しパターン」を保持するマスタが存在しない。`Shift` は日付ごとの実シフト。 | 1 / 8 |
| **shift_breaks** | （なし） | 無 | 「休憩窓マスタ」が存在しない。`docs/13` では 12:00-13:00 / 15:00-15:15 固定で、`202605210003_daily_break_windows` migration の note では「1日固定窓」運用に切り替え済みだが、**マスタ化されていない**。 | 1 |
| **employee_shifts** | Shift | 有 | `valid_from` / `valid_to` の代わりに `date` 単独。標準シフトとの紐付け（pattern_id）が無い。 | 1 |
| **product_equivalence_groups** | （なし） | 無 | 規格変更／グラム変更商品の「統合グループ」マスタが無い。docs/18 §F、§Phase 8-3 で必須。 | 1 / 8 |
| **special_demand_events** | （なし） | 無 | チラシ・スポット案件等の「特殊案件」マスタが無い。docs/18 §E、§Phase 8-4 で必須。 | 1 / 8 |
| **inventory_ledger** | StockMovement | 部分 | 構造は近い（`itemType`/`movementType`/`sourceType`/`sourceId`）。**`status=(PLANNED|CONFIRMED|CANCELLED)` が無い**（docs/18 2-1 要求）。同 `source_type`+`source_id` のユニーク制約（docs/18 2-3）も無い（index のみ）。`movement_type` 値は `opening/planned_reserve/actual_consume/inbound/adjustment/transfer` で docs/18 想定の `PLANNED_PRODUCTION_IN` / `PLANNED_MATERIAL_USE` / `ACTUAL_*` とは語彙が違う。 | 2 |
| **material_requirements** | ProductionPlanRequirement | 部分 | 「生産予定×BOM の planned 使用量」は既存にある。ただし docs/18 §4-1 で求める「在庫推移を逆算するための独立行（required_order_date 計算入力）」としては要素不足（`required_order_date` / `lead_time_basis` 等の派生情報無し）。`shortageQuantity` / `shortageType` あり。 | 4 |
| **material_shortage_alerts** | （なし） | 無 | アラート保存先テーブルが存在しない。`ProductionPlanRequirement.shortageType` で「行ベース不足フラグ」はあるが、`alerts` 横断テーブルは無い。 | 4 / §19 |
| **purchase_order_candidates** | PurchaseOrder（status=candidate） | 部分 | `PurchaseOrder.status` が `candidate|draft|ordered_unconfirmed|confirmed|received|cancelled` の単一テーブル設計。docs/18 §4-5/4-6 は「候補 → 承認 → 本発注」を別概念に分けたい意図があり、**0-3 で「単一テーブル＋status 管理」継続か「別テーブル分離」かを決める必要**。`urgency` カラム無し。 | 4 |
| **daily_reports** | DailyReport | 有 | docs/18 §5-1 の主要カラム（actual_start/end/people/quantity/status/confirmed_at）すべて存在。`approval_by` / `approved_at` は無く `confirmedAt` のみ（命名差）。 | 5 |
| **daily_report_lines** | DailyReportConsumption | 部分 | 「消費行」は存在するが、docs/18 5-2 の入力項目「不良数」「備考」（行レベル）が無い。ヘッダ側 `note` のみ。 | 5 |
| **capacity_observations** | （なし） | 無 | 「日報→能力値中央値更新」のための観測値テーブルが無い。docs/18 §5-6 で必須。 | 5 |
| **external_import_runs** | （なし） | 無 | 取込ジョブのメタ（運転ID・実行者・件数・成否）テーブルが無い。 | 7 |
| **external_order_staging** | （なし） | 無 | 取込前 staging テーブルが無い。既存 `app/src/app/api/import` の実装と DB 設計の整合は **0-2 で確認**。 | 7 |
| **monthly_production_plans** | （なし） | 無 | 月間予定の自動計画ヘッダが無い。`ProductMonthlyActual` は「実績」であり「予定」ではない。 | 8 |
| **monthly_forecast_sources** | （なし） | 無 | 「予測の根拠（前年実績／営業／スポット／手動補正）」を分解保持する行テーブルが無い。 | 8 |
| **production_plan_runs** | （なし） | 無 | 自動生成の「ラン」メタ（生成日時・パラメータ・シナリオ）が無い。 | 8 |
| **production_schedule_candidates** | （なし） | 無 | 「候補」テーブル無し。既存 `ProductionPlan` は本予定。 | 8 |
| **production_schedule_warnings** | （なし） | 無 | 候補ごとの警告（能力超過・場所衝突・原料不足）保持先が無い。 | 8 |
| **alerts**（横断） | （なし） | 無 | docs/18 §19-1 のアラート基盤テーブルが無い。各種シ ョーテージは `ProductionPlanRequirement` 内のみ。 | §19 / 9 |
| **calculation_reasons** | （なし） | 無 | docs/18 §9-2「なぜこの数量／日／場所か」の構造化理由保存先が無い。 | 9 |
| **calculation_locks**（横断） | （なし） | 無 | 排他制御用テーブルが無い。docs/18 §12 必須。 | 横断 |

### 既存にあって docs/18 の表に明示が無いもの（参考）

| 既存テーブル | 備考 |
|---|---|
| User | docs/18 に認証要件は明示されていない。横断機能として扱う。 |
| Supplier | docs/18 §Phase 1 では「マスタ拡張」内に暗黙含意。 |
| BillingPrice | docs/18 §Phase 6 想定。 |
| ProductAlias | docs/18 では Phase 1 の「正式名称キー」運用に必要だが表には明示無し。既存活用可。 |
| InvoiceExport | docs/18 §Phase 6 想定（出力履歴）。 |
| AuditLog | docs/18 §全フェーズ横断要件と合致。 |
| ProductionPlanAssignment | docs/18 §Phase 1〜8（シフト・割当）想定。 |
| ProductDemand | docs/18 §Phase 7 受注取込／§Phase 8 需要予測の入力に該当しうる（**0-2 で API 用途確認**）。 |
| ProductMonthlyActual | docs/18 §Phase 8 の前年実績ベースに該当。 |

---

## 3. planned/actual 分離の現状（CLAUDE.md 要件）

| 観点 | 状態 | 根拠 |
|---|---|---|
| 生産数量 | **分離OK** | `ProductionPlan.plannedQuantity` ⇔ `DailyReport.actualQuantity` |
| 開始／終了時刻 | **分離OK** | `ProductionPlan.plannedStartTime/plannedEndTime` ⇔ `DailyReport.actualStartTime/actualEndTime` |
| 人数 | **分離OK** | `ProductionPlan.plannedPeopleCount` ⇔ `DailyReport.actualPeopleCount` |
| 休憩 | **混在に近い** | `ProductionPlan.breakMinutes`（migration で0正規化）と `DailyReport.actualBreakMinutes` は分離。ただし 1日固定窓のマスタ化が未実装のため運用とDBに乖離リスク |
| 原料/資材使用量 | **分離OK（だが粒度差）** | `ProductionPlanRequirement.plannedQuantity` ⇔ `DailyReportConsumption.actualQuantity`。ただし在庫台帳側で予定／実績を分ける status 値が `StockMovement.movementType` に依存しており、**`PLANNED_*` / `ACTUAL_*` の語彙整合は未保証** |
| 在庫残（製品） | **語彙未整理** | `StockMovement.movementType=planned_reserve/actual_consume/inbound/...` で「予定」「実績」「未確定発注」を語彙で表現。`status=PLANNED|CONFIRMED|CANCELLED` の独立列ではない（docs/18 §2-1 と差異） |
| 発注（未確定 vs 確定） | **status で分離されている** | `PurchaseOrder.status=ordered_unconfirmed|confirmed|received` |
| 原価（予定 vs 実績） | **部分分離** | `ProductionPlan.estLaborCost/estMaterialCost/estPackagingCost/estTotalCost` は予定原価のキャッシュ。実績原価は `DailyReportConsumption.unitPriceSnapshot` × `actualQuantity` で計算する想定だが、**実績原価キャッシュ列が DailyReport 側に無い**（要 Phase 5/6 確認） |

**総評**: 主要な数量／時刻系は分離OK。**`StockMovement` 側で予定／実績／未確定を区別する語彙が `movementType` 単独に集約されており、docs/18 が要求する独立 `status` 列に達していない**点が最大の差分。

---

## 4. active / valid_from / valid_to が無いマスタテーブル

`schema.prisma` 全文検索（grep ベース、テキスト確認）の結果：

- `active` カラムを持つテーブル: User, WorkArea, Product, Material, PackagingMaterial, Supplier, Employee
- `valid_from` / `valid_to` カラムを持つテーブル: **0 件**（`BillingPrice.effectiveFrom/effectiveTo` のみ類似命名で存在）

→ **`valid_from` / `valid_to` がドキュメント要件通りに付いているマスタは BillingPrice のみ**（しかも命名は `effectiveFrom/effectiveTo`）。

docs/18 §Phase 1「共通要件（全マスタ）」で `active`, `valid_from`, `valid_to` 必須と明記されている。以下が **追加対象**:

| テーブル | 不足カラム | 備考 |
|---|---|---|
| User | valid_from, valid_to | active のみ |
| WorkArea | valid_from, valid_to | active のみ |
| Product | valid_from, valid_to | active のみ |
| Material | valid_from, valid_to | active のみ |
| PackagingMaterial | valid_from, valid_to | active のみ |
| Supplier | valid_from, valid_to | active のみ |
| Employee | valid_from, valid_to | active のみ |
| ProductBomItem | active, valid_from, valid_to | BOM の有効期間管理が未対応 |
| ProductionCapacity | active, valid_from, valid_to | 能力値の改廃に未対応 |
| Shift | （`active`/`valid_from/to` の必要性は議論あり） | 日付ベースなので不要な可能性。**0-3 判断** |
| ProductAlias | active, valid_from, valid_to | 別名の有効期間 |

---

## 5. 破壊的変更が必要そうな箇所（Phase 0-3 で再判断）

「カラム削除」「型変更」「PK変更」「既存値の意味再定義」に該当しうる候補。**ここでは提示のみ。Phase 0-3 で「既存テーブル拡張 vs 新規分離」の方針決定後に判断する**。

| テーブル | 変更内容（候補） | 影響範囲メモ |
|---|---|---|
| StockMovement | `movementType` の enum 値を docs/18 語彙（`PLANNED_PRODUCTION_IN`, `PLANNED_MATERIAL_USE`, `ACTUAL_PRODUCTION_IN`, `ACTUAL_MATERIAL_USE`, `INBOUND_CONFIRMED`, `INBOUND_UNCONFIRMED` 等）に再定義 / 独立 `status` 列追加 | 既存 `app/src/lib/inventory.ts` 全体、`api/inventory/*`、seed.ts。**新規 inventory_ledger テーブルへ移行 + 互換ラッパー** という選択肢もあり |
| StockMovement | `(sourceType, sourceId)` ユニーク制約追加 | 既存重複データがあれば破壊的。dev.db 状況要確認 |
| PurchaseOrder | 「candidate」を別テーブル `purchase_order_candidates` に分離 | 既存 `api/purchase-candidates`／`api/purchase-orders` の URL 設計・status 機械学習に影響。**0-2 と協調が必要** |
| ProductionPlan | `breakMinutes` 列の意味再定義（既に migration で 0 正規化済）→ 列削除可能性 | `app/src/lib/calculations.ts` の参照箇所 |
| ProductionCapacity | `standardBreakMinutes` 列削除 or 「予備値」化 | 同上 |
| ProductionCapacity | `reviewStatus/reviewMemo/reviewedAt` と新規 `source_type=MANUAL` / `locked` の関係整理 | 既存 `capacity-review` 画面・API |
| ProductionPlan | `productionType` の取りうる値が 5 つ（stock/make_to_order/external/trial/other）に対し、Product 側は 3 つ（stock/make_to_order/both）。**Product 側が縮約形**で、Plan 側で `external/trial` を取れるのは「予定単位の上書き」の意図と推測。docs/18 §F の規格統合や `external` 扱いと整合性を取り直す必要あり | 既存 `production-plans` 系一式 |
| Product | `category` の意味（自由文）→ docs/18 §3「予測方式」「規格情報」を別カラムに切り出す可能性 | seed・CSV 取込スクリプト |
| BillingPrice | `effectiveFrom/effectiveTo` → 他マスタの `valid_from/valid_to` と命名統一する場合は破壊的 | API レスポンス、画面、CSV 出力 |
| 全マスタ | id 型が `cuid` 文字列。docs/10 では `uuid` 記載。**型変更は破壊的**だが、現状 `cuid` でも実害なし。**統一する場合のみ破壊的** | 全体 |
| DB プロバイダ | SQLite → PostgreSQL 移行 | `Json`/`jsonb` 列、`AuditLog.beforeJson/afterJson` 型、デプロイ構成全般 |

---

## 6. 判断保留事項

このサブタスクで決められない／後続サブタスク（特に Phase 0-2, 0-3, 0-B）に回すべき項目：

1. **`ProductionPlanRequirement` を Phase 4 の `material_requirements` として継続利用するか、別テーブルに分けるか**：既存は「生産予定の子テーブル」、docs/18 は「在庫推移計算の独立行」。判断には Phase 4 の所要計算粒度確定が必要 → **0-3**。
2. **`PurchaseOrder` 単一テーブル vs `purchase_order_candidates` + `purchase_orders` 分離**：API 既存実装（`api/purchase-candidates` と `api/purchase-orders` が分離）と矛盾しないか **0-2 で確認**。
3. **`ProductDemand` の用途**：docs/18 §7（受注取込）と §8（需要予測）のどちらの入力か、それとも両方か。`demandType=order|shipment|forecast` で型は揃っているが、**API 側でどう使い分けているかは 0-2 マター**。
4. **`StockMovement` を残して列追加するか、新規 `inventory_ledger` を立てて並行運用するか**：CLAUDE.md「既存を壊さない」要件と docs/18 §2「全在庫増減を ledger 経由」要件のバランス → **0-3**。
5. **休憩窓マスタの設計**：migration `202605210003_daily_break_windows` で「1日固定窓」運用方針に変更済みだが、対応マスタ（shift_breaks）が未実装。docs/13 では「12:00-13:00, 15:00-15:15」、docs/18 §H では「合計75分」と表現に差。**0-B で要約整合確認** → 設計は **0-3**。
6. **`reviewStatus` (ProductionCapacity) と docs/18 が想定する `locked` / `source_type=MANUAL`**：意味が一部重なるが完全一致しない。マッピング方針は **0-3**。
7. **`User` テーブルと認証**：docs/18 には認証要件が明示されていない。既存 User テーブルが API で実際に使われているかは **0-2 で確認**。
8. **`uuid` vs `cuid`**：docs/10 は uuid、現実装は cuid。実害なしと思われるが統一可否は **0-3**。
9. **DB プロバイダ（SQLite → PostgreSQL）切替時期**：dev.db 運用中。本番化のタイミング判断は **0-3 もしくは Phase 0 完了後の意思決定**。
10. **`ProductionPlan.productionType` が `stock|make_to_order|external|trial|other` の 5 値、`Product.productionType` が 3 値**：これは設計意図か後の歪みか **0-3 で要整理**。
11. **`equipment_kind`（ROOM/LINE/MACHINE）と「同時稼働可否」を WorkArea 拡張で吸収するか、別テーブル（work_centers 新設）にするか**：docs/18 §1-4 の語彙との対応方針は **0-3**。

---

## 完了条件チェック

- [x] ファイルが書き出されている（このファイル自身）。
- [x] 既存テーブルが網羅されている：`schema.prisma` の `model` 23 件と本資料 §1 の行数一致。
- [x] docs/18 §Phase 1〜9 のテーブル定義がすべて §2 ギャップ表に出ている（Phase 1: 11 件 / Phase 2: 1 件 / Phase 4: 3 件 / Phase 5: 3 件 / Phase 7: 2 件 / Phase 8: 5 件 / Phase 9: 2 件 / 横断: 1 件 = 計 28 件、すべて記載）。
- [x] 既存コードは 1 行も変更していない（schema.prisma、migrations、app/ 配下を含む）。
