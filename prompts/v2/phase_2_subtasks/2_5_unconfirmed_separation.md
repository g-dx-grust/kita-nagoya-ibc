# Phase 2-5: 未確定発注の区分表示（製品在庫側にも導入）

## 使用ツール

Codex

## 位置づけ

2-2 完了後、2-4 と並列実行可。2-4 が `getInventoryFor` を製品まで拡張したのを受けて、未確定／確定の区分を製品在庫表示・予測ロジック・アラート判定に反映する。

## 目的

[`docs/18 §2-5`](../../../docs/18_implementation_phase_plan.md) と [`0_3_boundary_decision.md §1-2`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) に基づき：

- 未確定発注 (`INBOUND_UNCONFIRMED`, status=PLANNED) が **製品在庫推移** に "未確定" として加算され、**確定在庫**には混入しないこと
- アラート判定が「確定だけだと不足だが未確定込みなら足りる」を **unconfirmed_dependency** として検出すること（原料・資材は既存。**製品にも**）
- API レスポンスで confirmedInbound と unconfirmedInbound を別フィールドで返す（既存挙動踏襲）

## 前提

- 2-1 完了：`status` 列追加済み
- 2-2 完了：`PurchaseOrder.status` と `StockMovement.status` が連動
- 2-4 完了：`getInventoryFor` が製品も含めて統一インターフェイスで動く
- 2-4 と並列実行する場合は、`getInventoryFor` の `confirmedInbound` / `unconfirmedInbound` フィールドが 2-4 のシグネチャで保証されている前提

## 読むファイル

- `app/src/lib/material-forecast.ts:buildMaterialForecast`（`shortageType=hard_shortage / unconfirmed_dependency / none` の既存判定）
- `app/src/lib/inventory.ts`（2-4 で拡張された後）
- `app/src/app/api/inventory/route.ts`
- `app/src/lib/product-planning.ts:computeProductPlanningSuggestions`
- `app/src/lib/product-planning-service.ts:loadProductPlanningSuggestions`

## やってほしいこと

### 1. 製品在庫推移にも未確定加算を適用

`product-planning-service.ts` で製品在庫の予測を作る際に、`getInventoryFor("product", ...).unconfirmedInbound` を計算に含める：

- 既存の「製品の planned/confirmed/total stock」計算ロジックを、3 段階で表示：
  - `confirmedStock`：今ある製品＋確定済み実績流入
  - `confirmedPlusPlanned`：上 + planned_production_in（生産予定）
  - `withUnconfirmed`：上 + 未確定の入荷予定（製品では通常 0 だが、外部委託品の受領 unconfirmed 等の可能性）

### 2. 製品在庫の shortage 判定に unconfirmed_dependency を導入

`product-planning.ts:computeProductPlanningSuggestions` を拡張：

```ts
export type ProductShortageType = "none" | "hard_shortage" | "unconfirmed_dependency";

// 不足判定:
// - confirmedStock + confirmedPlannedProduction >= demand → none
// - confirmedStock + confirmedPlannedProduction < demand
//     かつ confirmedStock + confirmedPlannedProduction + unconfirmedInbound >= demand → unconfirmed_dependency
// - それ未満 → hard_shortage
```

純関数テスト `product-planning.test.ts` に新ケース追加：
- 未確定入荷込みなら足りる場合 → unconfirmed_dependency
- 未確定込みでも足りない → hard_shortage

### 3. `material-forecast.ts` の挙動を変えない

原料・資材側の `shortageType` 判定は既存ロジックを **そのまま**（既存 41 ユニットテスト互換）。`status` カラムの導入で、`buildMaterialForecast` が StockMovement を読むときの分岐を `status` 経由に寄せる場合でも、結果が同一であることを確認。

### 4. API レスポンス拡張

`GET /api/inventory?itemType=`：既存 `confirmedInbound` / `unconfirmedInbound` フィールドを維持し、`itemType=product` でも同じ形式で返せるようにする（2-4 で対応済みかもしれない）。

`POST /api/product-planning/suggestions`：レスポンスに `shortageType` を含める（製品ごとに）。

### 5. テスト

`test/integration/inventory_ledger_status.test.ts`：
- `it("Future PLANNED_SHIPMENT_OUT reduces theoretical stock but not confirmed", ...)` skip 解除
- `it("INBOUND_UNCONFIRMED is excluded from confirmed stock", ...)` skip 解除

純関数テスト追加 `product-planning.test.ts`：
- 製品 shortageType の各分岐
- unconfirmedInbound = 0 のときの挙動（既存と一致）

### 6. 既存テストの維持

- 既存 `material-forecast.test.ts` の 2 ケース（hard_shortage, unconfirmed_dependency）pass 維持
- 既存 `product-planning.test.ts` の 2 ケース pass 維持

## 絶対遵守

- 既存 `material-forecast.ts` のロジック結果を変えない
- 既存 API レスポンスシェイプを壊さない
- 既存 `confirmedInbound` / `unconfirmedInbound` フィールドの意味を変えない
- `app/src/components/ui/`, `globals.css`, `layout.tsx` は触らない

## 完了条件

- [ ] 製品在庫推移で未確定が分離計算される
- [ ] 製品の `unconfirmed_dependency` 判定が機能
- [ ] 純関数テストの新規ケース追加（製品 shortage 判定）
- [ ] 2-T で skip 状態だった「INBOUND_UNCONFIRMED」「Future PLANNED_SHIPMENT_OUT」テストが pass
- [ ] 既存全テスト pass
- [ ] `npm run typecheck` clean

## 報告

300 字以内で：
- 製品 shortageType の判定式
- 編集した lib ファイル一覧
- skip 解除したテスト件数
- API レスポンス追加フィールドの一覧
- 既存ロジック互換性の確認結果
