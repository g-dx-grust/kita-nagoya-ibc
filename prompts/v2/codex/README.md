# Codex 投入用パッケージ

[`prompts/v2/phase_1_subtasks/`](../phase_1_subtasks/) のサブタスクを **Codex CLI** で実行するための投入ガイド。

## 投入の構造

```
[Codex セッション開始]
  ↓ 1. prelude を投げる（1セッション1回）
  0_session_prelude.md
  ↓ 2. タスクを投げる（タスクごと）
  prompts/v2/phase_1_subtasks/1_<X>.md
  ↓ 3. Codex が実装 → npm run typecheck && npm run test → 完了報告
```

**タスクファイルは複製せず、`prompts/v2/phase_1_subtasks/` を直接使う**。0-3 判断書や DB ギャップ表との二重メンテを避けるため。

## 使い方

### A. ヘルパースクリプトで投入用テキストを生成

```bash
cd /Users/shojiyuya/Downloads/kitagoya_production_system_handoff_v2

# prelude + タスクを 1 つの貼り付けテキストにまとめる
./prompts/v2/codex/pack.sh 1_1_products_extension > /tmp/codex-1-1.md
cat /tmp/codex-1-1.md | pbcopy   # macOS: クリップボードへ
```

その後、別ターミナルで Codex CLI を `app/` ディレクトリで起動し、ペーストする。

### B. 手動で 2 段階投入

1. Codex セッション開始 → [`0_session_prelude.md`](0_session_prelude.md) の内容を貼り付け
2. 「Prelude を読み終えました」の応答が返ったら、`prompts/v2/phase_1_subtasks/1_<X>.md` の内容を貼り付け

prelude を 1 セッションで複数タスク使い回せるため、A より細かく制御したい場合に向く。

## 起動・実行例

```bash
# ターミナルを別に開く
cd /Users/shojiyuya/Downloads/kitagoya_production_system_handoff_v2/app

# Codex CLI を起動（あなたの環境の起動コマンドに合わせて）
codex
```

Codex のプロンプトで：

```
[ここに 0_session_prelude.md の中身を貼り付け]
```

→ Codex が「Prelude を読み終えました…」と返したら：

```
[ここに prompts/v2/phase_1_subtasks/1_1_products_extension.md の中身を貼り付け]
```

## 推奨実行順

### 並列セッション（別ターミナル 3 つで同時実行可）

依存関係（[`prompts/v2/phase_1_subtasks/README.md`](../phase_1_subtasks/README.md) §推奨実行順）に従う：

| セッション | タスク（順序） |
|---|---|
| A | 1-1 商品マスタ → 1-3 BOM → 1-4 作業場所 → 1-6（Codex 部分）→ 1-V CSV |
| B | 1-2 原料・資材 → 1-5 能力 |
| C | 1-S 仕入先 → 1-7 統合グループ・特殊案件 |

並列の合流ポイント：
- **1-3 BOM**：1-1 と 1-2 の両方が終わってから着手。セッション A はセッション B の完了を待つ。
- **1-6 シフト・休憩**：1-4 の後。
- **1-U / 1-V**：1-1〜1-7 全て終わってから。1-U は Claude Code 側で実施。

### 直列実行（シンプル）

1 セッションで `1-1 → 1-2 → 1-S → 1-3 → 1-4 → 1-5 → 1-7 → 1-6（Codex 部分）→ 1-V` の順。

## 1-T と 1-U と 1-6 後半は Claude Code 担当

- **1-T テスト基盤強化**：本セッション（Claude Code）で実施済み。
- **1-6 シフト・休憩マスタ — Claude Code 担当部分**：[`prompts/v2/phase_1_subtasks/1_6_shift_patterns_breaks.md`](../phase_1_subtasks/1_6_shift_patterns_breaks.md) の §6-§7（`calculations.ts` の定数移行と既存テスト確認）。
- **1-U マスタ画面の拡張カラム表示**：[`prompts/v2/phase_1_subtasks/1_u_masters_ui_extension.md`](../phase_1_subtasks/1_u_masters_ui_extension.md)

これらは Codex には投げない。本セッション（Claude Code）に戻して実施する。

## 完了確認（全タスク共通）

各タスク完了後、Codex が以下を pass させること（プロンプトの「完了条件」に既に含まれている）：

```bash
npm run typecheck
npm run test
```

両方 pass したら、次のタスクへ。

## ファイル一覧

| ファイル | 用途 |
|---|---|
| [`0_session_prelude.md`](0_session_prelude.md) | **セッション開始時に投げる**。ガードレール・参照ファイル・報告フォーマット |
| [`pack.sh`](pack.sh) | prelude + タスクを 1 つにまとめるヘルパー |
| この `README.md` | 投入手順 |

タスクファイル本体は [`prompts/v2/phase_1_subtasks/`](../phase_1_subtasks/) を直接参照する。

## 進捗の同期

Codex の完了報告（`0_session_prelude.md` §7 のフォーマット）を本セッション（Claude Code）に共有してください。それを元に Phase 2 のプロンプトを出します。
