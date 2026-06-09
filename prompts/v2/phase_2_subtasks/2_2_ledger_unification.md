# Phase 2-2: 既存在庫増減を全て ledger 経由に統一

## 使用ツール

Codex

## 位置づけ

2-1 完了後に着手。2-4 / 2-5 の前提。**最も回帰リスクが大きいサブタスク**。

## 目的

[`docs/18 §2-2`](../../../docs/18_implementation_phase_plan.md) と [`0_3_boundary_decision.md §1-2`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) に基づき：

1. 既存「StockMovement を直接更新する」処理を全て **書き換え or 互換ラッパー越し** にして `status` 列を必ず明示する
2. **生産予定の作成・更新時に `PLANNED_PRODUCTION_IN` / `PLANNED_MATERIAL_USE` を `StockMovement` に発行**（現状は `ProductionPlanRequirement` テーブルだけに保存している）
3. **日報承認時の `ACTUAL_PRODUCTION_IN` / `ACTUAL_MATERIAL_USE` 発行** を新 movementType 名 + 明示 `status: 'CONFIRMED'` に切り替え
4. **`PurchaseOrder` の status 変更時** に対応する `INBOUND_UNCONFIRMED` / `INBOUND_CONFIRMED` 行を発行・更新

## 互換性ルール

- 既存 `daily-reports/[id]/confirm` API のレスポンスシェイプを **壊さない**
- 既存 `inventory/adjustments` API の入力（status 未指定）も **壊さない**（status 未指定なら `CONFIRMED`）
- 既存の `ProductionPlanRequirement` テーブルは **残置**（集計用ビュー的に維持。重複保持を許容）
- 旧形式 `movementType = 'actual_consume'` 等を発行する古い code path が残っていても **既存テストが pass する限り問題なし**

## 前提

- 2-1 完了済み（status カラム + ユニーク制約 + MOVEMENT_TYPE 定数）
- [`0_2_api_logic_audit.md §3 Phase 3-4`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md) の現状把握を理解
- 2-T で skip 状態のテスト（pipeline E1, E3）を 2-2 完了時に skip 解除する

## 読むファイル

- `app/src/lib/plan-engine.ts:recalculateProductionPlan`
- `app/src/lib/inventory.ts:getInventoryFor`
- `app/src/app/api/production-plans/route.ts`
- `app/src/app/api/production-plans/[id]/route.ts`
- `app/src/app/api/daily-reports/[id]/confirm/route.ts`
- `app/src/app/api/purchase-orders/[id]/route.ts`
- `app/src/app/api/inventory/adjustments/route.ts`
- `app/src/lib/material-forecast.ts:refreshCumulativeMaterialRequirements`

## やってほしいこと

### 1. ProductionPlan 作成・更新時に PLANNED 行を発行

`plan-engine.ts:recalculateProductionPlan` を拡張：

```ts
// 1. 既存：ProductionPlanRequirement の再作成（互換維持）
// 2. 新規：StockMovement に PLANNED 行を発行
//    - PLANNED_PRODUCTION_IN (製品の planned 増加, quantity = +plannedQuantity)
//    - PLANNED_MATERIAL_USE (原料・資材の planned 減少, quantity = -BOM展開量, itemType ごとに)
//    - sourceType = 'production_plan', sourceId = plan.id
//    - status = 'PLANNED'
//    - movementDate = plan.date
// 3. 同じ source からの既存 PLANNED 行は upsert（更新で対応：削除 + 再作成 or status=CANCELLED にして新規）
```

**重要**：`ProductionPlan` を更新（PUT）したときに古い PLANNED 行をどうするか。**推奨**：`deleteMany({ sourceType: 'production_plan', sourceId: plan.id, status: 'PLANNED' })` してから再作成（冪等な再生成）。`CANCELLED` を残す案もあるが履歴が肥大化するため delete を選ぶ。

### 2. ProductionPlan 確定（confirm）・キャンセル

- `confirm`：PLANNED 行はそのまま（消費はまだ起きていない）。`PurchaseOrder` でいう「予定として正式に枠を取った」状態。
- `cancel`：対応する PLANNED 行を `status = 'CANCELLED'` に更新（履歴保全のため delete ではない）。

### 3. 日報承認時の発行を新形式に

`daily-reports/[id]/confirm/route.ts`:

