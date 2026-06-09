# Phase 1-S: 仕入先マスタ拡張

## 使用ツール

Codex

## 位置づけ

1-T 後、1-1 / 1-2 と並列実行可。最小規模のサブタスク。

## 目的

`Supplier` モデルに `validFrom` / `validTo` を追加。既存 active フラグはそのまま。

## 読むファイル

- `app/prisma/schema.prisma`（model Supplier）
- `app/src/lib/schemas.ts`（SupplierCreateSchema, SupplierUpdateSchema）
- `app/src/app/api/suppliers/route.ts`

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model Supplier {
  // ... 既存 ...
  validFrom DateTime?
  validTo   DateTime?
}
```

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_supplier_validity_period/migration.sql`

### 3. Zod 拡張

`SupplierCreateSchema`, `SupplierUpdateSchema` に追加。

### 4. API 対応

`GET /api/suppliers`, `POST /api/suppliers` のレスポンスに含める。

### 5. テスト

`app/test/integration/suppliers.extension.test.ts`：
- validFrom/validTo の null 許容
- 順序逆転のバリデーション

### 6. seed

既存 Supplier 1 件に `validFrom = 2026-01-01`, `validTo = null` を設定。

## 絶対遵守

- 既存 API レスポンスを壊さない。
- マスタ画面は触らない（仕入先マスタ画面は現状未実装。1-U で扱う。1-S では API のみ）。

## 完了条件

- [ ] マイグレーション成功
- [ ] テスト全件 pass
- [ ] typecheck 通る

## 報告

100 字以内で：マイグレーション名、テスト数。
