# Phase 1-3: BOM 有効期間追加

## 使用ツール

Codex

## 位置づけ

1-1（商品）と 1-2（原料・資材）の完了後に着手。BOM は商品と原料/資材の両方に依存するため。1-4, 1-5, 1-7 はこの後で並列実行可。

## 目的

`ProductBomItem` に `validFrom` / `validTo` を追加し、BOM の有効期間を管理できるようにする。

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 1 1-3 と [`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1。

## 読むファイル

- `app/prisma/schema.prisma`（model ProductBomItem）
- `app/src/lib/schemas.ts`（BomReplaceSchema）
- `app/src/app/api/products/[id]/bom/route.ts`
- `app/src/lib/plan-engine.ts:loadProductBom`（BOM 読み出しロジック）
- `app/src/lib/calculations.ts:computeMaterialRequirements`

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model ProductBomItem {
  // ... 既存（productId, itemType, itemId, quantityPerUnit, lossRate, mixRatio, unit, note）...
  validFrom DateTime?
  validTo   DateTime?
  active    Boolean   @default(true)  // 既存に無ければ追加
}
```

`active` カラムが既存にない場合のみ追加。既存にあれば触らない（0-1 §1 を参照して確認）。

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_bom_validity_period/migration.sql`

### 3. Zod 拡張

`BomReplaceSchema` の items 配列要素に `validFrom`, `validTo`（optional）を追加。

### 4. BOM 読み出しロジック修正

`lib/plan-engine.ts:loadProductBom` を修正：
- 引数に `effectiveDate: Date`（既定: today）を受け取る
- `validFrom <= effectiveDate AND (validTo IS NULL OR effectiveDate < validTo)` でフィルタ
- 既存呼び出し側は `effectiveDate` 省略 → today 扱いで挙動互換

### 5. API 対応

`GET /api/products/[id]/bom`：`validFrom`, `validTo` をレスポンスに含める。
`PUT /api/products/[id]/bom`：受け取った値を保存。

### 6. ユニットテスト

`app/test/integration/bom.validity.test.ts`：
- validFrom/validTo を持つ BOM 行が今日有効か正しく判定
- effectiveDate を変えると別バージョンの BOM が引ける
- 期間外の行は `loadProductBom` の結果に含まれない
- `computeMaterialRequirements` の入力に有効 BOM のみが渡る（重要：所要量計算が古い BOM を拾わない）

純関数テストなので `src/lib/plan-engine.test.ts` 寄りに置いてもよい（ただし plan-engine は DB 依存。書きやすさで判断）。

### 7. seed

既存 BOM 2 行に `validFrom = 2026-01-01`, `validTo = null` を設定。

## 絶対遵守

- 既存 BOM レスポンスの `quantityPerUnit`, `lossRate`, `mixRatio`, `unit`, `note` は維持。
- `lib/plan-engine.ts:loadProductBom` の既存呼び出しがすべて互換動作すること（effectiveDate デフォルト today で同じ結果）。
- 既存 `computeMaterialRequirements`（純関数）のシグネチャは変更しない。
- マスタ画面の BOM 編集 UI（`/masters/products/[id]`）は触らない（1-U で扱う）。

## 完了条件

- [ ] マイグレーション成功
- [ ] 既存テスト全件 pass（特に `material-forecast.test.ts`, `calculations.test.ts`）
- [ ] 新規テスト全件 pass
- [ ] typecheck 通る
- [ ] 既存 `/production-plans/new` で生産予定登録すると、新規 BOM カラム影響なしで原料計算が走る

## 報告

200 字以内で：マイグレーション名、`loadProductBom` の引数変更点、テスト数。
