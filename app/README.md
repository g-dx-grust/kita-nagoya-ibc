# 北名古屋 製造管理システム (Phase 0+1 MVP)

実装内容: Phase 0 (基盤・マスター) と Phase 1 (手動生産予定MVP) 全機能。
Phase 2-6 の一部として、累積在庫見込み、発注候補生成、製品在庫からの生産候補提案も含む。

詳細仕様は `../docs/` を参照。

## スタック

- Next.js 15 (App Router) + TypeScript (strict)
- Prisma + Supabase PostgreSQL
- Tailwind CSS v4 + shadcn/ui 互換コンポーネント + lucide-react
- Zod (バリデーション)
- Vitest (ユニットテスト)
- xlsx + pdf-lib (発注書出力。PDFは標準フォント制約により英数字フォールバック)

## セットアップ

```bash
cd app
npm install
npx prisma generate
npm run db:migrate:deploy # Supabase/PostgreSQLスキーマ作成
npx tsx scripts/backfill-purchase-order-urgency.ts
npm run db:seed          # サンプルデータ
npm run dev              # http://localhost:3000
```

ローカルの引き継ぎ SQLite DB から本番投入用データを作る場合:

```bash
npm run production:seed:export
npm run production:seed:import -- --dry-run
npm run production:seed:import -- --confirm-production-reset
```

`production:seed:import` は `--confirm-production-reset` がない限り Supabase へ書き込みません。本番投入対象は全マスターと `ProductMonthlyActual.sourceType = "import"` の過去実績のみで、テストシフト・日報入力・予測生産・発注候補・在庫台帳派生データは空にします。詳細は `../docs/PRODUCTION_DEPLOYMENT.md` を参照。

実データを取り込む場合は、最新の商品分類表を商品マスターの正として再構築してから、分類表・旧DB監査結果を使って安全に紐づけできる能力/手間賃/月次実績/包装BOMを反映し、原料・資材・シフト・日報由来の生産能力を入れます。

```bash
npm run rebuild:products:classification          # ドライラン
npm run link:products:classification             # 紐づけのドライラン
npm run import:labor-capacities -- --dry-run  # 最新手間賃表の更新内容を事前確認
npm run import:all                            # 商品分類表と紐づけはここで --apply されます
```

`rebuild:products:classification` は `../docs/商品分類表 共有.xlsx` の五十音別シートから商品を再作成します。既存商品は削除せず無効化し、過去の生産予定・日報・在庫台帳は旧商品IDを参照したまま保持します。分類表に商品コード列が無いため、`productCode` は `KCL-...` の内部管理コードとして生成します。

`link:products:classification` は `../docs/product_list_consistency_latest_rows_2026-06-08.csv` の exact/strong_spec 一致だけを使って旧商品の生産能力・手間賃・月次実績を新商品へコピーし、分類表の袋/トレー・ダンボール・備品・シール列から包装BOMを生成します。曖昧な「専用袋」や原料欄は自動BOM化せず、`../docs/product_linking_unresolved_2026-06-08.csv` に要確認として出します。

`import:labor-capacities` は `../docs/手間賃集計 最新.xlsx` の「1袋の手間賃」から `1500円 ÷ 1袋手間賃` で `袋/人時` を計算し、手間賃単価・生産能力・未確定/下書き生産予定の見積もりを更新します。商品分類表に無い商品はデフォルトでは新規作成せず未マッチとして出します。

## テスト・ビルド

```bash
npm test         # 計算ロジック+CSVのユニットテスト
npm run typecheck
npm run build
```

## ks-c 連携前提のマウント設定

このアプリは `ks-c` の派生機能として載せやすいように、画面とAPIの参照先をヘルパー経由にしています。

```env
NEXT_PUBLIC_KITAGOYA_BASE_PATH="/manufacturing/kitanagoya"
NEXT_PUBLIC_KITAGOYA_API_BASE_PATH="/api/kitanagoya"
```

ローカル単体実行では `next.config.ts` の rewrite により、以下の名前空間でも現在の画面/APIを確認できます。

- `/manufacturing/kitanagoya/*` -> 既存画面
- `/api/kitanagoya/*` -> 既存API

`ks-c` 側へ載せるときは、画面を `/manufacturing/kitanagoya` 配下、APIを `/api/kitanagoya` 配下へ配置し、既存の `Product` / `Supplier` / `RawMaterial` などと衝突するモデルは統合またはリネームしてください。

## デザインシステム

`ks-c` 本体に合わせて、共通レイアウトは白基調の固定ヘッダー + 左サイドバーに統一しています。新規UIは `src/components/ui` と `src/components/layout` のコンポーネントを使ってください。

- `MainLayout` / `Header` / `Sidebar`
- `Button` / `Card` / `Badge` / `Input` / `Table`
- `MenuCard`

