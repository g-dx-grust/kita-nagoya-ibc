# Phase 1 サブタスク プロンプト集

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) Phase 1 と [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §4 のスコープに基づくサブタスク単位プロンプト。

## 着手前チェック

### 人間判断が必要（§7-1）

実装着手前に **業務責任者と確定**してから Codex/Claude Code に投げる：

1. アクター 5 区分のうち「管理者」「人」がどれを指すか
2. 承認フローの粒度（1段／多段）
3. 「請求」と聞こえるチラシ系案件の正式名称
4. 作業場所・部屋・ラインの正式名称一覧
5. 作業場所マスタの追加・改廃の権限者

未確定でも 1-T / 1-1〜1-5 / 1-S / 1-V は進められる。1-7（特殊案件マスタの初期データ）と 1-U（メニュー追加）は確定後にしないと中途半端になる。

### ツール分担（0-3 §0 大方針）

| 役割 | ツール |
|---|---|
| Prisma マイグレーション・モデル追加・サービス層実装・Zod 拡張 | Codex |
| テスト基盤構築・UI 拡張カラム表示・型エラー修正・動作確認 | Claude Code |

## サブタスク一覧

| # | プロンプト | ツール | 工数 | 直列／並列 |
|---|---|---|---|---|
| 1-T | [test_infra](1_t_test_infra.md) | Claude Code | M | ▶ 先行（他全部の前提） |
| 1-1 | [products_extension](1_1_products_extension.md) | Codex | M | ▶ 1-T 後 ‖ 1-2, 1-S と並列 |
| 1-2 | [materials_packaging_extension](1_2_materials_packaging_extension.md) | Codex | S | ▶ 1-T 後 ‖ 1-1, 1-S と並列 |
| 1-S | [suppliers_extension](1_s_suppliers_extension.md) | Codex | S | ▶ 1-T 後 ‖ 1-1, 1-2 と並列 |
| 1-3 | [bom_validity_period](1_3_bom_validity_period.md) | Codex | S | ▶ 1-1, 1-2 後 |
| 1-4 | [work_areas_extension](1_4_work_areas_extension.md) | Codex | M | ▶ 1-3 後 ‖ 1-5, 1-7 と並列 |
| 1-5 | [capacities_extension](1_5_capacities_extension.md) | Codex | M | ▶ 1-3 後 ‖ 1-4, 1-7 と並列 |
| 1-7 | [equivalence_special_events](1_7_equivalence_special_events.md) | Codex | S | ▶ 1-3 後 ‖ 1-4, 1-5 と並列 |
| 1-6 | [shift_patterns_breaks](1_6_shift_patterns_breaks.md) | Codex + Claude Code | M | ▶ 1-4 後 |
| 1-U | [masters_ui_extension](1_u_masters_ui_extension.md) | Claude Code | M | ▶ 1-1〜1-7 後 ‖ 1-V と並列 |
| 1-V | [csv_import_extension](1_v_csv_import_extension.md) | Codex | S | ▶ 1-1〜1-7 後 ‖ 1-U と並列 |

## 完了の判定

Phase 1 完了 = [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §4-3「Phase 1 の完了条件」のチェックリストが全て満たされた状態。

各プロンプトに「完了条件」と「絶対遵守」が埋め込まれている。Codex/Claude Code が完了報告で達成度を返す。

## 共通の安全策（全プロンプトで強制）

- 既存 API レスポンスシェイプを壊さない（[`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §3）
- 既存 enum 値を削除しない・型を変えない（追加は OK）
- 既存 `globals.css` / `components/ui/` / `layout.tsx` / `Sidebar.tsx` は触らない（§5-1）
- 新規マイグレーションのファイル名は `YYYYMMDDXXXX_<snake_case_name>.sql` 形式（既存に倣う）
- 全 model に `active`, `valid_from`, `valid_to` を入れる（BillingPrice は除く）
- カラム追加は NULL 許容 + デフォルト値、既存データが影響を受けないこと
- 計算ロジックを追加する場合はユニットテストも同時に作る
