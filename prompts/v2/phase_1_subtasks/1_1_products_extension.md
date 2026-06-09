# Phase 1-1: 商品マスタ拡張

## 使用ツール

Codex

## 位置づけ

Phase 1 の中核。商品マスタに **予測方式・統合グループ・有効期間** を追加する。1-T（テスト基盤）の後に着手。1-2（原料・資材）, 1-S（仕入先）と並列実行可。

## 目的

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 1 1-1 と [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1 に基づき、`Product` モデルに以下を追加する：

- `forecastMethod` (Enum: MANUAL / YEAR_RATIO / SALES_INPUT / NONE)：予測方式。docs/18 §1-1 で必須
- `equivalenceGroupId` (FK to ProductEquivalenceGroup, optional)：規格変更グループ（1-7 で定義するテーブル。FK だけ先行追加）
- `validFrom` (DateTime, optional)：有効期間開始
- `validTo` (DateTime, optional, null = 無期限)：有効期間終了

**既存 `productionType` enum（stock/make_to_order/both）は維持**。0-3 §1-1 で「Product 側の enum 拡張は破壊性が高いため Phase 1 ではやらない、forecastMethod を別カラムで分離する」と確定済み。

## 前提

- [`docs/phase_0_outputs/0_1_db_schema_audit.md`](../../../docs/phase_0_outputs/0_1_db_schema_audit.md) §1（既存 Product カラム）と §3（planned/actual 分離状況）を熟読してから着手。
- [`docs/phase_0_outputs/0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) §5（レスポンス互換性に注意するエンドポイント）も読む。
- 既存 API `GET /api/products`, `GET /api/products/[id]` のレスポンスシェイプを**絶対に壊さない**（マスタ画面が依存）。

## 読むファイル

- `app/prisma/schema.prisma`（model Product, ProductAlias, ProductBomItem, ProductionCapacity, ProductDemand, ProductMonthlyActual, BillingPrice の関係）
- `app/prisma/migrations/202605190001_product_planning/migration.sql`（直近マイグレーションのスタイル）
- `app/src/lib/schemas.ts`（ProductCreateSchema 系の Zod 定義）
- `app/src/app/api/products/route.ts`
- `app/src/app/api/products/[id]/route.ts`
- `app/src/app/masters/products/page.tsx`（一覧画面が依存する include 構造の確認）
- `app/prisma/seed.ts`（既存 Product seed の確認）

## やってほしいこと

### 1. Prisma スキーマ拡張

`schema.prisma` の `model Product` に以下を追加：

```prisma
model Product {
  // ... 既存カラム ...
  forecastMethod      ForecastMethod  @default(MANUAL)
  equivalenceGroupId  String?
  // equivalenceGroup ProductEquivalenceGroup? @relation(fields: [equivalenceGroupId], references: [id])
  // ↑ Phase 1-7 でテーブル新設後に有効化。1-1 では FK だけ存在しリレーション宣言はコメントアウト
  validFrom           DateTime?
  validTo             DateTime?
  // ... 既存リレーション ...
}

enum ForecastMethod {
  MANUAL       // 予測値を手動入力
  YEAR_RATIO   // 前年同月×前年比率
  SALES_INPUT  // 営業予測値
  NONE         // 受注生産のみ、予測なし
}
```

### 2. マイグレーション作成

ファイル名：`app/prisma/migrations/YYYYMMDDXXXX_product_forecast_extension/migration.sql`（既存スタイルに合わせ、`YYYYMMDD` は本日、`XXXX` は連番）。

- 既存データには `forecastMethod = 'MANUAL'`（既定値）を入れる
- `equivalenceGroupId`, `validFrom`, `validTo` は NULL で OK

### 3. Zod スキーマ拡張

`app/src/lib/schemas.ts` の `ProductCreateSchema`, `ProductUpdateSchema` に新カラムを追加。`ForecastMethod` enum 用 Zod も定義。

```ts
export const ForecastMethodEnum = z.enum(['MANUAL', 'YEAR_RATIO', 'SALES_INPUT', 'NONE']);
```

### 4. API ルート対応

`POST /api/products` / `PUT /api/products/[id]`：
- リクエストで新カラムを受け取れる（optional）
- レスポンスに新カラムを含める（既存フィールドは削除・改名しない）

`GET /api/products`, `GET /api/products/[id]`：
- レスポンスに新カラムを含める

### 5. ユニットテスト

`app/test/integration/products.extension.test.ts` を新規作成（1-T のヘルパー使用）：
- `forecastMethod` デフォルト値が `MANUAL`
- 4 つの enum 値すべて受け入れる
- `equivalenceGroupId` が null で OK
- `validFrom < validTo` のとき正常、逆だと Zod でエラー
- `validTo = null` は無期限有効
- `validFrom = null` は適用開始日未設定

### 6. seed 拡張

`prisma/seed.ts` の Product seed 2 件（P001, P002）に、`forecastMethod` を明示設定（P001: YEAR_RATIO, P002: NONE）。`validFrom = 2026-01-01`, `validTo = null` を入れる。

## 出力

- `app/prisma/schema.prisma`（編集：`Product` に4カラム追加、`ForecastMethod` enum 新規）
- `app/prisma/migrations/YYYYMMDDXXXX_product_forecast_extension/migration.sql`（新規）
- `app/src/lib/schemas.ts`（編集：Zod 拡張）
- `app/src/app/api/products/route.ts`（編集：レスポンス互換維持で拡張）
- `app/src/app/api/products/[id]/route.ts`（編集：同上）
- `app/test/integration/products.extension.test.ts`（新規）
- `app/prisma/seed.ts`（編集：seed に forecastMethod を明示）

## 絶対遵守

- 既存 enum 値（`productionType: stock/make_to_order/both`）は**削除も変更もしない**。
- 既存 `Product.category`（自由文）は**触らない**。
- 既存 API レスポンスシェイプを壊さない（フィールド追加のみ OK、削除・改名 NG）。
- マスタ画面 `app/src/app/masters/products/` は**触らない**（1-U の担当）。
- `globals.css`, `components/ui/`, `layout.tsx` は触らない。
- `prisma migrate dev` を実行する場合、`prisma/dev.db` への影響を確認してから（既存データ保持）。
- マイグレーションファイル名の `XXXX` は既存連番に揃えること（`202605190001` の次など）。

## 完了条件

- [ ] `npm run db:migrate` がエラーなく通る
- [ ] 既存 41 ユニットテスト + 1-T のサンプル統合テストが通る
- [ ] 新規 6 テストケース（§5）が全部通る
- [ ] `npm run typecheck` が通る
- [ ] `GET /api/products` / `GET /api/products/[id]` のレスポンスが既存画面（`/masters/products`）で表示できる（手動確認可）
- [ ] seed が新カラム込みで流せる
- [ ] schema.prisma に `ForecastMethod` enum と4新カラムが追加されている

## 報告

完了したら 300 字以内で報告：
- 追加・編集ファイル一覧
- マイグレーション名
- 新規テストケース数と全件 pass の確認
- 既存 API レスポンスのフィールド数 before / after
- 既知の懸念点（あれば1行）