既存画面の `panel`、`toolbar`、`badge`、`table` などのレガシークラスも、同じトークンで表示されるよう互換CSSを残しています。

## 主要画面

- `/` ダッシュボード
- `/production-plans` 生産予定一覧 (絞り込み)
- `/production-plans/new` 新規登録 (3モードのリアルタイム計算)
- `/production-plans/monthly` 前々月前年比の月次予測、または現在庫・未処理需要・既存予定から月間生産予定をシミュレーションし、仮予定として下書き生成
- `/production-plans/auto` シフトに合わせた日別生産スケジュール自動作成 (社内部屋を並列割り振り)
- `/product-planning` 製品在庫・受注/出荷予定から生産候補を提案し、月次実績を登録
- `/production-plans/[id]` 詳細・編集・確定/取消/再計算・原料不足表示
- `/production-daily-reports` Excel由来の製造日報蓄積・月次商品別集計・手間賃検証
- `/masters/products` 商品マスター + BOM + 生産能力編集 + CSV取り込み
- `/masters/materials` 原料マスター + CSV取り込み
- `/masters/packaging` 資材マスター
- `/masters/work-areas` 作業場所マスター (部屋名・最大配置人数は自由に追加・変更可能)
- `/masters/employees` 従業員マスター
- `/shifts` 月別/日別シフト登録 (従業員ごとの基本勤務時間を保存し、休み/シフト未登録者は自動配置・印刷対象外)
- `/prints` 現場印刷 (日別の生産スケジュール/スタッフ配置HTML)
- `/prints/production-schedule?date=YYYY-MM-DD` 生産スケジュール印刷HTML
- `/prints/staff-assignments?date=YYYY-MM-DD` スタッフ配置表印刷HTML
- `/inventory` 在庫一覧 (基準日切替, 現在庫/確定入荷/未確定入荷)
- `/purchases` 累積不足見込みと発注候補生成
- `/capacity-review` 訪問ヒアリング用の生産能力チェック・修正
- `/invoices` 請求/売上CSV出力 + 出力履歴

## 受け入れテスト対応 (docs/14_acceptance_tests.md)

| シナリオ | 検証方法 |
| --- | --- |
| 商品マスター + BOM + 生産能力登録 | `/masters/products/{id}` から編集 / `npm test` |
| 数量固定モード (1000袋, 5人, 100袋/人時, 60分) → 12:00 | `npm test` `computeProductionDuration` / 生産予定登録画面 |
| 時間枠固定モード (9-17時, 5人) → 3500袋 | `npm test` `computeMaxQuantityInTimeWindow` |
| 17時超過アラート (4500袋 → 19:00, 残業120分) | `npm test` / 登録画面に警告表示 |
| 原料不足 (50kg必要, 在庫20kg) → 不足30kg | `npm test` / 詳細画面の不足バッジ |
| 未確定発注依存 (在庫20+未確定40, 必要50) → unconfirmed_dependency | `npm test` |
| 複数予定の累積原料不足 | `npm test` `buildMaterialForecast` / `/purchases` |
| 製品在庫・受注/出荷予定から推奨生産数 | `npm test` `computeProductPlanningSuggestions` / `/product-planning` |
| 前々月前年比による月間予測生産数 | `npm test` `computeHistoricalMonthlyProductionForecasts` / `/production-plans/monthly` |
| 月間の現在庫判定から生産予定候補 | `npm test` `computeMonthlyProductionSchedule` / `/production-plans/monthly` |
| 月間候補を実シフト・部屋・生産能力に照らして分割配置 | `npm test` `simulateMonthlyShiftSchedule` / `/production-plans/monthly` |
| 請求CSV出力 (5640 × 12 = 67,680円) | `/invoices` |

## 主要API

