# Phase 1-5: 生産能力マスタ拡張

## 使用ツール

Codex

## 位置づけ

1-3 後、1-4 / 1-7 と並列実行可。

## 目的

`ProductionCapacity` に **`sourceType`（手動入力 or 日報中央値）** と **`locked`（自動更新拒否）** を追加。docs/18 §1-5 と §7-5-6 が Phase 5 の中央値自動更新で必要。

- `sourceType` (Enum: MANUAL / DAILY_REPORT_MEDIAN, default MANUAL)
- `locked` (Boolean, default false)
- `validFrom` (DateTime, optional)
- `validTo` (DateTime, optional)

**既存 `reviewStatus`/`reviewMemo`/`reviewedAt` は残置**（[`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1）。用途が違うため両立する。

## 読むファイル

- `app/prisma/schema.prisma`（model ProductionCapacity）
- `app/src/lib/schemas.ts`（CapacityUpsertSchema）
- `app/src/app/api/capacities/route.ts`, `[id]/route.ts`
- `app/src/app/capacity-review/page.tsx`（依存構造のみ確認）
- `app/prisma/migrations/202605210001_capacity_review/migration.sql`（既存 review カラム経緯）

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model ProductionCapacity {
  // ... 既存（productId, workAreaId, peopleCount, ratePerHourPerPerson, standardBreakMinutes, reviewStatus, reviewMemo, reviewedAt 等）...
  sourceType CapacitySourceType @default(MANUAL)
  locked     Boolean            @default(false)
  validFrom  DateTime?
  validTo    DateTime?
  active     Boolean            @default(true)  // 既存に無ければ追加
}

enum CapacitySourceType {
  MANUAL                 // 手動入力
  DAILY_REPORT_MEDIAN    // 日報中央値で自動更新（Phase 5）
}
```

`active` カラムが既存にない場合のみ追加。

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_capacity_source_locked/migration.sql`

既存データは `sourceType = 'MANUAL'`, `locked = false` を入れる。

### 3. Zod 拡張

`CapacityUpsertSchema` に新カラムを追加。

### 4. API 対応

`POST /api/capacities`（upsert）, `GET /api/capacities` で新カラムを扱う。`locked = true` のレコードは、Phase 5 の自動更新ロジックが触らないようにする伏線。Phase 1-5 では **`locked` フラグの保存・読み出しまで**（自動更新ロジックは Phase 5）。

### 5. ユニットテスト

`app/test/integration/capacities.extension.test.ts`：
- sourceType の 2 値受け入れ
- locked デフォルト false
- locked = true を保存できる
- reviewStatus と sourceType が並存できる
- validFrom/validTo の境界

### 6. seed

既存 ProductionCapacity 2 件に `sourceType = 'MANUAL'`, `locked = false` を明示。

## 絶対遵守

- 既存 `reviewStatus`, `reviewMemo`, `reviewedAt` は削除も改名もしない。
- 既存 API `/api/capacities` のレスポンスシェイプを壊さない。
- `capacity-review` 画面は触らない（1-U で扱う）。
- Phase 5 の自動更新ロジックはここでは作らない（`locked` の参照は伏線として残すだけ）。

## 完了条件

- [ ] マイグレーション成功
- [ ] テスト全件 pass
- [ ] typecheck 通る
- [ ] 既存 `/capacity-review` が壊れず動作

## 報告

200 字以内で：マイグレーション名、reviewStatus と sourceType の関係をどう整理したか、テスト数。
