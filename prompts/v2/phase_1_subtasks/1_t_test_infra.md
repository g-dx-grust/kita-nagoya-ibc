# Phase 1-T: テスト基盤強化（Prisma + vitest DB 統合）

## 使用ツール

Claude Code

## 位置づけ

Phase 1 の **先行タスク**。これがないと Phase 4 以降の状態遷移テスト（[0-C §4 E1〜E10](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md)）が書けない。

## 目的

既存の vitest 純関数テストに加えて、**Prisma を絡めた DB 統合テストを書ける基盤**を整える。Phase 1 で追加する `valid_from/valid_to` の境界テスト、Phase 2 以降の `inventory_ledger` 状態遷移テスト、Phase 5 の日報承認フローテスト等が書けるようにする。

## 前提

- 既存テストは 9 ファイル / 41 ケース、すべて純関数（[0-C §1](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md)）。
- `vitest.config.ts` は `environment: "node"`、Prisma 不使用。
- `prisma/dev.db` は開発用 SQLite。テストには絶対に使わない（破壊されるため）。
- DB プロバイダ切替は Phase 7 まで SQLite 維持（[0-3 §0 大方針 §10](../../../docs/phase_0_outputs/0_3_boundary_decision.md)）。

## 読むファイル

- `app/vitest.config.ts`
- `app/package.json`
- `app/prisma/schema.prisma`
- `app/prisma/seed.ts`（reset 戦略の確認）
- `app/src/lib/prisma.ts`
- 既存 `*.test.ts` のうち最低 2 本（`calculations.test.ts`, `material-forecast.test.ts`）

## やってほしいこと

1. **テスト用 DB の戦略を決定**：
   - 推奨：別ファイル `prisma/test.db` を使い、`DATABASE_URL=file:./test.db` を vitest 実行時のみ上書き
   - vitest の `setupFiles` で `prisma migrate deploy` + 最小 seed を流す
   - 各 `describe` の `beforeAll`/`afterAll` でトランザクションリセット
2. **`vitest.config.ts` を拡張**：
   - `test/integration/` 配下を `include` に追加（純関数テストとは別ディレクトリ）
   - 純関数テストは `src/**/*.test.ts` のまま
   - `setupFiles: ['./test/setup-db.ts']` を追加（統合テスト用）
3. **テストヘルパー作成**：
   - `test/setup-db.ts`：Prisma クライアント取得＋migrate＋seed
   - `test/helpers/factories.ts`：テスト用ファクトリ関数（`createTestProduct`, `createTestMaterial`, ...）
   - `test/helpers/cleanup.ts`：DB クリーンアップユーティリティ
4. **サンプル統合テストを 1 本書く**：
   - `test/integration/products.crud.test.ts`：Product の create → read → update → soft delete を検証
   - これで Phase 1 着手時に他のテストが真似できるテンプレになる
5. **`package.json` のスクリプト追加**：
   - `test:unit`（既存の `vitest run` を踏襲）
   - `test:integration`（統合テスト専用）
   - `test`（両方）
6. **CI/手動実行の動作確認**：`npm run test:integration` が通ることを確認

## 出力

- `app/vitest.config.ts`（拡張）
- `app/test/setup-db.ts`（新規）
- `app/test/helpers/factories.ts`（新規）
- `app/test/helpers/cleanup.ts`（新規）
- `app/test/integration/products.crud.test.ts`（新規）
- `app/package.json`（スクリプト追加）
- `app/.gitignore`（`test.db`, `test.db-journal` を追加。すでに `dev.db` があれば隣に書く）
- `app/README.md` または `app/test/README.md`：テスト戦略の説明（純関数 vs 統合の使い分け、新規テストを書く時のテンプレ）

## 絶対遵守

- 既存純関数テストの実行可否を**壊さない**（`npm run test` がそのまま通ること）。
- `prisma/dev.db` には**絶対に書き込まない**（テストが開発 DB を壊さないこと）。
- `prisma/schema.prisma` は**編集しない**（Phase 1-1 以降で扱う）。
- 既存 API ルートは**触らない**。
- 既存 `*.test.ts` 9 本も**触らない**。
- shadcn コンポーネント・layout.tsx・globals.css は触らない。

## 完了条件

- [ ] `npm run test:unit` が既存 41 ケース通る
- [ ] `npm run test:integration` が新規サンプルテスト（products.crud.test.ts）を通す
- [ ] `npm run test` で両方走る
- [ ] `test.db` が `.gitignore` に入っている
- [ ] テストヘルパー（factories, cleanup）が docs/README で文書化されている
- [ ] サンプルテストが「他のサブタスクで真似できるテンプレ」として機能する

## 報告

完了したら 300 字以内で報告：
- 追加したファイル一覧
- 採用したテスト戦略（DB 戦略・isolation 戦略）の1行サマリ
- `npm run test:integration` の実行結果（成功件数）
- Phase 1-1 以降のサブタスクで真似してほしい統合テストパターン1つ