```ts
// 旧:
//   movementType: 'actual_consume', sourceType: 'daily_report', sourceId: report.id
//   movementType: 'inbound', ...
// 新:
//   movementType: MOVEMENT_TYPE.ACTUAL_MATERIAL_USE, status: 'CONFIRMED'
//   movementType: MOVEMENT_TYPE.ACTUAL_PRODUCTION_IN, status: 'CONFIRMED'
//   sourceType: 'daily_report', sourceId: report.id
//   movementDate: report.workDate
```

**重要**：ユニーク制約 `(sourceType, sourceId, movementType)` のため、再 confirm 時の冪等性を `deleteMany` で確保（既存実装にも `deleteMany` あり、それを継承）。

### 4. PurchaseOrder status と StockMovement の連動

`purchase-orders/[id]/route.ts`:

```ts
// PurchaseOrder の状態遷移と StockMovement の対応:
//   candidate → 何も発行しない
//   draft     → 何も発行しない
//   ordered_unconfirmed → StockMovement (movementType=INBOUND_UNCONFIRMED, status=PLANNED, quantity=+orderedQty)
//   confirmed → 該当行を movementType=INBOUND_CONFIRMED, status=PLANNED に更新
//   received  → 該当行を status=CONFIRMED に更新（実在庫に反映）
//   cancelled → 該当行を status=CANCELLED に更新

// sourceType='purchase_order', sourceId=po.id
```

### 5. 既存呼び出し側の互換ラッパー

`refreshCumulativeMaterialRequirements` が StockMovement を読む箇所は、新 movementType と status を考慮する：

- 既存 `materialForecast` で「planned 行」と判定していたロジックを `status = 'PLANNED'` で判定するように寄せる
- 「actual 行」は `status = 'CONFIRMED' AND movementType startsWith 'ACTUAL_'`
- 旧形式（`movementType = 'planned_reserve'` 等）は既存データのバックフィルで `status = 'PLANNED'` 化されているので、status 判定で網羅可能

### 6. 監査ログ

- ProductionPlan create/update → 既存 `audit("create")` / `audit("update")` 維持
- 追加でPLANNED 行発行は audit 不要（plan の副作用扱い）
- DailyReport confirm → 既存 `audit("confirm")` 維持

### 7. テストの skip 解除（2-T 連携）

- `test/integration/pipeline_E1.test.ts` の skip を解除（ProductionPlan 作成→PLANNED 発行→shortage 検出）
- `test/integration/pipeline_E3.test.ts` の skip を解除（日報承認→ACTUAL 発行）
- `test/integration/inventory_ledger_status.test.ts` の主要ケース skip 解除
- `test/integration/inventory_ledger_idempotency.test.ts` の残ケース skip 解除

skip 解除した時点で当該テストが pass するように実装する。

### 8. 既存テストの維持

- 既存 109 + 2-1 で skip 解除した分を **全件 pass** 維持
- 特に `material-forecast.test.ts` と `pipeline_E1` で `ProductionPlanRequirement` を読む箇所が壊れないことを確認

## 絶対遵守

- 既存 API レスポンスシェイプを壊さない（特に `daily-reports/[id]/confirm`, `production-plans/[id]/recalculate`, `inventory/adjustments`）
- 既存 `ProductionPlanRequirement` テーブルを残置（**削除しない**）
- 旧 movementType 値（`actual_consume` 等）の DB 上の既存行を改変しない（マイグレーション時のバックフィル以外）
- `app/src/components/ui/`, `globals.css`, `layout.tsx` は触らない

## 完了条件

- [ ] ProductionPlan 作成/更新で PLANNED 行が StockMovement に発行される（test pass）
- [ ] ProductionPlan cancel で対応 PLANNED 行が CANCELLED になる（test pass）
- [ ] DailyReport confirm で ACTUAL_* + status=CONFIRMED が発行される（test pass）
- [ ] PurchaseOrder status 変更で対応 movement の status が連動（test pass）
- [ ] 再 confirm が冪等（test pass）
- [ ] 既存 109 + 2-T 解除分 全件 pass
- [ ] `npm run typecheck` clean

## 報告

400 字以内で：
- 主要編集ファイル一覧（recalc / confirm / purchase-order）
- 新規発行する movementType の一覧（実装が触る種類）
- skip 解除したテスト件数
- 既存テストへの影響（あれば1行）
- 2-4 / 2-5 への引き継ぎメモ（material-forecast.ts の改修が必要かどうか等）
