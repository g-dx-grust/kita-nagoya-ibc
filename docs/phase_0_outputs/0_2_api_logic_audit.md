# Phase 0-2 既存API・既存ロジック調査結果

調査日: 2026-05-28
担当: Claude Code（Phase 0-2 サブタスク）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_2_api_logic_audit.md`](../../prompts/v2/phase_0_subtasks/0_2_api_logic_audit.md)
参照: [`docs/phase_0_outputs/0_0_orientation.md`](0_0_orientation.md)、[`docs/11_api_contract.md`](../11_api_contract.md)、[`docs/18_implementation_phase_plan.md`](../18_implementation_phase_plan.md) §13/§14

走査範囲（実在確認済み）:

- `app/src/app/api/` 配下の `route.ts`: **46 ファイル**
- `app/src/lib/` 配下の `.ts`（非テスト 18 / テスト 8 = **計 26**）
- `audit.ts` の import 元: **38 ファイル**（全 `route.ts` のうちマスタ GET 専用や `calculations/*`, `inventory/route.ts`, `daily-reports/route.ts`, `product-planning/suggestions/route.ts` を除いてほぼ全て）

---

## 1. 既存 API エンドポイント一覧

備考:

- 「依存 lib」列は `from "@/lib/*"` 直接 import を列挙。`prisma`, `http`, `schemas` は基本的に全 route.ts で使う前提のため簡略表記。
- 「画面の利用」は推定（Phase 0-2 では HTTP リクエスト確認は禁止のため、`app/src/app/*` のディレクトリ名から推定）。
- パスは `/api/` プレフィックスを省略しない。`docs/11_api_contract.md` との対応も記載。

### 1-1 マスタ系

| メソッド | パス | 概要（入出力） | 依存 lib | 画面の利用 | 監査 | docs/11 対応 |
|---|---|---|---|---|---|---|
| GET | `/api/products` | 商品一覧（q検索、includeInactive。aliases/defaultWorkArea include） | prisma, http | `/masters/products` | - | ○ |
| POST | `/api/products` | 商品作成（ProductCreateSchema、aliases同時作成） | prisma, audit, schemas | `/masters/products` | create | ○ |
| GET | `/api/products/[id]` | 商品単票（aliases/defaultWorkArea/bomItems/capacities include） | prisma | `/masters/products` | - | ○ |
| PUT | `/api/products/[id]` | 商品更新（aliases差し替え含む） | prisma, audit, schemas | `/masters/products` | update | ○ |
| DELETE | `/api/products/[id]` | 商品ソフトデリート（active=false） | prisma, audit | `/masters/products` | deactivate | ○ |
| GET | `/api/products/[id]/bom` | BOM 取得 | prisma | `/masters/products` | - | ○ |
| PUT | `/api/products/[id]/bom` | BOM 一括 replace | prisma, audit, schemas | `/masters/products` | replace_bom | ○ |
| GET | `/api/materials` | 原料一覧（q検索、supplier include） | prisma | `/masters/materials` | - | ○ |
| POST | `/api/materials` | 原料作成 | prisma, audit, schemas | `/masters/materials` | create | ○ |
| GET | `/api/materials/[id]` | 原料単票 | prisma | `/masters/materials` | - | ○ |
| PUT | `/api/materials/[id]` | 原料更新 | prisma, audit, schemas | `/masters/materials` | update | ○ |
| DELETE | `/api/materials/[id]` | 原料ソフトデリート | prisma, audit | `/masters/materials` | deactivate | ○ |
| GET | `/api/packaging-materials` | 資材一覧 | prisma | `/masters/packaging` | - | ○ |
| POST | `/api/packaging-materials` | 資材作成 | prisma, audit, schemas | `/masters/packaging` | create | ○ |
| GET | `/api/packaging-materials/[id]` | 資材単票 | prisma | `/masters/packaging` | - | ○ |
| PUT | `/api/packaging-materials/[id]` | 資材更新 | prisma, audit, schemas | `/masters/packaging` | update | ○ |
| DELETE | `/api/packaging-materials/[id]` | 資材ソフトデリート | prisma, audit | `/masters/packaging` | deactivate | ○ |
| GET | `/api/work-areas` | 作業場所一覧 | prisma | `/masters/work-areas` | - | ○ |
| POST | `/api/work-areas` | 作業場所作成 | prisma, audit, schemas | `/masters/work-areas` | create | ○ |
| PUT | `/api/work-areas/[id]` | 作業場所更新 | prisma, audit, schemas | `/masters/work-areas` | update | ○ |
| DELETE | `/api/work-areas/[id]` | 作業場所ソフトデリート | prisma, audit | `/masters/work-areas` | deactivate | ○ |
| GET | `/api/employees` | 従業員一覧 | prisma | `/masters/employees` | - | ○ |
| POST | `/api/employees` | 従業員作成（defaultStart/End/Break時間バリデーション） | prisma, audit, schedule, schemas | `/masters/employees` | create | ○ |
| PUT | `/api/employees/[id]` | 従業員更新 | prisma, audit, schedule, schemas | `/masters/employees` | update | ○ |
| DELETE | `/api/employees/[id]` | 従業員ソフトデリート | prisma, audit | `/masters/employees` | deactivate | ○ |
| GET | `/api/suppliers` | 仕入先一覧（active条件なし） | prisma | マスタ画面 | - | △（docs/11 に未記載） |
| POST | `/api/suppliers` | 仕入先作成 | prisma, audit, schemas | マスタ画面 | create | △ |
| GET | `/api/capacities` | 生産能力一覧（productId/workAreaId フィルタ） | prisma | `/capacity-review` | - | △（docs/11 にエンドポイント記載無し、Phase 1 範囲） |
| POST | `/api/capacities` | 生産能力 upsert（productId+workAreaId、reviewStatus含む） | prisma, audit, schemas | `/capacity-review` | upsert | △ |
| DELETE | `/api/capacities/[id]` | 生産能力削除 | prisma, audit | `/capacity-review` | delete | △ |
| GET | `/api/billing-prices` | 請求単価一覧（productId フィルタ、effectiveFrom desc） | prisma | `/masters/products` 経由 | - | △（docs/11 になし、Phase 6 関連） |
| POST | `/api/billing-prices` | 請求単価作成（effectiveFrom/To） | prisma, audit, schemas | 同上 | create | △ |

### 1-2 シフト・出勤

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| GET | `/api/shifts?date=` | 指定日の従業員別シフト | prisma | `/shifts` | - | ○ |
| PUT | `/api/shifts` | 指定日のシフト一括 replace（employeeDefaults 更新も） | prisma, audit, schedule, schemas | `/shifts` | replace_shifts | ○ |
| GET | `/api/shifts/month?yearMonth=` | 月単位シフト+従業員一覧 | prisma | `/shifts` | - | △ |
| PUT | `/api/shifts/month` | 月単位シフト一括 replace（送られないセルは削除＝オフ） | prisma, audit, schedule, schemas | `/shifts` | replace_shifts_month | △ |

### 1-3 生産予定・計算

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| GET | `/api/production-plans` | 生産予定一覧（dateFrom/To, workAreaId, status） | prisma | `/production-plans` | - | ○ |
| POST | `/api/production-plans` | 生産予定作成→`recalculateProductionPlan` で所要時間/BOM/原価を即時算出 | prisma, audit, plan-engine, schemas | `/production-plans/new` | create | ○ |
| GET | `/api/production-plans/[id]` | 単票（requirements/assignments include） | prisma | `/production-plans/[id]` | - | ○ |
| PUT | `/api/production-plans/[id]` | 更新→recalc | prisma, audit, plan-engine, schemas | 同上 | update | ○ |
| DELETE | `/api/production-plans/[id]` | 物理削除（cascade で requirements/assignments も） | prisma, audit | 同上 | delete | ○（PUTでcancel代替） |
| POST | `/api/production-plans/[id]/confirm` | status=confirmed（実在庫減らさない＝予定引当） | prisma, audit | 同上 | confirm | ○ |
| POST | `/api/production-plans/[id]/cancel` | status=cancelled | prisma, audit | 同上 | cancel | ○ |
| POST | `/api/production-plans/[id]/recalculate` | 監査ログなしで recalc のみ | prisma, plan-engine | 同上 | - | ○ |
| GET/PUT | `/api/production-plans/[id]/assignments` | 担当割当（重複/シフト外/他予定オーバーラップ検証） | prisma, audit, schedule, schemas, time | 同上 | replace_assignments | ○（部分） |
| POST | `/api/production-plans/auto-schedule` | 同日複数商品の自動枠取り（duration/max_quantity/required_people の3モード、人員枠制約、空作業場所のキャパは template から仮適用） | prisma, audit, calculations, plan-engine, schedule, schemas, time, paths | `/production-plans/auto` | auto_schedule | ✕（docs/11 に未記載） |
| POST | `/api/production-plans/bulk-confirm` | 複数IDをまとめて status=confirmed | prisma, audit, schemas | 同上 | bulk_confirm | ✕ |
| POST | `/api/production-plans/bulk-delete` | ids または filter（dateFrom/To 必須）で一括削除。確定済み日報があるものはスキップ | prisma, audit, schemas | 同上 | bulk_delete | ✕ |
| POST | `/api/calculations/production-duration` | 数量+人数+開始→終了時刻、休憩は固定 | calculations, plan-engine, schemas, http | 計算プレビュー | - | ○ |
| POST | `/api/calculations/max-quantity-in-time-window` | 時間枠→最大数量+あふれ | calculations, plan-engine, schemas | 同上 | - | ○ |
| POST | `/api/calculations/required-people` | 数量+時間枠→必要人数 | calculations, plan-engine, schemas | 同上 | - | ○ |
| POST | `/api/calculations/material-requirements` | 商品+数量→BOM展開+在庫照合 | calculations, inventory, plan-engine, schemas | 同上 | - | ○ |

### 1-4 在庫

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| GET | `/api/inventory?itemType=&date=` | 原料/資材の onHand/confirmedInbound/unconfirmedInbound | inventory, http, prisma | `/inventory` | - | ○（raw-materials/packaging-materials を統合） |
| POST | `/api/inventory/adjustments` | StockMovement 1件作成→material-forecast 再計算 | prisma, audit, material-forecast, http | `/inventory` | （movementType） | ○ |

### 1-5 発注

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| POST | `/api/purchase-candidates/generate` | dateFrom/To 範囲で `loadMaterialForecast` から hard_shortage を抽出し PurchaseOrder(status=candidate) を生成。replaceExistingCandidates=true で既存candidateを delete | prisma, audit, material-forecast, http | `/purchases` | generate_purchase_candidates | △（docs/11 では `/purchase-orders/from-shortage`） |
| GET | `/api/purchase-orders/[id]` | 単票 | prisma | `/purchases` | - | ○ |
| PUT | `/api/purchase-orders/[id]` | 更新→material-forecast 再計算 | prisma, audit, material-forecast, schemas | `/purchases` | update | ○ |
| DELETE | `/api/purchase-orders/[id]` | candidate/draft/cancelled なら物理削除、それ以外は status=cancelled | prisma, audit, material-forecast | `/purchases` | delete/cancel | ○ |

備考: docs/11 が定義する `GET /api/purchase-orders`（一覧）、`POST /api/purchase-orders`（手動作成）、`/confirm`、`/receive` は **未実装**。

### 1-6 商品在庫 / 需要 / 月次実績 / 月間スケジュール提案

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| GET | `/api/product-demands?dateTo=&status=` | 需要（受注/出荷/予測）一覧 | prisma | `/product-planning` | - | ✕（docs/11 になし、Phase 7/8 系の前倒し） |
| POST | `/api/product-demands` | 需要作成 | prisma, audit, schemas | 同上 | create | ✕ |
| GET | `/api/product-demands/[id]` | 単票 | prisma | 同上 | - | ✕ |
| PUT | `/api/product-demands/[id]` | 更新 | prisma, audit, schemas | 同上 | update | ✕ |
| DELETE | `/api/product-demands/[id]` | status=cancelled に | prisma, audit | 同上 | cancel | ✕ |
| GET | `/api/product-monthly-actuals?yearMonth=&productId=` | 商品×年月の実績一覧 | prisma | `/product-planning/monthly`（推定） | - | ✕（Phase 8 系） |
| POST | `/api/product-monthly-actuals` | upsert（productId+yearMonth） | prisma, audit, schemas | 同上 | upsert | ✕ |
| GET | `/api/product-monthly-actuals/[id]` | 単票 | prisma | 同上 | - | ✕ |
| PUT | `/api/product-monthly-actuals/[id]` | 更新 | prisma, audit, schemas | 同上 | update | ✕ |
| DELETE | `/api/product-monthly-actuals/[id]` | 物理削除 | prisma, audit | 同上 | delete | ✕ |
| GET | `/api/product-planning/suggestions?dateFrom=&dateTo=` | 商品在庫+需要+予定生産から不足分の提案リスト | product-planning-service, http | `/product-planning` | - | ✕（Phase 8 系） |
| POST | `/api/product-planning/monthly-schedule` | 月間予定の自動生成（historical_actual/inventory_shortage の2モード）→ `simulateMonthlyShiftSchedule` でシフトに乗せて ProductionPlan(draft) を作成 | prisma, audit, monthly-production-schedule, monthly-shift-simulation, plan-engine, product-planning-service, schemas, paths | `/production-plans/monthly` | monthly_schedule_generate | ✕（Phase 8 そのもの） |

### 1-7 日報

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| GET | `/api/daily-reports?dateFrom=&dateTo=&status=` | 日報一覧（consumptions include、plan を別途 join） | prisma | `/capacity-review` 系（推定） | - | ○ |
| POST | `/api/daily-reports/from-production-plan/[id]` | 生産予定からドラフト日報を作成/上書き、消費明細含む | prisma, audit | 同上 | create/update | ○ |
| POST | `/api/daily-reports/[id]/confirm` | 確定→StockMovement 発行（actual_consume、product inbound）+ ProductionPlan.status=completed + material-forecast 再計算 | prisma, audit, material-forecast | 同上 | confirm | ○ |

備考: docs/11 の `PUT /api/daily-reports/{id}`, `POST /void` は **未実装**。

### 1-8 請求・取込・テンプレート

| メソッド | パス | 概要 | 依存 lib | 画面 | 監査 | docs/11 |
|---|---|---|---|---|---|---|
| POST | `/api/invoice-exports` | confirmed の DailyReport を集計し CSV を組み立て、InvoiceExport を保存 | prisma, audit, csv, schemas | `/invoices` | export_invoice | ○ |
| GET | `/api/invoice-exports` | 出力履歴 | prisma | 同上 | - | ○（履歴） |
| POST | `/api/import/products` | text/csv で商品一括 upsert（aliases pipe区切り、default_work_area_name で名前→ID変換） | prisma, audit, csv | `/masters/csv-import.tsx` | import_products | ○ |
| POST | `/api/import/materials` | text/csv で原料一括 upsert | prisma, audit, csv | 同上 | import_materials | ○ |
| GET | `/api/export/master-template?type=` | products / materials / packaging のテンプレ CSV をダウンロード | csv, http | 同上 | - | ○ |

備考: docs/11 が要求する `POST /api/import/packaging-materials`, `/import/shifts`, `/import/stock-opening-balances` は **未実装**。

---

## 2. 既存 lib モジュール一覧

| ファイル | 主なエクスポート | 責務 | テスト |
|---|---|---|---|
| `audit.ts` | `audit()` | `AuditLog` テーブルへ 1 行追加（action/entityType/entityId/actorId/before/after）。`actorId` は受け取れるが現状全 route で **渡されていない**（認証未実装） | 無 |
| `calculations.ts` | `computeProductionDuration`, `computeMaxQuantityInTimeWindow`, `computeRequiredPeople`, `computeMaterialRequirements`, `computeCostEstimate`, `computeUnitsPerPersonHourFromLaborUnitPrice`, `computeBreakMinutesInTimeWindow`, `computeWorkingMinutesInTimeWindow`, `addWorkingMinutesSkippingBreaks`, `nextWorkingMinute`, `isDailyBreakMinute`, `DAILY_BREAK_WINDOWS`, `DEFAULT_HOURLY_LABOR_RATE` | Phase 1 計算ライブラリ（純粋関数）。所要時間／時間枠最大数量／必要人数／BOM 展開×在庫照合／原価／12:00-13:00・15:00-15:15 の固定休憩を跨ぐ working-time 加算 | `calculations.test.ts` 有 |
| `csv.ts` | `parseCsv`, `parseCsvWithHeader`, `toCsv` | RFC-4180 ish の最小 CSV パーサ／エンコーダ。BOM 対応 | `csv.test.ts` 有 |
| `http.ts` | `ok`, `created`, `badRequest`, `notFound`, `serverError`, `parseJson`, `HttpError`, `handleError` | Next.js API Route の共通ヘルパ。Zod エラーを 400 に整形 | 無 |
| `inventory.ts` | `getInventoryFor(itemType, itemIds, asOfDate)` | `StockMovement` の累積 + `PurchaseOrder.status` から `onHand / confirmedInbound / unconfirmedInbound` を算出（asOf 日付未満） | 無 |
| `labels.ts` | `productionTypeLabel`, `planStatusLabel`, `planStatusClass`, `areaTypeLabel`, `employmentTypeLabel`, `packagingKindLabel` | enum→日本語ラベルの単純変換 | 無 |
| `material-forecast.ts` | `buildMaterialForecast`, `loadMaterialForecast`, `refreshCumulativeMaterialRequirements`, `itemKey`, type群 | 期間内の `productionPlanRequirement` を時系列ソートしながら累積消費 / 入荷反映、shortageType (none/hard/unconfirmed) を計算。DB 反映版は `ProductionPlanRequirement` の `onHand/confirmed/unconfirmed/shortage*` を一括更新 | `material-forecast.test.ts` 有 |
| `monthly-inventory-sheet.ts` | `buildMonthlyInventorySheet`, type群 | 月別の Excel風 在庫表（日次 usage/inbound/balance）の集計（純粋関数） | `monthly-inventory-sheet.test.ts` 有 |
| `monthly-production-forecast.ts` | `computeHistoricalMonthlyProductionForecasts`, `getHistoricalForecastReferenceMonths`, `yearMonthFromDateInput`, type群 | 「前々月前年比」方式の月次予測（前年同月 × 当年-2 / 前年-2 比率）。商品 productionType + 標準ロットでの丸めまで含む | `monthly-production-forecast.test.ts` 有 |
| `monthly-production-schedule.ts` | `computeMonthlyProductionSchedule`, `aggregateMonthlySuggestions`, type群 | 安全在庫 / 受注期日不足から日別生産候補を生成。productionLeadDays で前倒し | `monthly-production-schedule.test.ts` 有 |
| `monthly-shift-simulation.ts` | `simulateMonthlyShiftSchedule`, type群 | 候補数量 × シフト × 部屋 × 生産能力 をマッチングして「いつ・どこで・誰が」までシミュレーション | `monthly-shift-simulation.test.ts` 有 |
| `paths.ts` | `KITAGOYA_BASE_PATH`, `KITAGOYA_API_BASE_PATH`, `kitagoyaPath`, `kitagoyaApiPath`, `stripKitagoyaBasePath` | サブパスマウント用のパスヘルパ（`/manufacturing/kitanagoya` 既定） | 無 |
| `plan-engine.ts` | `loadProductBom`, `getCurrentBillingUnitPrice`, `getCapacity`, `recalculateProductionPlan` | 1 つの ProductionPlan に対し BOM→計算→`ProductionPlanRequirement` 再作成→Plan の終了時刻/原価キャッシュ更新→90日先まで material-forecast 再計算 | 無（calculations.test 経由） |
| `prisma.ts` | `prisma` | グローバル PrismaClient | 無 |
| `product-planning-service.ts` | `loadProductPlanningSuggestions`, `loadMonthlyProductionSchedulePreview`, `MonthlyProductionPlanningBasis` | DB から商品・在庫・需要・月次実績を読み出し、`product-planning.ts` または `monthly-production-schedule.ts` に渡す結合層。historical_actual と inventory_shortage の 2 planningBasis を切替 | 無 |
| `product-planning.ts` | `computeProductPlanningSuggestions`, type群 | 安全在庫+需要 vs 在庫+予定 の単純不足計算（純粋関数） | `product-planning.test.ts` 有 |
| `schedule.ts` | `timeRangesOverlap`, `isValidTimeRange`, `computeAssignablePeople`, type | 時間範囲のオーバーラップ判定／部屋上限と利用可能人数から配置人数を決める | `schedule.test.ts` 有 |
| `schemas.ts` | Zod スキーマ群（Product/Material/Packaging/WorkArea/Employee/Supplier/Bom/Capacity/BillingPrice/ProductDemand/ProductMonthlyActual/PurchaseOrder/ProductionPlan/AutoSchedule/MonthlyProductionSchedule/Calc系/Shift系） | API 入力バリデーション。`PlanProductionTypeEnum` は `external/trial/other` まで含む | 無 |
| `time.ts` | `parseHM`, `formatHM`, `diffMinutes`, `addMinutes` | "HH:MM"⇔分の変換（ローカル時計、TZなし） | 無 |
| `utils.ts` | `cn` | clsx + tailwind-merge | 無 |

テスト総数: **8 本**（calculations / csv / material-forecast / monthly-inventory-sheet / monthly-production-forecast / monthly-production-schedule / monthly-shift-simulation / product-planning / schedule）

---

## 3. docs/18 機能 ↔ 既存実装マッピング

判定凡例: 有=ほぼ充足、部分=主機能はあるが docs/18 要件で不足、無=未実装、転=新規実装フェーズで読み替え必要

### Phase 1：マスタ・DB拡張

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補（メモ） |
|---|---|---|---|
| 1-1 商品マスタ拡張（生産区分・予測方式・規格情報） | 部分 | `api/products/*`, `lib/schemas.ts` ProductCreateSchema, `prisma:Product` | productionType は `stock/make_to_order/both` のみ。docs/18 §F の規格変更グループ、予測方式（営業予測/前年比）枠は無し。`Product` に予測方式・統合グループ ID を持たせるか別表に切り出すかは 0-3 |
| 1-2 原材料／資材マスタ（リードタイム・安全在庫・発注単位） | 部分 | `api/materials/*`, `api/packaging-materials/*`, `prisma:Material/PackagingMaterial` | leadTimeDays/standardUnitPrice/shelfLifeManaged あり。安全在庫・発注単位（ordering unit）は商品側にしか無い／`Supplier.orderingUnit` のみ |
| 1-3 BOM（商品→原料/資材） | 有 | `api/products/[id]/bom`, `prisma:ProductBomItem`, `BomReplaceSchema` | quantityPerUnit, lossRate, mixRatio, unit, note まで完備 |
| 1-4 作業場所マスタ（ROOM/LINE/MACHINE） | 部分 | `api/work-areas/*`, `prisma:WorkArea` | areaType=internal/external/warehouse はある。同時稼働可否、ライン/マシン区別は未対応 |
| 1-5 生産能力マスタ（商品×作業場所×人数×時間生産量） | 有 | `api/capacities/*`, `prisma:ProductionCapacity`, `CapacityUpsertSchema` | reviewStatus(unreviewed/confirmed/needs_review) あり、`locked` フラグ（Phase 5 自動更新拒否用）は **無し**。docs/18 §5-6 |
| 1-6 シフト・休憩・カレンダー | 部分 | `api/shifts/*`, `prisma:Shift/Employee`, `lib/schedule.ts` | 月単位 PUT あり。固定休憩 12:00-13:00 + 15:00-15:15 は `calculations.ts:DAILY_BREAK_WINDOWS` にハードコード（要マスタ化検討） |
| 1-7 商品統合（規格変更）・特殊案件マスタ | 無 | - | Phase 1 では枠だけ、Phase 8 で本格利用。新規テーブル必要 |
| 共通: active/valid_from/valid_to | 部分 | 全マスタに `active` あり | `valid_from / valid_to` は **無し**。Phase 0-1 で要設計判断 |

### Phase 2：在庫台帳の分離

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 2-1 inventory_ledger テーブル | 転 | `prisma:StockMovement` | docs/18 では `inventory_ledger` 名で `item_type/movement_type/source_type/source_id/status` を要求。既存 `StockMovement` には `sourceType/sourceId/movementType/unitPrice` あり、`status(PLANNED/CONFIRMED/CANCELLED)` は **無し**。改名 or 拡張は 0-3 |
| 2-2 在庫増減を全て ledger 経由に | 部分 | `api/inventory/adjustments`, `api/daily-reports/[id]/confirm`, `lib/inventory.ts` | adjustments + 日報確定経由は ledger 化済み。生産予定登録時に PLANNED 行を発行する設計には **なっていない**（要件は予定の累積を `ProductionPlanRequirement` テーブルで持っている） |
| 2-3 二重登録防止（source_type+source_id ユニーク） | 無 | - | `StockMovement` に該当ユニーク制約無し。`daily-reports/[id]/confirm` で `deleteMany({sourceType, sourceId})` で都度クリアし冪等化している |
| 2-4 任意日付の理論在庫計算関数 | 部分 | `lib/inventory.ts:getInventoryFor`, `lib/material-forecast.ts:buildMaterialForecast` | 原料/資材は確立。商品在庫は `product-planning-service` 内で `StockMovement.groupBy` を直書きしており共通関数になっていない |
| 2-5 未確定発注の区分表示 | 有 | `lib/inventory.ts` で `confirmedInbound / unconfirmedInbound` を分離 | 画面側で別カラム表示すれば達成可能 |

### Phase 3：手動生産予定 MVP

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 3-1 production_schedules テーブル | 有 | `prisma:ProductionPlan`（productId/workAreaId/plannedQuantity/plannedPeopleCount/plannedStart/End/breakMinutes/status/baselineEndTime/overtimeMinutes） | テーブル名が `production_plans` だが構造は同等 |
| 3-2 所要時間計算サービス | 有 | `calculations.ts:computeProductionDuration` + `api/calculations/production-duration` + `plan-engine.ts:recalculateProductionPlan` | 12:00-13:00 / 15:00-15:15 固定休憩スキップ込み |
| 3-3 時間枠制約（時間内で何個／あふれ） | 有 | `calculations.ts:computeMaxQuantityInTimeWindow` + `api/calculations/max-quantity-in-time-window` | overflowQuantity 返却 |
| 3-4 BOM 展開→原料/資材 planned 使用量 | 部分 | `plan-engine.ts:recalculateProductionPlan` + `ProductionPlanRequirement` テーブル | ledger 行は発行していない（テーブル別保持）。docs/18 要件と齟齬。0-3 で方針決め |
| 3-5 製品在庫 planned 増加 | 無 | - | 製品在庫の planned_in は記録していない（実際は日報確定で actual のみ発行） |
| 3-6 在庫不足・マイナス・未確定入荷の画面判別 | 部分 | `ProductionPlanRequirement.shortageType` (none/hard_shortage/unconfirmed_dependency) + `material-forecast` | 計算側は揃う。画面はディレクトリのみ確認、表示充足度は 0-A 担当 |
| 必要人数モード | 有 | `calculations.ts:computeRequiredPeople` + route | docs/18 にこのモードは直接無いが残してOK |

### Phase 4：原料・資材の発注アラート

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 4-1 material_requirements（生産予定×BOM） | 有 | `prisma:ProductionPlanRequirement`, `plan-engine.ts` で発行 | テーブル名は異なるが役割同じ |
| 4-2 原料/資材の在庫推移計算 | 有 | `lib/material-forecast.ts:loadMaterialForecast` | 日付ソートしながら累積 |
| 4-3 不足検出（安全在庫割れ／マイナス） | 部分 | `material-forecast.ts` で `shortageType=hard_shortage / unconfirmed_dependency` | 安全在庫の概念は `Product.safetyStockQuantity` のみ。原料側の safety stock は無し。要追加 |
| 4-4 リードタイム逆算→required_order_date | 有 | `purchase-candidates/generate/route.ts` で `shortageDate - leadTimeDays` を計算し `recommendedOrderDate` に格納 | `Material.leadTimeDays` 使用 |
| 4-5 発注候補生成と緊急度判定 | 部分 | `purchase-candidates/generate` + `PurchaseOrder(status=candidate)` | 緊急度（CRITICAL 等）の概念は無し。docs/11 / docs/18 で要追加 |
| 4-6 候補→承認→本発注化 | 部分 | `PUT /api/purchase-orders/[id]` で status を `candidate→draft/ordered_unconfirmed/confirmed` に手動遷移 | 専用「承認」エンドポイントは無く監査ログ action は "update" 一本 |
| 4-7 発注書 PDF/Excel 自動生成 | 無 | - | 文字起こし §L 要件。完全に未実装 |

### Phase 5：日報電子化・実績反映

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 5-1 daily_reports / daily_report_lines テーブル | 有 | `prisma:DailyReport / DailyReportConsumption` | productionPlanId とユニーク（1plan=1report） |
| 5-2 タブレット入力 UI | 部分 | `api/daily-reports/from-production-plan/[id]` で create/update | UI 充足度は 0-A |
| 5-3 提出→承認フロー（承認前は在庫反映禁止） | 部分 | `daily-reports/[id]/confirm` で確定し ProductionPlan を completed に。承認前 draft は ledger 反映なし | 承認権限・提出ステータスは無し（draft/confirmed の二択） |
| 5-4 承認時 ACTUAL_* を ledger に発行 | 有 | confirm エンドポイントで `actual_consume`（負）+ product `inbound`（正）を `StockMovement` に挿入 | status カラム無し |
| 5-5 予定との差分計算・残数振替 | 無 | - | 確定 = plan を completed にするだけ。残数翌日振替は未実装 |
| 5-6 capacity_observations 蓄積→中央値で能力値更新 | 無 | - | テーブルも `ProductionCapacity.locked` フラグも無い |

### Phase 6：請求・売上伝票・手間賃

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 6-1 手間賃集計（実績数量 × 手間賃単価） | 部分 | `calculations.ts:computeCostEstimate`（laborCost = qty × billingUnitPrice）+ `plan-engine.ts` で BillingPrice 参照 | `BillingPrice` テーブル + 商品の `billingEnabled`。Phase 6 の独立した手間賃テーブルは無く、`BillingPrice` で兼用 |
| 6-2 製造原価集計（材料消費×単価＋手間賃＋他） | 部分 | `computeCostEstimate`：laborCost + materialCost + packagingCost、`ProductionPlan.est*Cost` にキャッシュ | 「実績原料消費 × 単価」は consumptions の `unitPriceSnapshot` から計算可能だが、実績ベース集計用の API は無し |
| 6-3 請求対象フラグ（外注/AX 除外） | 部分 | `Product.billingEnabled`, `WorkArea.areaType=external`, `BillingPrice.billingTarget` | invoice-exports は `Product.billingEnabled` で除外 |
| 6-4 売上伝票／請求 CSV/Excel | 部分 | `POST /api/invoice-exports` で CSV のみ | Excel 出力は無し。手間賃 Excel 既存フォーマットとの突合せは未 |
| 6-5 出力履歴・監査ログ | 有 | `InvoiceExport` テーブル + `audit("export_invoice")` | |

### Phase 7：業務管理システム連携

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 7-1 取込基盤（external_import_runs / staging） | 無 | - | 既存 import は staging なし、直接マスタ upsert |
| 7-2 CSV/Excel 取込→staging | 部分 | `api/import/products`, `api/import/materials`, `api/export/master-template` | staging に分けていない |
| 7-3 商品/顧客コード紐付け | 部分 | products import で `default_work_area_name → ID` 変換、aliases pipe分割 | 顧客コードのマスタ無し |
| 7-4 検証OKのみ本反映、external_order_id 重複防止 | 無 | - | `ProductDemand.externalRef` フィールドはあるが unique 制約は未確認（schema を 0-1 で確認） |
| 7-5 取込後の出荷予定・在庫推移再計算 | 部分 | adjustments / PO 更新で `refreshCumulativeMaterialRequirements` を呼ぶ | 受注/出荷取込からは未呼び出し |
| 7-6 ImportAdapter 抽象化 | 無 | - | route 直書き |

### Phase 8：需要予測・日別自動割当

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 8-1 monthly_production_plans / monthly_forecast_sources | 部分 | `prisma:ProductMonthlyActual`（productId+yearMonth+actualQuantity+sourceType） + `product-monthly-actuals` route | "予測" "営業予測" "スポット" "手動補正" の出所別保持テーブル `monthly_forecast_sources` は無し |
| 8-2 前年実績取込（Phase 7 連動） | 部分 | `ProductMonthlyActual.sourceType=manual/import/daily_report` の枠あり | 取込 API は無し |
| 8-3 商品統合グループ適用 | 無 | - | テーブル未定義 |
| 8-4 特殊案件除外 | 無 | - | テーブル未定義 |
| 8-5 需要予測（前年同月 × 前々月前年比） | 有 | `monthly-production-forecast.ts:computeHistoricalMonthlyProductionForecasts` | docs/18 §C / 文字起こし §C と一致 |
| 8-6 営業予測・スポット加算→final_plan_qty | 無 | - | 加算機構なし。`forecastQuantity` がそのまま採用される |
| 8-7 月間予定→日別生産候補（衝突・能力・原料・残業判定） | 部分 | `monthly-production-schedule.ts` + `monthly-shift-simulation.ts` + `product-planning/monthly-schedule` route | 候補テーブル `production_schedule_candidates` は無く、いきなり `ProductionPlan(draft)` を作る。「候補→人が採用」境界が無い |
| 8-8 複数シナリオ（通常/残業/前倒し） | 無 | - | planningBasis 2 種のみ |
| 8-9 ローリング予測（3〜6か月先） | 無 | - | |
| 8-10 仮シフトによる将来月計算 | 無 | - | |
| 8-11 候補採用→本予定化 | 無 | - | 既存実装は draft 作成までで一致 |

### Phase 9：AI 高度化・異常検知・自動再計算

| docs/18 機能 | 判定 | 既存ファイル | 増設先の候補 |
|---|---|---|---|
| 9-1 異常検知ルールエンジン | 無 | - | |
| 9-2 calculation_reason / recommendation_reason の保存 | 部分 | `monthly-production-forecast.ts` の各行に `reason: string` を返している（DB 保存はせずレスポンスのみ） | 構造化メモとして DB に残す要件は未実装 |
| 9-3 自動再計算ジョブ統合 | 部分 | `refreshCumulativeMaterialRequirements` を adjustments/PO/日報確定で都度呼ぶ | キュー化・排他・リトライ・ロールバックは無し |
| 9-4 推奨スコアリング | 無 | - | |
| 9-5 LLM 説明文生成 | 無 | - | |

### docs/18 §13/§14 パイプライン対応

- **パイプライン A（手動予定→原料発注）**: 予定登録 = `POST /api/production-plans` → `recalculateProductionPlan` → BOM 展開と Requirement 作成 → `refreshCumulativeMaterialRequirements` → 不足検出は `purchase-candidates/generate` の手動トリガー。**自動連鎖は途中まで、最後の発注候補だけ手動**。
- **パイプライン B（日報承認→再計算）**: `daily-reports/[id]/confirm` 内で ledger 発行 + plan completed + forecast 再計算。**残数翌日振替・能力値中央値更新は未実装**。
- **パイプライン C（受注取込→再計算）**: ProductDemand は API CRUD のみ、取込トリガーで再計算する仕組みは無い。
- **パイプライン D（自動候補生成）**: `product-planning/monthly-schedule` で historical_actual / inventory_shortage を選択し、`simulateMonthlyShiftSchedule` で 1 つのプランを生成して直接 `ProductionPlan(draft)` を作る（シナリオ並列は無い）。
- **並列化単位（§14）**: 既存実装は `Promise.all` で DB クエリの並列読み込みはしているが、商品別／原材料別の独立再計算ジョブとしては分離されていない（1 trip でまとめて計算）。

---

## 4. 重複リスク

| 既存 | docs/18 で要求 | 衝突の内容 | 対処方針メモ |
|---|---|---|---|
| `prisma:StockMovement` | Phase 2 `inventory_ledger` | テーブル名・status カラム・source 二重防止ユニーク制約の有無が違う | 既存を拡張（status 追加 + `(sourceType, sourceId, movementType)` ユニーク）して名前は維持、を 0-3 で判断 |
| `prisma:ProductionPlanRequirement` | Phase 3 BOM 展開を `inventory_ledger` に PLANNED で書く | 既存は別テーブルで持つ／ledger には書いていない | docs/18 寄せで ledger に PLANNED 行を発行する場合は二重持ちを避け、Requirement は集計ビュー化する案 |
| `prisma:ProductMonthlyActual` + `monthly-production-forecast.ts` | Phase 8 `monthly_production_plans` / `monthly_forecast_sources` の細分化 | 1 テーブルで実績だけ持っており、予測根拠（自動/営業/スポット/手動補正）の分解保存ができない | Phase 8 で `MonthlyForecast` 系を新規追加、`ProductMonthlyActual` は実績専用に残す |
| `monthly-production-schedule.ts` + `product-planning/monthly-schedule` route | Phase 8 `production_schedule_candidates` + 採用承認フロー | 既存は draft Plan を直接作るので「候補」レイヤーが存在しない | 新規 `production_schedule_candidates` テーブル + 採用エンドポイントを追加、既存 monthly-schedule は候補レイヤーに変更（API 互換性に注意） |
| `monthly-shift-simulation.ts` | Phase 8-7 〜 8-10 の自動割当・シナリオ・将来月仮シフト | シナリオ並列・ローリング・仮シフトの抽象化なし | 既存を残しつつシナリオ指定パラメータを追加、出力をシナリオ別配列に拡張 |
| `purchase-candidates/generate` | Phase 4-5/4-6 候補生成＋緊急度＋承認 | 緊急度なし、承認専用 API なし、`PurchaseOrder.status=candidate` を直に編集する運用 | `PurchaseOrderCandidate` 別テーブル化 or `urgency` カラム追加、`/confirm` `/receive` を新設 |
| `daily-reports/[id]/confirm` | Phase 5-5 残数翌日振替 / Phase 5-6 能力値中央値更新 | 既存は ledger 反映と plan completed のみ | 既存に副作用を増やすか、別 service へ切り出すか 0-3 |
| `lib/calculations.ts:DAILY_BREAK_WINDOWS` | Phase 1-6 休憩マスタ化 | 12:00-13:00 / 15:00-15:15 がコード定数 | マスタテーブル化（`CalendarBreak` 等）or 設定値テーブルに移し、`calculations.ts` は引数化を維持（既に `breakWindows?` 引数あり） |
| `production-plans/auto-schedule` | Phase 8 自動生成と機能重複 | docs/18 では Phase 8 まで「自動生成解禁しない」方針だが、既存は 1 日単位の auto-schedule が存在 | docs/18 と齟齬。残すなら「人が起動して人が確定する」フラグ運用、または Phase 8 候補生成へ統合 |
| `recalculateProductionPlan` 内の `refreshCumulativeMaterialRequirements` 全件再計算 | §13 / §12 排他制御 | ロックや排他なし、同時更新で競合余地 | `calculation_locks` テーブル追加が docs/18 §12 で要求されている |

---

## 5. レスポンス互換性に注意するエンドポイント

「既存画面が依存する／既存 CSV 取り込みワークフローが期待する」可能性が高く、Phase 1 以降でレスポンス形式を変える際に注意すべきもの:

- `GET /api/production-plans` — `product/workArea/requirements` を必ず include。`requirements[]` のフィールド名 (`onHandQuantity / confirmedInbound / unconfirmedInbound / shortageQuantity / shortageType`) は `material-forecast` も書いている。
- `GET /api/production-plans/[id]` — `assignments` include。
- `POST /api/production-plans` / `PUT /api/production-plans/[id]` — レスポンス `{ plan, duration, requirements, cost, capacityFound, billingUnitPrice }` のシェイプ。
- `POST /api/calculations/*` — `warnings: ("exceeds_baseline_end" 等)` の文字列リテラル。画面側で日本語ラベル化している箇所が `auto-schedule/route.ts` `warningLabel()` 等にある。
- `GET /api/inventory` — `{ id, materialCode, name, unit, onHand, confirmedInbound, unconfirmedInbound }`。
- `POST /api/inventory/adjustments` — `movementType` の enum に `opening/adjustment/inbound/actual_consume/transfer`。`source_type` フィールドは現状渡さず NULL 運用。
- `GET /api/shifts/month` — `{ yearMonth, employees, shifts }`。
- `PUT /api/shifts/month` — `{ yearMonth, count }`。送らなかったセルが消えるという仕様は docs に明記が必要。
- `POST /api/production-plans/auto-schedule` — `{ date, mode, plans[], printUrls: {schedule, staff} }`。print 画面が `printUrls` を期待。
- `POST /api/product-planning/monthly-schedule` — `{ createdCount, skipped, plans, message, listUrl }`。
- `POST /api/invoice-exports` — `{ id, fileName, rowCount, totalAmount, csv }`（CSV 文字列をそのまま返す）。
- `GET /api/products/[id]` — `aliases / defaultWorkArea / bomItems / capacities` 4 つ込み。マスタ編集画面が依存。
- `GET /api/products` の `aliases` — 検索クエリ `q` が aliases にも当たる仕様（マスタ画面の検索精度に影響）。
- `purchase-candidates/generate` の `replaceExistingCandidates=true` 既定 — 候補画面が「再生成すると古い candidate が消える」前提で組まれている可能性。
- CSV テンプレート (`GET /api/export/master-template?type=`) — products/materials/packaging の 3 種類のみ。新規テンプレ追加時の URL 互換。

レスポンス**を絶対に壊さない方が安全な軸**:

1. ステータス値の enum（`PlanStatusEnum`, `PurchaseOrderStatusEnum`, `shortageType`, `movementType`）
2. 計算系の warnings 文字列
3. `printUrls` キー名
4. CSV ヘッダー列順（invoice 出力、master-template）

---

## 6. 監査ログ（audit.ts）の現状

### 構造

- 単一関数 `audit({action, entityType, entityId?, actorId?, before?, after?})` → `AuditLog` テーブルに 1 行 insert。
- `before/after` は `JSON.stringify` して文字列保存。
- `actorId` を取れる仕組み（認証/セッション）は **無く**、全 route で渡されていない。Phase 0-2 観点では認証層が未実装。

### 利用範囲（実測 38 ファイル）

- マスタ系 CRUD: create/update/deactivate/delete/replace_bom（全マスタで完備）。
- 生産予定: create/update/delete/confirm/cancel/bulk_confirm/bulk_delete/auto_schedule/replace_assignments/monthly_schedule_generate。
- 在庫: `inventory/adjustments` で movementType をそのまま action として記録。
- 発注: generate_purchase_candidates / update / delete / cancel。
- 日報: create/update/confirm。
- 請求: export_invoice。
- 取込: import_products / import_materials。

### Phase 4 で監査ログがどう載るか

- 発注候補生成 → `generate_purchase_candidates`（entityId は `dateFrom_dateTo`、after に候補配列全件）。
- 発注更新 → `update`（before/after が PurchaseOrder 全体）。
- 承認フロー（候補→ドラフト→確定→受領）が現状 1 つの `update` action に潰されているため、**docs/18 が要求する「発注確定の監査ログ」を区別できるよう、`confirm/receive` 等の専用 action 追加が必要**。

### Phase 5 で監査ログがどう載るか

- 日報作成/更新 → `create/update`（after に DailyReport+consumptions）。
- 日報確定 → `confirm`（before/after の差分から StockMovement 発行量が逆算可能）。
- ただし `confirm` 時に発行した `StockMovement` 各行には監査ログが付かない（ledger 側の sourceType/sourceId で辿れる設計）。**docs/18 が要求する「在庫を減らす処理は監査ログを残す」要件は ledger 経由で間接対応している**。生 SQL での adjustments のみ別途 `audit({action: movementType ?? "adjustment"})` が走る。

### Phase 6 で監査ログがどう載るか

- 請求出力 → `export_invoice`（after に InvoiceExport の id/fileName/rowCount/totalAmount）。CSV 本体は保存していない（Phase 6 で再現性要件があるならファイル保存 or 行スナップショット必要）。

### 共通課題

- `actorId` 未記録 → 「誰が確定したか」追跡不可。認証層導入時に全 route に actor 引き渡し作業が必要。
- 監査ログの全文検索や差分表示の UI は未実装（テーブルのみ）。

---

## 7. 判断保留事項

このサブタスクで決められない、後続サブタスクや人間判断に回すべき事項:

1. **`StockMovement` を `inventory_ledger` に改名するか、既存テーブルを拡張するか**（status/二重防止ユニーク制約の追加）。→ Phase 0-3 で決定。
2. **`ProductionPlanRequirement` と将来の `inventory_ledger(PLANNED行)` の二重持ち回避**。集計ビュー化するか、`ProductionPlanRequirement` を残し ledger に PLANNED は書かない方針を許容するか。
3. **`production-plans/auto-schedule` の位置づけ**。docs/18 は「Phase 8 までは自動生成しない」方針だが既存は 1 日単位の自動枠取りを実装済み。残置／封印／Phase 8 候補生成に統合の三択。
4. **`monthly-production-schedule` route が直接 `ProductionPlan(draft)` を作る**現状を、docs/18 の `production_schedule_candidates → 採用 → 本予定` 二段構えに作り替えるか、`draft` のままで Phase 8 候補と見做すか。
5. **`Product.productionType` enum の拡張**。マスタ側は `stock/make_to_order/both` のみ、`ProductionPlan.productionType` は `stock/make_to_order/external/trial/other` まで広い。docs/18 §F の規格変更グループとの整合 → Phase 1 で決定。
6. **休憩マスタ化のタイミング**。`DAILY_BREAK_WINDOWS = [12:00-13:00, 15:00-15:15]` を Phase 1 でマスタ化するか、Phase 5 まで定数のまま許容するか。
7. **発注書 PDF/Excel 出力（Phase 4-7）**の実装範囲・テンプレ。文字起こし §L で「人は内容確認して送るだけ」と明示。テンプレ・出力ライブラリ選定が必要。
8. **`actorId` を取る認証層の導入時期**。docs/18 では明示されないが、監査ログを実運用に乗せるなら早期に必要。0-B 観点。
9. **`PurchaseOrder.status=candidate` の運用**を本テーブルに残すか、`PurchaseOrderCandidate` 別テーブルに分けるか。Phase 4-6 承認フロー設計に影響。
10. **docs/11 の `/api/inventory/raw-materials` `/api/inventory/packaging-materials` vs 既存 `/api/inventory?itemType=`**。docs/11 寄せに変更すると既存画面が壊れる。逆方向に docs/11 を更新する案も検討。
11. **`refreshCumulativeMaterialRequirements` の同期処理**。adjustments / PO 更新 / 日報確定で毎回 90 日先まで全件再計算する負荷は Phase 4 以降で問題化しうる。`calculation_locks` 導入とジョブキュー化（docs/18 §12 / 9-3）の優先度。
12. **CSV 取込のエンコーディング・ファイル形式**。現状 `req.text()` で UTF-8 受領、CSV は BOM 出力。Excel(`.xlsx`) 取込の要望が docs/18 Phase 7 にあるが、既存実装は CSV のみ。
