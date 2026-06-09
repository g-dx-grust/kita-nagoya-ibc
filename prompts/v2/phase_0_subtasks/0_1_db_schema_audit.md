# Phase 0-1: 既存DBスキーマ調査

## 使用ツール

Claude Code

## 目的

既存 `app/prisma/schema.prisma` に何があり、`docs/18_implementation_phase_plan.md` の Phase 1〜9 で要求されるテーブル／カラムと比べて **何が揃っていて何が足りないか** を表にする。Phase 1（マスタ拡張）のスコープを決めるための基礎資料。

## 前提

- `prisma/schema.prisma` は**現状の正**として読む（書き換えない）。
- マイグレーション草案は出さない。**ギャップの可視化まで**。
- 出力先：`docs/phase_0_outputs/0_1_db_schema_audit.md`

## 読むファイル

- `app/prisma/schema.prisma`
- `app/prisma/migrations/` 配下（履歴把握のため一覧だけでよい）
- `docs/10_data_model.md`
- `docs/18_implementation_phase_plan.md`（特に §Phase 1〜9 のテーブル定義部分）
- `docs/13_business_rules.md`（外部キー制約・状態遷移ルール把握）

## やってほしいこと

1. 既存テーブル一覧を出す（テーブル名、主キー、主な外部キー、レコード概数の見当）。
2. docs/18 で**新規追加が必要なテーブル**を列挙：
   - Phase 1: products 拡張・materials・packaging・product_boms・work_centers・production_capacities・shift_patterns・shift_breaks・employee_shifts・product_equivalence_groups・special_demand_events
   - Phase 2: inventory_ledger
   - Phase 4: material_requirements・material_shortage_alerts・purchase_order_candidates
   - Phase 5: daily_reports・daily_report_lines・capacity_observations
   - Phase 7: external_import_runs・external_order_staging
   - Phase 8: monthly_production_plans・monthly_forecast_sources・production_plan_runs・production_schedule_candidates・production_schedule_warnings
   - Phase 9: （アラート用）alerts、（推奨理由用）calculation_reasons
   - 横断: calculation_locks
3. 各テーブルについて「**既存にある／部分的にある／無い**」を判定し、**部分的にある**場合は不足カラムを列挙。
4. 既存テーブルで `planned_*` と `actual_*` の分離が崩れていないか確認（CLAUDE.md 要件）。
5. 既存に `active`, `valid_from`, `valid_to` がないマスタテーブルを列挙。
6. **破壊的変更が必要そうな箇所**を別表で抽出（カラム削除・型変更・PK変更）。これらは Phase 0-3 で扱う方針。

## 出力フォーマット

`docs/phase_0_outputs/0_1_db_schema_audit.md`

```markdown
# Phase 0-1 既存DBスキーマ調査結果

## 1. 既存テーブル一覧
| テーブル | 用途 | 主キー | 主な外部キー | docs/18 上の位置づけ |

## 2. ギャップ表
| docs/18 のテーブル | 既存 | 状態 (有/部分/無) | 不足カラム | Phase |

## 3. planned/actual 分離の現状
- ...

## 4. active/valid_from/valid_to が無いマスタ
- ...

## 5. 破壊的変更が必要そうな箇所（Phase 0-3 で再判断）
| テーブル | 変更内容 | 影響範囲メモ |

## 6. 判断保留事項
- ...
```

## 完了条件

- ファイルが書き出されている。
- 既存テーブルが網羅されている（`schema.prisma` の `model` 数と一致）。
- docs/18 §Phase 1〜9 のテーブル定義がすべてギャップ表に出ている。
- 既存コードは1行も変更されていない。

## 絶対にやらないこと

- `schema.prisma` の編集。
- マイグレーション作成（`prisma migrate dev` 等）。
- DB への接続・書き込み。
- 既存 API の変更。
- 「ここを直しましょう」という具体的な書き換え提案（**ギャップの提示まで**。判断は 0-3）。
