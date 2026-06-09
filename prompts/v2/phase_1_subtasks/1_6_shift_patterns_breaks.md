# Phase 1-6: シフトパターン・休憩マスタ新設

## 使用ツール

Codex（実装）→ Claude Code（定数移行と動作確認）

## 位置づけ

1-4（作業場所拡張）の後に着手。1-6 完了後に 1-U と 1-V を並列実行。

## 目的

- `shift_patterns`：標準シフトパターンを保持（仮シフトで再利用、Phase 8）
- `shift_breaks`：休憩窓マスタ。**現在 `app/src/lib/calculations.ts` にハードコードされている `DAILY_BREAK_WINDOWS = [12:00-13:00, 15:00-15:15]` をマスタに移行する**
- `employee_shifts (Shift)` に `shiftPatternId` 任意 FK を追加（既存日付ベース運用と共存）

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 1 1-6、[`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1。

## 前提

- 既存 `app/src/lib/calculations.ts` で `DAILY_BREAK_WINDOWS` が定義され、計算ロジック（`computeProductionDuration`, `addWorkingMinutesSkippingBreaks` 等）から参照されている（[0-2 §2](../../../docs/phase_0_outputs/0_2_api_logic_audit.md)）。
- `calculations.test.ts` の 15 ケースは現在の固定休憩窓を前提に書かれている。**テストを壊さないこと**。
- マスタ化後も既存呼び出しは「fallback で定数も残す」設計（[0-3 §4-3 完了条件](../../../docs/phase_0_outputs/0_3_boundary_decision.md)）。
- 休憩窓の日別変動は Phase 1 では実装しない（[§7-2 #6](../../../docs/phase_0_outputs/0_3_boundary_decision.md)）。固定窓の運用＋マスタ化までが Phase 1 のスコープ。

## 担当分担

| ステップ | 担当 | 内容 |
|---|---|---|
| §1〜§5 | **Codex** | スキーマ・マイグレーション・Zod・CRUD API・seed |
| §6〜§7 | **Claude Code** | `calculations.ts` の定数 → DB 参照への移行と、既存 41 テストが壊れないか確認 |

## 読むファイル

- `app/prisma/schema.prisma`（model Shift, Employee）
- `app/src/lib/calculations.ts`（`DAILY_BREAK_WINDOWS`, `computeBreakMinutesInTimeWindow`, `addWorkingMinutesSkippingBreaks`, `isDailyBreakMinute`）
- `app/src/lib/calculations.test.ts`（休憩を絡めたテストの期待値）
- `app/src/app/api/shifts/route.ts`, `month/route.ts`
- `app/prisma/migrations/202605210003_daily_break_windows/migration.sql`（休憩 0 正規化の経緯）

## Codex への指示

### 1. Prisma スキーマ追加

```prisma
model ShiftPattern {
  id              String    @id @default(cuid())
  name            String    // "標準1", "土曜短時間" 等
  startTime       String    // "08:00"
  endTime         String    // "17:00"
  overtimeAllowed Boolean   @default(false)
  active          Boolean   @default(true)
  validFrom       DateTime?
  validTo         DateTime?
  note            String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  shifts          Shift[]
  @@map("shift_patterns")
}

model ShiftBreak {
  id              String   @id @default(cuid())
  shiftPatternId  String?  // null = 全パターン共通の固定休憩
  startTime       String   // "12:00"
  endTime         String   // "13:00"
  label           String?  // "昼休憩" "午後休憩"
  active          Boolean  @default(true)
  validFrom       DateTime?
  validTo         DateTime?
  pattern         ShiftPattern? @relation(fields: [shiftPatternId], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([shiftPatternId, startTime])
  @@map("shift_breaks")
}

model Shift {
  // ... 既存 ...
  shiftPatternId String?
  pattern        ShiftPattern? @relation(fields: [shiftPatternId], references: [id])
}
```

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_shift_patterns_breaks/migration.sql`

### 3. seed 拡張

`prisma/seed.ts` に以下を追加：

```ts
// 標準シフトパターン（仮）
const standardPattern = await prisma.shiftPattern.create({
  data: { name: '標準（平日）', startTime: '08:00', endTime: '17:00', overtimeAllowed: true },
});

// 固定休憩 2 件（既存定数 DAILY_BREAK_WINDOWS と一致）
await prisma.shiftBreak.createMany({
  data: [
    { shiftPatternId: null, startTime: '12:00', endTime: '13:00', label: '昼休憩' },
    { shiftPatternId: null, startTime: '15:00', endTime: '15:15', label: '午後休憩' },
  ],
});
```

### 4. Zod 拡張

`ShiftPatternCreateSchema`, `ShiftPatternUpdateSchema`, `ShiftBreakCreateSchema`, `ShiftBreakUpdateSchema`。`startTime`/`endTime` は `/^([01]\d|2[0-3]):[0-5]\d$/` の HH:MM 形式。

### 5. 最小 CRUD API

- `GET /api/shift-patterns`
- `POST /api/shift-patterns`
- `GET /api/shift-patterns/[id]` / `PUT` / `DELETE`
- `GET /api/shift-breaks`（pattern 別の絞り込み付き）
- `POST /api/shift-breaks` / `PUT` / `DELETE`

監査ログ全付け。

## Claude Code への指示（Codex 完了後）

### 6. `calculations.ts` の定数移行

- `DAILY_BREAK_WINDOWS` を **削除しない**。**fallback として残す**（[`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §4-3 要件）。
- 新規関数 `loadActiveBreakWindows(): Promise<BreakWindow[]>` を `app/src/lib/break-windows.ts` に作る。`shift_breaks` から `active = true AND (validTo IS NULL OR today < validTo) AND (validFrom IS NULL OR validFrom <= today)` でロードし、HH:MM 文字列の配列にして返す。レコードが 0 件なら定数 fallback を使う。
- 既存の `computeBreakMinutesInTimeWindow`, `addWorkingMinutesSkippingBreaks`, `isDailyBreakMinute` の純関数シグネチャは **変更しない**（テストが壊れる）。
- 既存呼び出し側（`plan-engine.ts:recalculateProductionPlan` 等）で「DB 由来の休憩窓」を引数で渡せるように API 層でラップする。引数省略時は定数 fallback。

### 7. テスト追加・既存テスト確認

- `app/src/lib/break-windows.test.ts`（純関数テスト）：固定値 fallback、DB ロード時の挙動、validFrom/validTo フィルタ
- `app/test/integration/shift-patterns.test.ts`（DB 統合テスト）：CRUD
- `app/test/integration/shift-breaks.test.ts`（DB 統合テスト）：CRUD と DB 由来の休憩窓を使った所要時間計算
- **既存 `calculations.test.ts` 15 ケースが全件 pass することを確認**

## 絶対遵守（両ツール共通）

- `app/src/lib/calculations.ts` の純関数シグネチャを変更しない（既存テスト互換）。
- `DAILY_BREAK_WINDOWS` 定数は削除しない（fallback として残す）。
- 既存 Shift API（`/api/shifts`, `/api/shifts/month`）のレスポンスを壊さない。
- マスタ画面・layout・globals.css は触らない。

## 完了条件

- [ ] マイグレーション成功
- [ ] 既存 `calculations.test.ts` 15 ケースが全件 pass
- [ ] `npm run test:integration` 全件 pass
- [ ] `shift_patterns` / `shift_breaks` の CRUD が動く
- [ ] `loadActiveBreakWindows()` が DB から休憩窓を引ける
- [ ] `prisma/dev.db` に標準パターン 1 件、休憩窓 2 件が seed されている

## 報告（Codex / Claude Code それぞれ）

300 字以内で：
- マイグレーション名・追加した route 数（Codex）
- 既存 calculations.test.ts 全件 pass の確認（Claude Code）
- `loadActiveBreakWindows()` のシグネチャ（Claude Code）