```
POST /api/calculations/production-duration            数量固定モード
POST /api/calculations/max-quantity-in-time-window    時間枠固定モード
POST /api/calculations/required-people                人数調整モード
POST /api/calculations/material-requirements          原料/資材必要量

GET/POST    /api/products
GET/POST    /api/materials
GET/POST    /api/packaging-materials
GET/POST    /api/work-areas
GET/POST    /api/employees
GET/POST    /api/suppliers
GET/POST    /api/capacities
GET/PUT     /api/shifts?date=YYYY-MM-DD
PUT         /api/products/{id}/bom
GET/POST    /api/product-demands
GET/POST    /api/product-monthly-actuals
GET         /api/product-planning/suggestions
POST        /api/product-planning/monthly-schedule

GET/POST    /api/production-plans
POST        /api/production-plans/auto-schedule
GET/PUT/DEL /api/production-plans/{id}
GET/PUT     /api/production-plans/{id}/assignments
POST        /api/production-plans/{id}/recalculate
POST        /api/production-plans/{id}/confirm
POST        /api/production-plans/{id}/cancel

GET  /api/inventory?itemType=raw_material&date=YYYY-MM-DD
POST /api/inventory/adjustments
POST /api/purchase-candidates/generate
GET/PUT/DEL /api/purchase-orders/{id}
POST /api/purchase-orders/{id}/confirm
POST /api/purchase-orders/{id}/receive
GET  /api/purchase-orders/{id}/document?format=xlsx|pdf

POST /api/daily-reports/from-production-plan/{id}     日報下書き作成
POST /api/daily-reports/{id}/confirm                  日報確定 → stock_movement書込
GET/POST    /api/production-daily-reports             製造日報台帳
PUT/DELETE  /api/production-daily-reports/{id}         製造日報台帳の編集/削除

POST /api/import/products                             text/csv
POST /api/import/materials                            text/csv
GET  /api/export/master-template?type=products        CSVテンプレート
GET/POST /api/invoice-exports                         請求CSV出力 + 履歴
```

移植先では上記APIを `/api/kitanagoya/...` に寄せます。単体ローカルでは rewrite により `/api/kitanagoya/...` でも同じAPIが動きます。

## 設計メモ

- 商品名/原料名は主キーにせず、内部ID(cuid) + コードで識別。別名(alias)で表記揺れ吸収。
- 作業場所は文字起こしの曖昧な部屋名(「カラーテレビ」「トラップ部屋」等)を固定しないため、すべて `work_areas` テーブルで管理。
- 作業場所ごとに最大配置人数を持ち、自動作成は外注を除いた社内部屋を同時進行で使う。商品に1部屋分の生産能力だけ登録されている場合は、他の社内部屋へ同じ能力を仮適用し、採用した部屋は生産能力マスターへ自動補完する。
- 生産能力は訪問確認用に `reviewStatus` と `reviewMemo` を持つ。`/capacity-review` で未確認・異常値・日報1件だけ・部屋別未登録を絞り込み、その場で `袋/人時` を修正できる。
- 自動作成された生産予定はまず `draft` の下書きとして保存する。詳細画面で数量・部屋・時間・スタッフを修正し、問題なければ個別または一括で `confirmed` にする。
- 在庫は `stock_movements` 台帳方式 (opening / planned_reserve / actual_consume / inbound / adjustment / transfer)。
- 製品在庫も `stock_movements` の `itemType=product` で管理し、受注/出荷予定は `product_demands` で管理。
- 製品計画は「現在庫 + 既存予定生産 - 未処理需要」を見て、不足分を商品ごとの安全在庫・標準ロットで丸めて提案する。
- 月間生産予定生成は `/production-plans/monthly` で、標準では「前年対象月実績 × (今年前々月実績 / 前年前々月実績)」から前月確定前の予測生産数を出し、既存予定を差し引いて `draft` の生産予定を作る。必要に応じて従来の現在庫・未処理需要・既存予定による不足判定へ切り替えられる。
- 原料/資材不足は、生産予定単体ではなく対象期間の予定使用量を日付順に累積して判定し、発注候補に落とせる。
- 未確定発注 (`ordered_unconfirmed`) は確定在庫見込みには含めない。`unconfirmed_dependency` 警告で区別。
- 発注候補は `recommendedOrderDate` から `urgency` (CRITICAL / WARNING / INFO / NONE) を算出する。既存データは `scripts/backfill-purchase-order-urgency.ts` で再計算できる。
- 発注承認は専用APIで `ordered_unconfirmed -> confirmed -> received` と進め、`stock_movements` は `PLANNED -> CONFIRMED` に連動する。受領時は `receivedQuantity` / `receivedDate` を保存する。
- 発注書は `/purchases` から Excel/PDF を出力できる。Excelは日本語テンプレート、PDFは `pdf-lib` 単体でCJKフォント埋め込みができないため英数字フォールバック。日本語PDF化には Noto Sans JP と `@pdf-lib/fontkit` の追加検討が必要。
- 生産予定の `confirm` は status を変えるだけで実在庫は減らさない (予定引当)。
- 日報の `confirm` で原料/資材の `actual_consume` と製品の `inbound` を `stock_movements` に書き込み、同時に予定を `completed` に。
- Excel由来の月次製造日報は `ProductionDailyReportEntry` に蓄積する。これは予定連動の `DailyReport` とは分け、商品名照合状態・商品/BOM/売値/手間賃係数のスナップショット・計算列を保持する。
- 全書込操作は `audit_logs` に before/after をJSONで残す。
- 計算ロジックは `src/lib/calculations.ts` の純関数。DB/HTTPに依存しないため `src/lib/calculations.test.ts` で12件のテストをカバー。
