# Phase 1-V: CSV 取込スクリプト拡張

## 使用ツール

Codex

## 位置づけ

1-1〜1-7 すべて完了後に着手。1-U と並列実行可。

## 目的

1-1〜1-7 で追加した新カラムを、既存の CSV 取込スクリプトと `/api/import/*` route で読み込めるようにする。

[`0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) §1-8 と [`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §4-1。

## 読むファイル

- `app/scripts/import-products.ts`
- `app/scripts/import-materials.ts`
- `app/scripts/import-packaging.ts`
- `app/scripts/import-shifts.ts`
- `app/scripts/import-capacities.ts`
- `app/scripts/import-labor-capacities.ts`
- `app/src/app/api/import/products/route.ts`
- `app/src/app/api/import/materials/route.ts`
- `app/src/app/api/export/master-template/route.ts`
- `app/src/lib/csv.ts`

## やってほしいこと

### 1. CSV 列の拡張

各 import スクリプトと API route で、以下の列を受け入れる（**列名は snake_case で統一**、既存命名規則を踏襲）：

#### products

追加列：
- `forecast_method`（MANUAL/YEAR_RATIO/SALES_INPUT/NONE）
- `equivalence_group_name`（既存グループ名で逆引き。なければ無視）
- `valid_from`（YYYY-MM-DD）
- `valid_to`（YYYY-MM-DD or 空）

#### materials, packaging

追加列：
- `safety_stock_quantity`
- `order_lot_qty`
- `min_order_qty`
- `valid_from`
- `valid_to`

#### work-areas（新規スクリプト or 既存があれば拡張）

- `equipment_kind`（ROOM/LINE/MACHINE/OTHER）
- `concurrent_operation_allowed`（true/false）
- `valid_from`
- `valid_to`

#### capacities

追加列：
- `source_type`（MANUAL/DAILY_REPORT_MEDIAN）
- `locked`（true/false）
- `valid_from`
- `valid_to`

#### shifts（既存 `import-shifts.ts` がある）

- `shift_pattern_name`（標準パターン名で逆引き。なければ無視）

### 2. CSV テンプレート出力（`GET /api/export/master-template`）

既存テンプレ（products / materials / packaging）に新列を追加。新規 type（`work-areas`, `capacities`, `suppliers`, `shift-patterns`, `shift-breaks`）も追加検討（必須ではない。最小は既存 3 種の拡張）。

### 3. 取込時のバリデーション

- enum 値（`forecastMethod`, `equipmentKind`, `sourceType`）の不正値は行単位で reject
- 日付フォーマット不正（`valid_from` が `2026-13-99` 等）は行単位で reject
- `valid_from > valid_to` は行単位で reject
- 数値負値（`safety_stock_quantity = -1`）は reject
- `equivalence_group_name`, `shift_pattern_name` で逆引きできない場合は **警告ログのみ**、当該行は新カラム NULL で取り込み続行

### 4. 既存挙動の互換性

- 既存 CSV ファイル（新カラム無し）が読み込めること。新カラムは optional として扱い、未指定なら DB の default 値が入る
- 既存 alias の pipe 区切り（`旧A|別名B`）は維持

### 5. テスト

`app/test/integration/import-products.extension.test.ts` 等を追加：
- 新カラム付き CSV を取り込み、Product に反映される
- 旧 CSV（新カラム無し）も互換動作
- 不正値の行 reject
- `equivalence_group_name` の逆引き成功 / 失敗

### 6. 監査ログ

既存の `audit("import_products")` 等は維持。新たに `audit("import_work_areas")`, `audit("import_capacities")` 等を必要に応じて追加。

## 絶対遵守

- 既存 CSV テンプレの列順を **絶対に変えない**（既存ユーザーが配ったテンプレが壊れる）。新列は **末尾に追加**。
- 既存 API レスポンスシェイプを壊さない（取込結果の `{ ok, errors[], imported }` 等）。
- 既存スクリプトのコマンドライン引数を変えない（`npm run import:products -- ./path.csv` 等の使い方が継続できる）。
- マスタ画面の CSV 取込 UI（`/masters/csv-import.tsx`）は **触らない**（1-U の範疇とも違うため。テキストエリア貼り付けのまま動作確認）。

## 完了条件

- [ ] 全 import スクリプトが新カラム入り CSV を取り込める
- [ ] 既存 CSV（新カラム無し）も互換動作
- [ ] `GET /api/export/master-template?type=products` 等が新列を含むテンプレを返す
- [ ] テスト全件 pass
- [ ] 既存 `/masters/csv-import.tsx` ペーストインポートが壊れない

## 報告

300 字以内で：
- 編集したファイル一覧
- 各テンプレに追加した列の合計数
- 新たに追加した audit action 名
- 取込テスト件数と pass 状況
