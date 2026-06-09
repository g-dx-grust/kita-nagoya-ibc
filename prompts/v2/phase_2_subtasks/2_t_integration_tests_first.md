# Phase 2-T: 統合テスト先行追加（状態遷移・二重登録防止）

## 使用ツール

Claude Code

## 位置づけ

Phase 2 の **先行タスク**。2-1 と並列に着手可。テストファーストで「Phase 2 完了後にこういう挙動になっているべき」を先に固定する。

## 目的

Phase 2 で変わる最重要挙動を **失敗するテスト** として先に書き、Phase 2-1〜2-5 完了時に **pass するように** する。テストファーストで回帰を確実に検出する。

対象シナリオ：

- 在庫の **PLANNED → CONFIRMED → CANCELLED** 状態遷移（[0-C §4 E1, E3](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md)）
- **二重登録防止**（`(sourceType, sourceId, movementType)` ユニーク制約の冪等性）
- 任意日付の **理論在庫計算**（PLANNED + CONFIRMED 合算）の境界
- **未確定発注**（`INBOUND_UNCONFIRMED`）が確定在庫に混入しない

## 前提

- 既存統合テスト基盤（Phase 1-T で構築済み）：[`app/test/README.md`](../../../app/test/README.md)
- ヘルパー：`test/helpers/{prisma,cleanup,factories}.ts`
- 既存テスト 109 件は引き続き pass する状態。

## 読むファイル

- `docs/phase_0_outputs/0_c_test_coverage_diff.md` §4 E1〜E10（統合テスト要件一覧）
- `docs/phase_0_outputs/0_3_boundary_decision.md` §1-2（Phase 2 のテーブル判断）
- `app/prisma/schema.prisma`（model StockMovement）
- `app/src/lib/inventory.ts:getInventoryFor`（既存実装）
- `app/src/lib/material-forecast.ts`（既存予測ロジック）
- `app/test/integration/products.crud.test.ts`（サンプルパターン）
- `app/test/helpers/factories.ts`（ファクトリ一覧）

## やってほしいこと

### 1. ファクトリ追加

`app/test/helpers/factories.ts` に以下を追加：

```ts
export async function createTestStockMovement(
  prisma: PrismaClient,
  data: Partial<Prisma.StockMovementCreateInput> & {
    itemId: string;
    itemType: "product" | "raw_material" | "packaging";
    quantity: number;
    movementType: string;
    movementDate?: Date;
    status?: "PLANNED" | "CONFIRMED" | "CANCELLED";
    sourceType?: string;
    sourceId?: string;
  },
): Promise<StockMovement>;

export async function createTestPurchaseOrder(
  prisma: PrismaClient,
  data: Partial<Prisma.PurchaseOrderCreateInput> & {
    itemId: string;
    itemType: "raw_material" | "packaging";
    quantity: number;
    status?: "candidate" | "draft" | "ordered_unconfirmed" | "confirmed" | "received" | "cancelled";
  },
): Promise<PurchaseOrder>;

export async function createTestProductionPlan(
  prisma: PrismaClient,
  data: Partial<Prisma.ProductionPlanCreateInput> & {
    productId: string;
    workAreaId: string;
    plannedQuantity: number;
    date: Date;
    plannedStartTime?: string;
    plannedPeopleCount?: number;
  },
): Promise<ProductionPlan>;
```

**注**: Phase 2-1 完了前は `status` カラムは schema に存在しないため、`status` は schema 拡張後に有効化される。テスト書く時点では `as any` 等でランタイムに型エラーを抑える形で書いておき、Phase 2-1 完了時に有効化する設計でよい。**ただし Phase 2-1 と並列の場合は schema 拡張がまだなので、status を扱うテストは `it.skip` でマーク**しておき、2-1 完了時にスキップ解除する。

### 2. テストファイル新規作成

#### `test/integration/inventory_ledger_status.test.ts`

PLANNED → CONFIRMED → CANCELLED の状態遷移と理論在庫計算：

```ts
describe("InventoryLedger status transitions", () => {
  it.skip("PLANNED rows contribute to theoretical stock but not to confirmed stock", async () => {
    // 製品 A, 初期在庫 (CONFIRMED, opening) 100
    // PLANNED_PRODUCTION_IN +50 (status=PLANNED)
    // → confirmedStock=100, theoreticalStock=150
  });

  it.skip("PLANNED → CONFIRMED transition recomputes both stocks correctly", async () => {
    // PLANNED 行を CONFIRMED に変更
    // → confirmedStock=150, theoreticalStock=150 (一致)
  });

  it.skip("CANCELLED rows are excluded from both stocks", async () => {
    // PLANNED → CANCELLED
    // → confirmedStock=100, theoreticalStock=100
  });

  it.skip("Future PLANNED_SHIPMENT_OUT reduces theoretical stock but not confirmed", async () => { /* ... */ });

  it.skip("INBOUND_UNCONFIRMED is excluded from confirmed stock", async () => { /* ... */ });
});
```

