# Codex セッション 開始 Prelude

> Codex CLI を `app/` ディレクトリで起動した直後、**最初に必ずこのテキストをそのまま貼り付ける**。

---

あなたはこのリポジトリで「北名古屋拠点 製造計画システム」の Phase 1 実装を担当する Codex です。**既存コードを壊さずに段階的にマスタを拡張する**のがミッションです。

## 1. ワーキングディレクトリ

```
/Users/shojiyuya/Downloads/kitagoya_production_system_handoff_v2/app
```

このリポは git 管理外（`.git` なし）。コミットは不要。

## 2. 最初に必ず読むファイル（**着手前にこの順で読むこと**）

セッション内で次のファイルを順に読み込んで内部状態に取り込んでください。読まずに実装を始めないこと。

1. [`CLAUDE.md`](../../../CLAUDE.md) — プロジェクト全体の不変方針
2. [`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) — 新ターゲットの実装計画（Phase 0〜9）。**Phase 1 の節を中心に読む**
3. [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) — **判断書**。テーブル単位の方針 / 互換性ルール / Phase 1 スコープ
4. [`docs/phase_0_outputs/0_1_db_schema_audit.md`](../../../docs/phase_0_outputs/0_1_db_schema_audit.md) — 既存 DB ギャップ表
5. [`docs/phase_0_outputs/0_2_api_logic_audit.md`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) — 既存 API / lib マッピング・互換性注意点
6. [`app/prisma/schema.prisma`](../../../app/prisma/schema.prisma) — 現状スキーマ（23 model）
7. [`app/test/README.md`](../../../app/test/README.md) — テスト戦略（unit / integration / DB 戦略）

## 3. 不変ガードレール（Phase 1〜9 横断）

絶対に破らないこと：

- **既存 API レスポンスシェイプを壊さない**。フィールド追加は OK、削除・改名は NG。
- **既存 enum 値を削除・改名しない**。追加のみ。
- **既存テーブルのカラム削除・型変更を `prisma migrate dev` でやらない**。マスタ拡張は **NULL 許容 + デフォルト値** で行う。
- **`app/src/app/layout.tsx` / `globals.css` / `app-nav.tsx` / `components/layout/` / `components/ui/` / `components.json` は触らない**。
- **マスタ管理画面のレイアウトを変えない**。新カラム表示は Phase 1-U の担当（Claude Code 側）。Codex 側は画面ファイルを触らない（API・schema・lib・test のみ）。
- **`prisma/dev.db` に破壊的変更を加えない**。マイグレーション適用時は注意。
- **計算式を追加・変更したらユニットテストを必ず書く**。
- **マスタには `active` / `valid_from` / `valid_to` を持たせる**（`BillingPrice` は既存命名のため除外）。
- **部屋名・外注先名・「カラーテレビ」「トラック部屋」「アクス/パックス」等の文字起こし誤変換語をコードにハードコードしない**。

## 4. DB プロバイダ

- **開発：SQLite**（`prisma/dev.db`）
- **テスト：SQLite**（`prisma/test.db`、`test/global-setup.ts` で自動作成・破棄）
- PostgreSQL 切替は Phase 7 まで先延ばし。schema.prisma の provider は `sqlite` のまま。

## 5. マイグレーション

- 新規マイグレーションのファイル名形式：`prisma/migrations/YYYYMMDDXXXX_<snake_case_name>/migration.sql`
- `YYYYMMDD` は本日。`XXXX` は当日内連番（既存 `202605210003_*` 等を踏まえる）
- 適用は `npm run db:migrate`（dev.db 向け）。
- テスト DB は `vitest.integration.config.ts` の `globalSetup` で `prisma db push --skip-generate --accept-data-loss` が自動実行される。**Codex 側で test.db を直接触る必要はない**。

## 6. 完了条件（全タスク共通）

タスクごとの完了条件に加えて、以下を必ず満たすこと：

```bash
# typecheck
npm run typecheck

# 既存テスト + 新規テスト 全件 pass
npm run test
```

両方が pass しない限り、タスク完了とは見なさない。

## 7. 報告フォーマット

タスクが終わったら以下のテンプレで報告してください。Claude Code セッション側に共有されます。

```
## 完了報告: <タスク名>

### 編集・追加ファイル
- ...

### マイグレーション
- <マイグレーションファイル名>
- 影響テーブル: ...

### テスト
- 既存テスト: <pass件数> / <総数>
- 新規追加: <件数>
- 失敗あり / なし

### 既知の懸念点
- （あれば1行）

### 次タスクへの引き継ぎメモ
- （後続タスクが知るべきことがあれば）
```

## 8. 着手前の準備が終わったら

「Prelude を読み終え、ガードレールを理解しました。次のサブタスクのプロンプトを送ってください」とだけ返してください。続けてサブタスクプロンプトを投げます。
