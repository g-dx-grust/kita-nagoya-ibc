# Phase 1-2: 原材料・資材マスタ拡張

## 使用ツール

Codex

## 位置づけ

1-T 後、1-1 / 1-S と並列実行可。

## 目的

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 1 1-2 と [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1 に基づき、`Material` と `PackagingMaterial` に以下を追加：

- `safetyStockQuantity` (Decimal, default 0)：安全在庫数量
- `orderLotQty` (Decimal, optional)：発注ロット単位
- `minOrderQty` (Decimal, optional)：最小発注数量
- `validFrom` (DateTime, optional)
- `validTo` (DateTime, optional)

既存 `leadTimeDays`, `standardUnitPrice`, `shelfLifeManaged` は維持。

## 前提

- [`0_1_db_schema_audit.md`](../../../docs/phase_0_outputs/0_1_db_schema_audit.md) §2（gap 表の materials / packaging）を熟読。
- 既存 API `/api/materials` / `/api/packaging-materials` レスポンス互換性維持。

## 読むファイル

- `app/prisma/schema.prisma`（model Material, PackagingMaterial, Supplier）
- `app/src/lib/schemas.ts`（Material/Packaging 系 Zod）
- `app/src/app/api/materials/route.ts`, `[id]/route.ts`
- `app/src/app/api/packaging-materials/route.ts`, `[id]/route.ts`
- `app/prisma/seed.ts`

## やってほしいこと

### 1. Prisma スキーマ拡張

両モデルに同じ 5 カラムを追加。Decimal は SQLite では `Float` にマップされる点に注意（既存 `standardUnitPrice` の型に揃える）。

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_materials_packaging_safety_stock/migration.sql`

既存データには `safetyStockQuantity = 0` を入れる。

### 3. Zod 拡張

`MaterialCreateSchema`, `MaterialUpdateSchema`, `PackagingMaterialCreateSchema`, `PackagingMaterialUpdateSchema` に追加。各数値は `>= 0` で `safeNumber` を活用。

### 4. API ルート対応

両 API のリクエスト受付・レスポンスに新カラムを含める。既存フィールドは削除・改名しない。

### 5. ユニットテスト

`app/test/integration/materials.extension.test.ts` / `packaging.extension.test.ts` を新規作成：
- `safetyStockQuantity` デフォルト 0
- `orderLotQty`, `minOrderQty` が null で OK
- `validFrom < validTo` で正常、逆だと Zod エラー
- 負の値（`-1`）を弾く
- 一覧 GET で新カラムが返る

### 6. seed 拡張

既存 Material（RM001, RM002）と PackagingMaterial（PK001）に `safetyStockQuantity` を設定（例：RM001=5kg, RM002=2kg, PK001=500枚）。docs/14 の原料不足ケースと整合させること。

## 出力

- `app/prisma/schema.prisma`（編集）
- `app/prisma/migrations/YYYYMMDDXXXX_materials_packaging_safety_stock/migration.sql`（新規）
- `app/src/lib/schemas.ts`（編集）
- `app/src/app/api/materials/route.ts`（編集）
- `app/src/app/api/materials/[id]/route.ts`（編集）
- `app/src/app/api/packaging-materials/route.ts`（編集）
- `app/src/app/api/packaging-materials/[id]/route.ts`（編集）
- `app/test/integration/materials.extension.test.ts`（新規）
- `app/test/integration/packaging.extension.test.ts`（新規）
- `app/prisma/seed.ts`（編集）

## 絶対遵守

- 既存カラム（`leadTimeDays`, `standardUnitPrice`, `shelfLifeManaged`, `supplierId` 等）は変更しない。
- 既存 API レスポンスのフィールドは削除・改名しない。
- マスタ画面（`/masters/materials`, `/masters/packaging`）は触らない（1-U の担当）。
- `globals.css`, `components/ui/`, `layout.tsx` は触らない。

## 完了条件

- [ ] `npm run db:migrate` 成功
- [ ] 既存テスト + 1-T サンプル + 新規テストすべて pass
- [ ] `npm run typecheck` が通る
- [ ] 既存 `/masters/materials` 画面が壊れずに動作（手動確認）
- [ ] seed が新カラム込みで流せる

## 報告

完了したら 200 字以内で：
- 追加マイグレーション名
- 新規テストケース数
- 既存 API レスポンスシェイプの新フィールド名一覧