#### `test/integration/inventory_ledger_idempotency.test.ts`

二重登録防止（ユニーク制約）：

```ts
describe("InventoryLedger idempotency", () => {
  it.skip("Same (sourceType, sourceId, movementType) cannot be inserted twice", async () => {
    // 同じ source で 2 度作成 → 2 度目が unique violation で reject
  });

  it.skip("Re-running daily-report confirm is idempotent (no duplicate movements)", async () => {
    // confirm を 2 度呼んでも StockMovement 行が増えない
  });

  it.skip("Different movementType under same source is allowed", async () => {
    // (sourceType=daily_report, sourceId=X, movementType=actual_consume)
    // と (sourceType=daily_report, sourceId=X, movementType=inbound) は両立
  });
});
```

#### `test/integration/inventory_calc_unified.test.ts`

商品/原料/資材すべてに `getInventoryFor` が動く：

```ts
describe("Unified inventory calculation", () => {
  it.skip("getInventoryFor returns onHand/confirmedInbound/unconfirmedInbound for products", async () => { /* ... */ });
  it.skip("getInventoryFor returns same for materials and packaging", async () => { /* ... */ });
  it.skip("Asof date excludes future movements", async () => { /* ... */ });
});
```

#### `test/integration/pipeline_E1.test.ts`

Phase 3→4 一気通貫（[0-C E1](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md)）：

```ts
describe("Pipeline E1: production plan → BOM → ledger PLANNED → shortage detection", () => {
  it.skip("ProductionPlan creation emits PLANNED_MATERIAL_USE in StockMovement", async () => { /* ... */ });
  it.skip("Shortage is detected from theoretical stock", async () => { /* ... */ });
  it.skip("Purchase candidate is generated from shortage", async () => { /* ... */ });
});
```

#### `test/integration/pipeline_E3.test.ts`

Phase 5 日報承認パイプライン（[0-C E3](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md)）：

```ts
describe("Pipeline E3: daily report draft → approve → ACTUAL_*", () => {
  it.skip("Draft daily report does NOT change actual stock", async () => { /* ... */ });
  it.skip("Confirmed daily report emits ACTUAL_MATERIAL_USE and ACTUAL_PRODUCTION_IN", async () => { /* ... */ });
  it.skip("PLANNED movements remain unchanged after confirm (not deleted, only superseded by ACTUAL)", async () => { /* ... */ });
});
```

### 3. テストの初期状態

すべて `it.skip(...)` でマーク。Phase 2-1 完了時に 2-1 のレビュー作業として skip を解除する（または個別タスクで Codex がそれぞれ解除）。

`describe` ブロックは `describe.skip` ではなく通常の `describe` にしておき、それぞれのテストの skip 解除だけで pass するようにする。

### 4. 既存テストへの影響

既存 109 件は変更しない。新規追加分は全部 skip 状態のため、`npm run test` 全体には影響しない（pass 数は変わるが fail はしない）。

### 5. ドキュメント

`test/integration/README.md` 等は無いので、各テストファイル冒頭に「2-X 完了時にこの skip を解除」のコメントを書く：

```ts
// Phase 2-1 完了時に status カラムが追加されるため、以下のテストの skip を解除すること。
// 2-1 prompt: prompts/v2/phase_2_subtasks/2_1_stock_movement_extension.md
```

## 絶対遵守

- 既存テストは1件も変更しない（既存 `*.test.ts` 編集禁止）。
- 既存 factories.ts のシグネチャを変更しない（**追加のみ**）。
- `schema.prisma` は触らない（2-1 の担当）。
- `lib/inventory.ts` は触らない（2-4 の担当）。
- `app/src/app/`, `components/`, `globals.css`, `layout.tsx` は触らない。

## 完了条件

- [ ] 5 ファイル新規追加（5 シナリオ群）
- [ ] 各テストが `it.skip` でマークされている
- [ ] factories.ts に 3 ファクトリ追加
- [ ] `npm run test` が既存 109 件 + 0 件 pass で完走（skip 数は出る）
- [ ] `npm run typecheck` が通る

## 報告

300 字以内で：
- 追加したテストファイル一覧
- skip 状態の it 数
- 各シナリオで何を検証しているかの 1 行サマリ
- 追加した factory 関数名
- Phase 2-1〜2-5 完了時にどの順番で skip 解除すべきか
