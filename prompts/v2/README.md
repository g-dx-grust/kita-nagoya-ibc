# v2 プロンプト集（docs/18 ベース）

`docs/18_implementation_phase_plan.md` の Phase 0〜9 を、既存 `app/` の現状から差分追加で進めるためのプロンプト集。

## 使い方の前提

- **既存 app/ を壊さない**。既存 UI・既存 API レスポンス・既存テーブル定義は調査結果を待つまで一切変更しない。
- **デザイン保護**：UI コンポーネント（`app/src/components/ui/` 配下）、`app/src/app/layout.tsx`、`globals.css`、Tailwind 設定は調査と仕様確定が終わるまで触らない。
- **Phase 0 は調査のみ**。コード変更ゼロ、出力は `docs/phase_0_outputs/` 配下に Markdown で書き出すだけ。
- **Phase 1 以降のプロンプトは Phase 0 の結果を見てから生成する**（調査結果次第でスコープが変わるため）。

## ツール分担

| 役割 | ツール |
|---|---|
| 既存把握・設計判断・横断レビュー・UI 仕上げ・型エラー修正 | Claude Code |
| Prisma マイグレーション・一括コード生成・サービス層の重い実装 | Codex |

Phase 0 はすべて Claude Code 担当（調査が中心）。

## サブタスク一覧

| # | プロンプト | ツール | 直列／並列 |
|---|---|---|---|
| 0-0 | [orientation](phase_0_subtasks/0_0_orientation.md) | Claude Code | ▶ 起点 |
| 0-1 | [db_schema_audit](phase_0_subtasks/0_1_db_schema_audit.md) | Claude Code | ▶ 0-0 の後 |
| 0-2 | [api_logic_audit](phase_0_subtasks/0_2_api_logic_audit.md) | Claude Code | ▶ 0-0 の後（0-1 と並列可） |
| 0-3 | [boundary_decision](phase_0_subtasks/0_3_boundary_decision.md) | Claude Code | ▶ 0-1, 0-2 完了後 |
| 0-A | [screens_inventory](phase_0_subtasks/0_parallel_a_screens.md) | Claude Code | ‖ 0-1〜0-3 と並列 |
| 0-B | [workflow_diff](phase_0_subtasks/0_parallel_b_workflow.md) | Claude Code | ‖ 並列 |
| 0-C | [test_coverage_diff](phase_0_subtasks/0_parallel_c_tests.md) | Claude Code | ‖ 並列 |

## 完了の判定

Phase 0 完了 = `docs/phase_0_outputs/` 配下に下記7ファイルが揃った状態。

```
docs/phase_0_outputs/
├── 0_0_orientation.md
├── 0_1_db_schema_audit.md
├── 0_2_api_logic_audit.md
├── 0_3_boundary_decision.md
├── 0_a_screens_inventory.md
├── 0_b_workflow_diff.md
└── 0_c_test_coverage_diff.md
```

ここまで揃ったら、次の指示で Phase 1 以降のプロンプトを作る。
