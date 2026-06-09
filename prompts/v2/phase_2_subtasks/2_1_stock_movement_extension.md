# Phase 2-1: StockMovement 拡張（status / ユニーク / movementType enum）

## 使用ツール

Codex

## 位置づけ

Phase 2 の **基盤タスク**。2-T と並列実行可。2-2 以降のすべての作業がこのスキーマ変更を前提とする。

## 目的

[`docs/18`](../../../docs/18_implementation_phase_plan.md) §Phase 2 §2-1 と [`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-2 に基づき、既存 `StockMovement` テーブルを **改名せず・分割せず** に以下を追加：

1. **独立 `status` カラム**（`PLANNED` / `CONFIRMED` / `CANCELLED`）
2. **`(sourceType, sourceId, movementType)` ユニーク制約**（二重登録防止）
3. **`movementType` enum 値の拡張**：既存値（`opening` / `planned_reserve` / `actual_consume` / `inbound` / `adjustment` / `transfer`）は **維持**、新規 UPPER_SNAKE_CASE 値を **追加**

## 重要な互換性ルール

- **既存 movementType 値を削除・改名しない**。両形式が DB に同時存在することを許容（移行中の中間状態）。
- **既存 API レスポンスシェイプを壊さない**。`status` フィールドはレスポンスに **追加**する（フロントエンド側は当面参照しなくても OK）。
- **既存データの `status` バックフィル**を migration で行う：
  - `movementType = 'opening' / 'inbound' / 'actual_consume' / 'adjustment' / 'transfer'` → `status = 'CONFIRMED'`
  - `movementType = 'planned_reserve'` → `status = 'PLANNED'`
  - `PurchaseOrder` 経由の `inbound` で `status='ordered_unconfirmed'` 由来のもの → `status = 'PLANNED'`（要：`sourceType='purchase_order'` で sourceId 経由判別）

## 前提

- [`0_1_db_schema_audit.md`](../../../docs/phase_0_outputs/0_1_db_schema_audit.md) §1（StockMovement 既存カラム）・§3（planned/actual 分離現状）を熟読。
- [`0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) §5（互換性に注意するエンドポイント）も読む。
- `pack.sh` 投入時に Codex セッション prelude を必ず先に投げる。

## 読むファイル

- `app/prisma/schema.prisma`（model StockMovement 周辺）
- `app/prisma/seed.ts`（既存 StockMovement seed）
- `app/src/lib/inventory.ts:getInventoryFor`
- `app/src/lib/material-forecast.ts:buildMaterialForecast`（status を見て分岐するか確認）
- `app/src/app/api/inventory/route.ts`
- `app/src/app/api/inventory/adjustments/route.ts`
- `app/src/app/api/daily-reports/[id]/confirm/route.ts`（StockMovement 発行ロジック）

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model StockMovement {
  // ... 既存カラム（itemType / itemId / movementType / quantity / movementDate / sourceType / sourceId / unitPrice / note / createdAt 等）...
  status InventoryLedgerStatus @default(CONFIRMED)
  // ... 既存リレーション ...

  // 二重登録防止
  @@unique([sourceType, sourceId, movementType], name: "stock_movement_source_unique")
}

enum InventoryLedgerStatus {
  PLANNED
  CONFIRMED
  CANCELLED
}
```

`movementType` は `String` のまま enum 化しない（既存値の柔軟性を保つため）。新規 UPPER_SNAKE_CASE 値は文字列リテラルで管理する。

### 2. 新しい movementType 定数

`app/src/lib/inventory.ts` または新規 `app/src/lib/inventory-types.ts` に定数を定義：

```ts
export const MOVEMENT_TYPE = {
  // 既存（小文字）— 互換維持
  OPENING: "opening",
  PLANNED_RESERVE: "planned_reserve",
  ACTUAL_CONSUME: "actual_consume",
  INBOUND: "inbound",
  ADJUSTMENT: "adjustment",
  TRANSFER: "transfer",

  // 新規（UPPER_SNAKE_CASE）— docs/18 §2-1
  PLANNED_PRODUCTION_IN: "PLANNED_PRODUCTION_IN",
  PLANNED_MATERIAL_USE: "PLANNED_MATERIAL_USE",
  PLANNED_SHIPMENT_OUT: "PLANNED_SHIPMENT_OUT",
  ACTUAL_PRODUCTION_IN: "ACTUAL_PRODUCTION_IN",
  ACTUAL_MATERIAL_USE: "ACTUAL_MATERIAL_USE",
  ACTUAL_SHIPMENT_OUT: "ACTUAL_SHIPMENT_OUT",
  INBOUND_CONFIRMED: "INBOUND_CONFIRMED",
  INBOUND_UNCONFIRMED: "INBOUND_UNCONFIRMED",
} as const;

export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE];
```

### 3. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_stock_movement_status/migration.sql`:

```sql
-- 1. status カラム追加（default CONFIRMED）
ALTER TABLE "StockMovement" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIRMED';

-- 2. 既存データのバックフィル
UPDATE "StockMovement" SET "status" = 'PLANNED' WHERE "movementType" = 'planned_reserve';
-- 未確定発注由来の inbound は status=PLANNED として扱う
UPDATE "StockMovement" SET "status" = 'PLANNED'
  WHERE "movementType" = 'inbound'
    AND "sourceType" = 'purchase_order'
    AND "sourceId" IN (
      SELECT "id" FROM "PurchaseOrder" WHERE "status" IN ('candidate', 'draft', 'ordered_unconfirmed')
    );

-- 3. ユニーク制約追加（既存重複があれば失敗するので確認が必要）
-- 既存重複の検出と除去は別途データクリーニングで対応。本マイグレーション内では制約付与のみ。
CREATE UNIQUE INDEX "stock_movement_source_unique" ON "StockMovement"("sourceType", "sourceId", "movementType")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

**注**: `sourceType IS NULL OR sourceId IS NULL` のレコード（手動 `adjustment` など）はユニーク制約から除外（部分ユニークインデックス）。SQLite では `CREATE UNIQUE INDEX ... WHERE` が使える。

### 4. Zod 拡張

`app/src/lib/schemas.ts`:

```ts
export const InventoryLedgerStatusEnum = z.enum(["PLANNED", "CONFIRMED", "CANCELLED"]);

// StockMovementCreateSchema があれば status optional で追加
// inventory/adjustments の入力 Zod に status optional 追加
```

### 5. API ルート対応

#### `GET /api/inventory`

レスポンスに `status` を含める。**ただし既存フィールドは絶対に壊さない**。

#### `POST /api/inventory/adjustments`

リクエストで `status` を受け取れる（optional、未指定なら `CONFIRMED`）。

#### `POST /api/daily-reports/[id]/confirm`

ここでの `actual_consume`（負）・`inbound`（正）発行に `status: 'CONFIRMED'` を明示。movementType も新形式 `ACTUAL_MATERIAL_USE` / `ACTUAL_PRODUCTION_IN` を **使い始める**（既存形式は **2-2 でロジックを書き直すまで並存**）。

→ Phase 2-1 内では、既存ロジック（小文字 movementType + status 暗黙）から **新形式 + 明示 status** への書き換えは行わない。Phase 2-2 で行う。**ここでは schema 拡張 + Zod + 既存 API のレスポンス互換性維持 + seed 拡張だけ**。

### 6. seed 拡張

既存 StockMovement 3 件（原料X 20kg, 袋 5000枚, 製品 200袋）の `status` を `CONFIRMED` に明示設定。

### 7. ユニットテスト + 2-T の skip 解除

`test/integration/inventory_ledger_status.test.ts`（2-T で作成）の：
- 既存データに status カラムが追加され、PLANNED / CONFIRMED が区別できる旨を確認する1〜2ケースを skip 解除
- 残りは 2-2 / 2-4 / 2-5 で順次解除

`test/integration/inventory_ledger_idempotency.test.ts` の：
- 「Same source cannot be inserted twice」を skip 解除（ユニーク制約のテスト）
- 残りは 2-2 で解除

### 8. 既存テストとの互換性

- Phase 1 統合テスト 63 件 + ユニット 46 件は **全件 pass を維持**
- `material-forecast.test.ts` で StockMovement を読むテストがあるので、status カラム追加で壊れないか必ず確認

## 絶対遵守

- 既存 `movementType` enum 値（`opening` / `planned_reserve` / `actual_consume` / `inbound` / `adjustment` / `transfer`）を削除しない。
- 既存 API レスポンスシェイプを壊さない（フィールド追加のみ）。
- `daily-reports/[id]/confirm` の **挙動を変えない**（2-1 では schema 追加だけ。発行ロジックの書き換えは 2-2）。
- `app/src/components/ui/`, `globals.css`, `layout.tsx` は触らない。
- マイグレーション SQL は `prisma migrate dev` で適用前に `prisma migrate diff` で内容確認すること。

## 完了条件

- [ ] `prisma/schema.prisma` に `status: InventoryLedgerStatus` + ユニーク制約追加
- [ ] マイグレーション `_stock_movement_status` 適用済み（dev.db 既存データに status バックフィル）
- [ ] `MOVEMENT_TYPE` 定数が `lib/inventory.ts` または `lib/inventory-types.ts` にエクスポートされている
- [ ] `npm run typecheck` 通る
- [ ] `npm run test` で既存 109 件 + 2-T で skip 解除分が全件 pass
- [ ] `GET /api/inventory` のレスポンスに `status` が含まれる
- [ ] 既存 `/inventory` 画面が壊れずに動作（手動目視）
- [ ] seed が新形式で流せる
- [ ] 二重登録試行が `unique constraint` エラーになる（2-T テストで確認）

## 報告

300 字以内で：
- マイグレーション名
- バックフィルした既存レコード数（PLANNED に変えた数）
- 既存ユニーク制約のエラーが出たかどうか
- 新規 movementType 定数の場所
- 既存テスト全件 pass の確認
- 2-T で skip 解除した件数と残数
