# テスト戦略

## 2 種類のテスト

| 種別 | 場所 | 設定ファイル | 実行コマンド | DB | 用途 |
|---|---|---|---|---|---|
| **ユニット**（純関数） | `src/**/*.test.ts` | `vitest.config.ts` | `npm run test:unit` | なし | 計算式・パーサ・純粋関数 |
| **統合**（DB 絡み） | `test/integration/**/*.test.ts` | `vitest.integration.config.ts` | `npm run test:integration` | `prisma/test.db`（自動再作成） | CRUD・状態遷移・監査ログ・パイプライン |

両方走らせるなら `npm run test`。

## DB 戦略

- 本番 schema は Supabase/PostgreSQL。統合テストでは `scripts/run-integration-tests.ts` が一時 SQLite schema を `tmp/schema.integration.sqlite.prisma` に生成し、Prisma Client もテスト中だけ SQLite 用に切り替える。
- 統合テスト用 SQLite は `prisma/test.db`。`prisma/dev.db` は絶対に触らない。
- `vitest.integration.config.ts` の `globalSetup` でスイート開始前に `test.db` を削除 → 一時 schema から DB を再構築。
- 各テストファイルで `beforeEach(() => cleanupAll(prisma))` を呼んでテーブルを空にしてから始める。
- `pool: "forks"` + `singleFork: true` で SQLite の write contention を避ける（並列実行で書き込み衝突が出るため）。

## テストの書き方（テンプレ）

```ts
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { getTestPrisma, disconnectTestPrisma } from "../helpers/prisma";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestWorkArea } from "../helpers/factories";

describe("対象機能名 (integration)", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => { await cleanupAll(prisma); });
  beforeEach(async () => { await cleanupAll(prisma); });
  afterAll(async () => { await cleanupAll(prisma); await disconnectTestPrisma(); });

  it("やりたい挙動を1行で", async () => {
    const wa = await createTestWorkArea(prisma);
    const p  = await createTestProduct(prisma, { defaultWorkAreaId: wa.id });
    // ... assertions
  });
});
```

## ヘルパー

- [`helpers/prisma.ts`](helpers/prisma.ts) — `getTestPrisma()`, `disconnectTestPrisma()`
- [`helpers/cleanup.ts`](helpers/cleanup.ts) — `cleanupAll(prisma)`, `cleanupTables(prisma, ...models)`
- [`helpers/factories.ts`](helpers/factories.ts) — `createTestSupplier`, `createTestWorkArea`, `createTestProduct`, `createTestMaterial`, `createTestPackagingMaterial`, `createTestEmployee`, `createTestUser`

新しいテーブルを Phase 1-N で追加したら、factories と CLEANUP_ORDER に対応するエントリを追記すること。

## Phase 1-N で真似してほしいパターン

サンプル：[`integration/products.crud.test.ts`](integration/products.crud.test.ts)

- 1 テーブルにつき：作成・取得・更新・ソフトデリート・ユニーク制約・カスケードの最低 5 ケース
- 監査ログ系：`audit_log` テーブルに 1 行追加されるアサート
- 状態遷移系：before/after の status と関連レコードへの副作用を両方検証
- バリデーション系：Zod / DB ユニーク違反を `await expect(...).rejects.toThrow()` で確認

## Phase 4 以降の E2E

[`docs/phase_0_outputs/0_c_test_coverage_diff.md`](../../docs/phase_0_outputs/0_c_test_coverage_diff.md) §4 E1〜E10 がパイプライン全長テストの一覧。各 Phase 着手時に対応する E ケースを `integration/pipelines/` 配下に追加する想定。
