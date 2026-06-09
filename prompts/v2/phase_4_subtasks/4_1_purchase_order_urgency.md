# Phase 4-1: PurchaseOrder.urgency 列追加 + 緊急度算出

## 使用ツール

Codex

## 位置づけ

Phase 4 の **先行スキーマ変更**。4-T と並列実行可。4-2 / 4-3 の前提。

## 目的

`PurchaseOrder` に **`urgency` カラム**（`CRITICAL` / `WARNING` / `INFO` / `NONE`）を追加し、`required_order_date` と現在日付の差分から自動算出する。発注候補生成時にも自動付与。

## 確定仕様

緊急度の閾値（[`README.md`](README.md)）：

| 閾値 | urgency |
|---|---|
| `required_order_date` が **今日 ± 1日** | **CRITICAL** |
| `required_order_date` が **今日 + 2日〜+7日** | **WARNING** |
| `required_order_date` が **今日 + 8日以上** | **INFO** |
| `required_order_date` が null | **NONE** |

「今日 ± 1日」= 今日 / 昨日 / 明日。**今日含む過去日は全部 CRITICAL**（既に手遅れまたは間際）。

## 前提

- 既存 `PurchaseOrder` schema：`shortageDate`, `recommendedOrderDate`, `sourceType`, `sourceId` あり
- 既存 `purchase-candidates/generate/route.ts` が `recommendedOrderDate = shortageDate - leadTimeDays` を計算済み

## 読むファイル

- [`app/prisma/schema.prisma`](../../../app/prisma/schema.prisma) model PurchaseOrder
- [`app/src/lib/schemas.ts`](../../../app/src/lib/schemas.ts) PurchaseOrder 関連 Zod
- [`app/src/app/api/purchase-candidates/generate/route.ts`](../../../app/src/app/api/purchase-candidates/generate/route.ts)
- [`app/src/app/api/purchase-orders/[id]/route.ts`](../../../app/src/app/api/purchase-orders/[id]/route.ts)
- [`app/src/lib/material-forecast.ts`](../../../app/src/lib/material-forecast.ts)（shortage 判定との連動）

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model PurchaseOrder {
  // ... 既存（id, itemType, itemId, supplierId, orderedQuantity, status, shortageDate, recommendedOrderDate, sourceType, sourceId, etc）...
  urgency PurchaseOrderUrgency @default(NONE)
}

enum PurchaseOrderUrgency {
  CRITICAL
  WARNING
  INFO
  NONE
}
```

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_purchase_order_urgency/migration.sql`:

```sql
-- urgency カラム追加（default NONE）
ALTER TABLE "PurchaseOrder" ADD COLUMN "urgency" TEXT NOT NULL DEFAULT 'NONE';

-- 既存データのバックフィル: recommendedOrderDate から再計算
-- （実装側関数を一度呼ぶ shell スクリプトで対応してもよい。SQL では日付計算が SQLite だと面倒なので、後続の TypeScript 関数で対応する想定）
```

**SQL での日付バックフィルは複雑**なので、`scripts/backfill-purchase-order-urgency.ts`（新規）で対応：

```bash
npm run db:migrate
tsx scripts/backfill-purchase-order-urgency.ts
```

スクリプトの中身は §3 の関数を呼ぶだけ。

### 3. 緊急度算出ロジック（純関数）

`app/src/lib/purchase-order-urgency.ts`（新規）：

```ts
export type PurchaseOrderUrgency = "CRITICAL" | "WARNING" | "INFO" | "NONE";

/**
 * required_order_date と asOfDate の差から urgency を算出
 * - 過去日 OR 今日 OR 今日+1日 → CRITICAL
 * - 今日+2日〜今日+7日 → WARNING
 * - 今日+8日以上 → INFO
 * - null → NONE
 */
export function computeUrgency(input: {
  requiredOrderDate: Date | null;
  asOfDate: Date;
}): PurchaseOrderUrgency {
  if (!input.requiredOrderDate) return "NONE";
  const msPerDay = 24 * 60 * 60 * 1000;
  const requiredDay = startOfDay(input.requiredOrderDate);
  const asOfDay = startOfDay(input.asOfDate);
  const diffDays = Math.floor((requiredDay.getTime() - asOfDay.getTime()) / msPerDay);
  if (diffDays <= 1) return "CRITICAL";
  if (diffDays <= 7) return "WARNING";
  return "INFO";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
```

純関数テスト `app/src/lib/purchase-order-urgency.test.ts`（新規）：境界 8 ケース（今日 / 昨日 / 1日後 / 2日後 / 7日後 / 8日後 / null / 大きな未来）

### 4. Zod 拡張

```ts
// schemas.ts
export const PurchaseOrderUrgencyEnum = z.enum(["CRITICAL", "WARNING", "INFO", "NONE"]);

// PurchaseOrderCreateSchema / UpdateSchema に urgency を optional で追加
```

### 5. 既存 API 拡張

`POST /api/purchase-candidates/generate`：
- 候補を作るときに `computeUrgency(...)` を呼んで urgency を埋める
- レスポンスシェイプ：既存フィールド維持、`urgency` を追加

`GET /api/purchase-orders/[id]`：レスポンスに `urgency` を含める

`PUT /api/purchase-orders/[id]`：
- `recommendedOrderDate` が変更されたら urgency も再計算（サーバ側で）
- リクエスト側で urgency 直接指定もできる（手動オーバーライド用）

### 6. 統合テスト skip 解除（4-T 連携）

`test/integration/purchase_order_urgency.test.ts` の 8 件全部 skip 解除 → pass を確認。

### 7. seed 拡張

既存 PurchaseOrder seed があれば、`urgency` を明示。なければ追加不要。

### 8. 既存テストへの影響

既存 131 + 4-T 統合テスト 8 件（解除分）が全件 pass。

## 絶対遵守

- 既存 `PurchaseOrder.status` enum 値を変更しない
- 既存 API レスポンスシェイプを壊さない（フィールド追加のみ）
- `lib/material-forecast.ts` の shortage 判定ロジックを変えない
- マスタ画面・layout・globals.css は触らない

## 完了条件

- [ ] `prisma/schema.prisma` に `urgency` + `PurchaseOrderUrgency` enum 追加
- [ ] マイグレーション適用 + バックフィルスクリプト実行
- [ ] `lib/purchase-order-urgency.ts` + テストファイル追加
- [ ] `purchase-candidates/generate` が urgency を自動付与
- [ ] `GET /api/purchase-orders/[id]` レスポンスに urgency 含む
- [ ] 4-T の 8 件統合テスト全部 pass
- [ ] `npm run typecheck` clean
- [ ] `npm run test` で全件 pass
- [ ] 既存 `/purchases` 画面が壊れない（手動目視）

## 報告

300 字以内で：
- マイグレーション名
- バックフィルしたレコード数（urgency 別）
- 新規ライブラリ・スクリプト名
- 4-T skip 解除件数
- 既存テスト全件 pass の確認
