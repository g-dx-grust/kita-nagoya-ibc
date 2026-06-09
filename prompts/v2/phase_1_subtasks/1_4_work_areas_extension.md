# Phase 1-4: 作業場所マスタ拡張

## 使用ツール

Codex

## 位置づけ

1-3 後、1-5 / 1-7 と並列実行可。

## 目的

`WorkArea` に **設備種別**と**同時稼働可否**を追加。docs/18 §1-4 が要求する `ROOM/LINE/MACHINE` 区分と「同時稼働できない制約」を吸収する。

- `equipmentKind` (Enum: ROOM / LINE / MACHINE / OTHER, default ROOM)
- `concurrentOperationAllowed` (Boolean, default true)
- `validFrom` (DateTime, optional)
- `validTo` (DateTime, optional)

既存 `areaType` (internal/external/warehouse) と `externalFlag` は維持。

## 読むファイル

- `app/prisma/schema.prisma`（model WorkArea）
- `app/src/lib/schemas.ts`（WorkArea 系 Zod）
- `app/src/app/api/work-areas/route.ts`, `[id]/route.ts`
- `app/src/app/masters/work-areas/page.tsx`（依存構造の確認のみ。編集は 1-U）
- `app/prisma/seed.ts`（既存 4 件の WorkArea）

## やってほしいこと

### 1. Prisma スキーマ拡張

```prisma
model WorkArea {
  // ... 既存（id, name, areaType, externalFlag, maxPeopleCount, active 等）...
  equipmentKind              EquipmentKind @default(ROOM)
  concurrentOperationAllowed Boolean       @default(true)
  validFrom                  DateTime?
  validTo                    DateTime?
}

enum EquipmentKind {
  ROOM
  LINE
  MACHINE
  OTHER
}
```

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_work_area_equipment_kind/migration.sql`

既存 4 件は `equipmentKind = 'ROOM'`, `concurrentOperationAllowed = true` を入れる（既定値）。

### 3. Zod 拡張

`WorkAreaCreateSchema`, `WorkAreaUpdateSchema` に追加。

### 4. API 対応

`GET /api/work-areas`, `POST /api/work-areas`, `PUT /api/work-areas/[id]` のリクエスト・レスポンスに新カラムを含める。

### 5. ユニットテスト

`app/test/integration/work-areas.extension.test.ts`：
- equipmentKind の 4 値受け入れ
- 既定 ROOM
- concurrentOperationAllowed = false の状態を保存できる
- validFrom/validTo の境界

### 6. seed

機械部屋に `equipmentKind = MACHINE`, `concurrentOperationAllowed = false` を設定（**§7-1 #4 確定後、正式名称も seed に反映する**こと。未確定なら現状の「機械部屋」「一般部屋」「仕上げ部屋」「外注先A」を維持）。

## 絶対遵守

- 既存 `areaType` enum（internal/external/warehouse）と `externalFlag` は変更しない。
- 既存 API レスポンスを壊さない。
- マスタ画面（`/masters/work-areas`）は触らない（1-U で扱う）。
- 部屋名・外注先名はハードコードしない（CLAUDE.md ルール）。
- §7-1 #4（作業場所正式名称）が未確定のうちは、seed 内のローカル名は既存どおり保持する。`equipmentKind` だけ Phase 1-4 で確定。

## 完了条件

- [ ] マイグレーション成功
- [ ] 全テスト pass
- [ ] typecheck 通る
- [ ] 既存 `/masters/work-areas` が壊れず動作

## 報告

200 字以内で：マイグレーション名、seed の equipmentKind 配分、テスト数。
