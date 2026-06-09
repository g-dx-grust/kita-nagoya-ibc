# Phase 2 サブタスク プロンプト集

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 2「在庫台帳の分離」と [`docs/phase_0_outputs/0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-2 のスコープに基づくサブタスク単位プロンプト。

## Phase 2 の核心

既存 `StockMovement` テーブルを **改名せず・分割せず**に、以下を実現する：

1. **独立 `status` 列**（`PLANNED` / `CONFIRMED` / `CANCELLED`）を新設して、予定・確定・キャンセル分離
2. **`(sourceType, sourceId, movementType)` ユニーク制約** で二重登録防止
3. **`movementType` enum 値を拡張**（既存 `opening/planned_reserve/actual_consume/inbound/adjustment/transfer` は維持しつつ、docs/18 語彙 `PLANNED_PRODUCTION_IN` / `PLANNED_MATERIAL_USE` / `ACTUAL_PRODUCTION_IN` / `ACTUAL_MATERIAL_USE` / `INBOUND_CONFIRMED` / `INBOUND_UNCONFIRMED` を追加）
4. **任意日付の理論在庫計算**を製品在庫まで含む共通関数に統一
5. **未確定発注の区分表示**を製品在庫側にも導入

これにより `planned_*` と `actual_*` の混在を解消し、Phase 4 以降の発注書 / 残数翌日振替 / 中央値能力値更新の基盤が揃う。

## 採用した方針（[`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §0 大方針 §3）

- **テーブル分離はしない**。既存 `StockMovement` への拡張のみ。
- **既存 movementType 値は削除しない**。新規値の追加だけ。並存運用。
- **既存 API レスポンスシェイプを壊さない**。`status` フィールド追加は OK、既存フィールドの削除・改名は NG。
- **DB プロバイダは SQLite のまま**。PostgreSQL 切替は Phase 7。

## サブタスク一覧

| # | プロンプト | ツール | 工数 | 直列／並列 |
|---|---|---|---|---|
| 2-T | [integration_tests_first](2_t_integration_tests_first.md) | Claude Code | M | ‖ 2-1 と並列可（テストファースト） |
| 2-1 | [stock_movement_extension](2_1_stock_movement_extension.md) | Codex | L | ▶ 先行（他の全部の前提） |
| 2-2 | [ledger_unification](2_2_ledger_unification.md) | Codex | L | ▶ 2-1 後 |
| 2-4 | [unified_inventory_calc](2_4_unified_inventory_calc.md) | Codex | M | ▶ 2-2 後 ‖ 2-5 と並列 |
| 2-5 | [unconfirmed_separation](2_5_unconfirmed_separation.md) | Codex | M | ▶ 2-2 後 ‖ 2-4 と並列 |
| 2-U | [product_inventory_ui](2_u_product_inventory_ui.md) | Claude Code | M | ▶ 2-4, 2-5 後 |

工数感: S=0, M=4, L=2 → 中〜大規模。Phase 1 より重く 3〜4 週間規模。

## 実行順（依存と並列）

```
┌──────────────────────────────────────────────┐
│ Phase 1 残課題は Phase 2 完了後にまとめて処理 │
└──────────────────────────────────────────────┘
              │
              ▼
       2-T (テスト先行)  [CC]            ←→ 2-1 と並列
              │
              ▼
   2-1 (StockMovement 拡張)  [Cdx]
              │
              ▼
   2-2 (ledger 経由統一)  [Cdx]
              │
   ┌──────────┴──────────┐
   ▼                     ▼
  2-4                   2-5            ‖ 並列
 共通在庫計算        未確定発注区分
   [Cdx]               [Cdx]
   │                     │
   └──────────┬──────────┘
              ▼
   2-U (製品在庫画面) [CC]
```

## 共通の安全策（全プロンプト共通）

- **既存 API レスポンスシェイプを壊さない**。フィールド追加は OK、削除・改名は NG。
- **既存 `movementType` の enum 値（`opening` 等）を削除しない**。新規 UPPER_SNAKE_CASE を追加して並存。
- **既存 41 ユニットテスト + 63 統合テストが全件 pass する**こと。
- **`prisma/dev.db` の既存データを破壊する変更は避ける**。マイグレーションで既存データの `status` カラムを正しくバックフィルすること。
- **`app/src/components/ui/` / `app/src/app/layout.tsx` / `globals.css` / `app-nav.tsx` / `Sidebar.tsx` / `components.json` は触らない**。
- 計算ロジックを追加・変更したらユニットテスト + 統合テストを必ず書く。
- 全 mutation で `audit()` を確実に呼ぶ。

## Codex への投入

```bash
# 例: 2-1 を pack.sh で投入用に整形
./prompts/v2/codex/pack.sh 2_1_stock_movement_extension | pbcopy
```

`pack.sh` は v0.2 でサブタスクディレクトリ横断検索に対応済み。

## 完了条件サマリ（[`docs/18`](../../../docs/18_implementation_phase_plan.md) §Phase 2）

- [ ] 実在庫と予定在庫を別カラムまたは別ステータスで判別できる
- [ ] 出荷予定で将来在庫が減る（製品側にも planned 行が出る）
- [ ] 生産予定で将来在庫が増える（planned_production_in）
- [ ] 在庫不足日が分かる（製品・原料両方）
- [ ] 同一 source からの二重反映が物理的に発生しない（ユニーク制約 or 冪等処理）
- [ ] 任意日付の理論在庫を関数 1 本で取得できる（商品・原料・資材すべて）
- [ ] 未確定発注（`INBOUND_UNCONFIRMED`）が確定在庫から区別表示される

## Phase 3 への引き継ぎ

Phase 2 完了後、Phase 3 「手動生産予定 MVP」は既存実装でほぼ満たされているため、新規実装はほぼ無し。**Phase 4 着手前のチェックポイント**として、`production_plans` 作成時の `PLANNED_PRODUCTION_IN` / `PLANNED_MATERIAL_USE` 発行が正しく動くことを確認する。
