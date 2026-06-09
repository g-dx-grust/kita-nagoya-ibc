# Phase 4 サブタスク プロンプト集

[`docs/18 §Phase 4`](../../../docs/18_implementation_phase_plan.md)「原料・資材の発注アラート + 発注書自動生成」の実装。**「人は発注書を確認して送るだけ」状態** にする Phase 4 の本丸。

## Phase 4 の核心

1. **緊急度判定**（CRITICAL / WARNING / INFO）を発注候補に付ける
2. **発注承認エンドポイント**（`/confirm`, `/receive`）を新設し、StockMovement.status と連動
3. **発注書 Excel / PDF 自動生成**（標準テンプレ 1 種、Excel 主・PDF サブ）
4. **仮発注（draft 状態）**でも発注書を出力可能にする
5. **発注書作成画面**で人が確認 → 出力するだけの UI

## 確定仕様（着手前ヒアリング済み）

| 項目 | 仕様 |
|---|---|
| 出力形式 | Excel 主（既存 xlsx ライブラリ）+ PDF サブ（pdf-lib 追加） |
| テンプレ多様性 | 標準テンプレ 1 種のみ。仕入先名・品目・数量・単価を差し込む |
| 緊急度閾値 | `required_order_date` が **今日 ± 1日 → CRITICAL**、**2-7日 → WARNING**、**8日以上 → INFO** |
| 追加スコープ | **仮発注**（status=draft）でも発注書出力可。本発注前に仕入先と調整できる |
| **対象外** | メール送信機能、出力履歴、一括発注書出力（同一仕入先複数 PO 統合）は Phase 4 では実装しない |

## サブタスク一覧

| # | プロンプト | ツール | 工数 | 直列／並列 |
|---|---|---|---|---|
| 4-T | [integration_tests_first](4_t_integration_tests_first.md) | Claude Code | M | ‖ 4-1 と並列可（テストファースト） |
| 4-1 | [purchase_order_urgency](4_1_purchase_order_urgency.md) | Codex | M | ▶ 先行 |
| 4-2 | [approval_endpoints](4_2_approval_endpoints.md) | Codex | M | ▶ 4-1 後 |
| 4-3 | [document_generation](4_3_document_generation.md) | Codex | L | ▶ 4-1 後 ‖ 4-2 と並列可 |
| 4-U | [purchase_order_document_ui](4_u_purchase_order_document_ui.md) | Claude Code | M | ▶ 4-2, 4-3 後 |

工数感: S=0, M=4, L=1 → Phase 2 より軽い。1〜2 週間規模。

## 実行順（依存と並列）

```
4-T (テスト先行)  [CC]  ←→  4-1 (urgency 列)  [Cdx]
                              │
                              ▼
              ┌───────────────┴───────────────┐
              ▼                               ▼
        4-2 承認 API  [Cdx]            4-3 発注書生成 [Cdx]   ‖ 並列
              │                               │
              └───────────────┬───────────────┘
                              ▼
                  4-U 発注書画面 [CC]
```

## 共通の安全策（全プロンプト）

- 既存 API レスポンスシェイプを壊さない（`PurchaseOrder` の既存フィールド維持）
- 既存 `PurchaseOrder.status` enum 値（candidate / draft / ordered_unconfirmed / confirmed / received / cancelled）を **削除・改名しない**。新規 status 値の追加もしない（Phase 4 はこれで足りる）
- Phase 2-2 で実装した **StockMovement.status と PurchaseOrder.status の連動を壊さない**
- 既存 109〜124 件のユニット + 統合テストは全件 pass 維持
- `app/src/components/ui/`, `globals.css`, `layout.tsx`, `app-nav.tsx`, `Sidebar.tsx`, `components.json` は触らない
- 新規 npm パッケージは `pdf-lib`（PDF 生成）のみ追加可。それ以外の追加は **要相談**

## 完了条件サマリ（[`docs/18 §6`](../../../docs/18_implementation_phase_plan.md)）

- [ ] 採用済み生産予定から原料/資材の予定使用量が出る（Phase 2 で対応済み）
- [ ] 在庫切れ日と「いつ発注すべきか」が表示される（既存 + 4-1 で緊急度 visual 化）
- [ ] 発注期限を過ぎている場合は CRITICAL アラートが出る（4-1）
- [ ] 発注済み未入荷は確定在庫と区別される（Phase 2-5 で対応済み）
- [ ] **承認された発注候補から発注書 Excel / PDF が自動生成され、人は確認して送付するだけ**（4-3, 4-U）
- [ ] **仮発注（draft）でも発注書出力できる**（4-3, 4-U）
- [ ] 発注承認の監査ログが残る（4-2）

## Codex 投入

```bash
./prompts/v2/codex/pack.sh 4_t_integration_tests_first | pbcopy
./prompts/v2/codex/pack.sh 4_1_purchase_order_urgency | pbcopy
./prompts/v2/codex/pack.sh 4_2_approval_endpoints | pbcopy
./prompts/v2/codex/pack.sh 4_3_document_generation | pbcopy
./prompts/v2/codex/pack.sh 4_u_purchase_order_document_ui | pbcopy
```

## Phase 5 への引き継ぎ

Phase 4 完了後、Phase 5 「日報・実績反映」は Phase 4 で整った発注確定・受領フローを前提に、`daily_reports` の承認フローと能力値中央値更新を実装する。Phase 4 の `audit("confirm_purchase_order")` パターンが Phase 5 の `audit("approve_daily_report")` のお手本になる。
