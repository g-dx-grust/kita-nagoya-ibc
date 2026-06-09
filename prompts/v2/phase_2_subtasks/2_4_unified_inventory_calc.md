# Phase 2-4: 任意日付の理論在庫計算関数を共通化（製品・原料・資材）

## 使用ツール

Codex

## 位置づけ

2-2 完了後、2-5 と並列実行可。

## 目的

[`docs/18 §2-4`](../../../docs/18_implementation_phase_plan.md) と [`0_3_boundary_decision.md §1-2`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) に基づき、**製品・原料・資材すべて**の任意日付の理論在庫を **同じインターフェイス** で計算できるようにする。

現状の `lib/inventory.ts:getInventoryFor` は原料・資材のみ対応で、製品在庫は `product-planning-service` 内で別ロジックを直書きしている（[`0_2_api_logic_audit.md §3 Phase 2`](../../../docs/phase_0_outputs/0_2_api_logic_audit.md)）。これを共通化する。

## 前提

- 2-1 完了：`status` 列が `StockMovement` にある
- 2-2 完了：PLANNED 行が ProductionPlan / PurchaseOrder の状態に追随して発行される
- 2-T のテスト `test/integration/inventory_calc_unified.test.ts` を skip 解除する責任を持つ

## 読むファイル

- `app/src/lib/inventory.ts:getInventoryFor`（既存実装）
- `app/src/lib/product-planning-service.ts:loadProductPlanningSuggestions`（製品在庫を直書きしている箇所）
- `app/src/lib/material-forecast.ts:buildMaterialForecast`（時系列累積の実装）
- `app/src/lib/monthly-inventory-sheet.ts`（月次 Excel 風シートで在庫を見る既存ロジック）

## やってほしいこと

### 1. シグネチャ統一

`app/src/lib/inventory.ts` の `getInventoryFor` を拡張：

```ts
export type InventoryItemType = "product" | "raw_material" | "packaging";

export type InventorySnapshot = {
  itemId: string;
  onHand: number;             // status=CONFIRMED の累積
  plannedIn: number;          // status=PLANNED の正の累積
  plannedOut: number;         // status=PLANNED の負の累積（絶対値）
  confirmedInbound: number;   // INBOUND_CONFIRMED かつ status=PLANNED の累積（≒ 確定発注未入荷）
  unconfirmedInbound: number; // INBOUND_UNCONFIRMED かつ status=PLANNED の累積
  theoreticalStock: number;   // onHand + plannedIn - plannedOut
};

export async function getInventoryFor(
  itemType: InventoryItemType,
  itemIds: string[],
  asOfDate: Date,
): Promise<Map<string, InventorySnapshot>>;
```

**注意**:
- `onHand` は **既存挙動を維持**（既存呼び出し側が依存しているため）
- `confirmedInbound` / `unconfirmedInbound` のフィールド名は **既存と同じ**
- 追加フィールド：`plannedIn`, `plannedOut`, `theoreticalStock`

### 2. 製品在庫もサポート

`itemType === "product"` のとき：
- `onHand`：`opening` + `inbound`（旧形式） + `ACTUAL_PRODUCTION_IN`（新形式） + `actual_consume`（負）+ `ACTUAL_SHIPMENT_OUT`（新形式、負）の累積、status=CONFIRMED のみ
- `plannedIn`：`PLANNED_PRODUCTION_IN` の status=PLANNED 累積
- `plannedOut`：`PLANNED_SHIPMENT_OUT` の status=PLANNED 累積（絶対値）

### 3. 旧 movementType 互換性

`material-forecast.ts` / `monthly-inventory-sheet.ts` 等の旧呼び出し側が壊れないこと。`onHand` の値が既存と一致することをテストで確認。

### 4. `product-planning-service` の直書きを置換

`loadProductPlanningSuggestions` 内の製品在庫直接クエリを `getInventoryFor("product", productIds, asOfDate)` に置き換え。**結果が既存と一致する**ことをユニットテストで確認。

### 5. テスト

`test/integration/inventory_calc_unified.test.ts` の skip 解除：
- `it("getInventoryFor returns onHand/confirmedInbound/unconfirmedInbound for products", ...)`
- `it("getInventoryFor returns same for materials and packaging", ...)`
- `it("Asof date excludes future movements", ...)`

追加で純関数テスト（`app/src/lib/inventory.test.ts` 新規）：
- `onHand`, `plannedIn`, `plannedOut`, `theoreticalStock` の計算境界
- status の組合せパターン全網羅

### 6. 既存テストの維持

`material-forecast.test.ts` / `monthly-inventory-sheet.test.ts` / `product-planning.test.ts` が全件 pass を維持。**改修した内部ロジックの結果が既存と一致する**ことを最優先。

### 7. 既存呼び出し側

- `lib/material-forecast.ts:buildMaterialForecast` は内部で StockMovement を読んでいる。`status` の判定を加えるか、`getInventoryFor` 経由に寄せる
- `lib/monthly-inventory-sheet.ts` も同様
- 既存テストが pass していれば、内部実装の選択は自由

## 絶対遵守

- 既存 `getInventoryFor` の戻り値の **既存フィールド（`onHand` / `confirmedInbound` / `unconfirmedInbound`）の値が変わらない**こと（追加フィールドは OK）
- 既存 API レスポンスシェイプを壊さない（`/api/inventory` のレスポンス）
- 既存純関数の戻り値が変わらない
- `app/src/components/ui/`, `globals.css`, `layout.tsx` は触らない

## 完了条件

- [ ] `getInventoryFor` が 3 つの itemType に対応
- [ ] `InventorySnapshot` 型がエクスポートされている
- [ ] 旧呼び出し側の挙動が変わっていない（既存テスト全件 pass）
- [ ] 2-T のテスト `inventory_calc_unified.test.ts` 全件 skip 解除 + pass
- [ ] 純関数テスト `lib/inventory.test.ts` 追加
- [ ] `npm run typecheck` clean
- [ ] `npm run test` 全件 pass

## 報告

300 字以内で：
- `getInventoryFor` の最終シグネチャ
- 旧呼び出し側のうち書き換えた箇所
- skip 解除したテスト件数
- 既存呼び出し側の挙動互換確認結果
