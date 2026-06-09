# Phase 2-U: 製品在庫画面（Excel 風）と未確定発注の区分表示

## 使用ツール

Claude Code

## 位置づけ

2-4 + 2-5 完了後に着手。Phase 2 の最終仕上げ。

## 目的

[`docs/18 §19-4`](../../../docs/18_implementation_phase_plan.md) と [`0_3_boundary_decision.md §1-2`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) に基づき：

1. **製品在庫を Excel 風に閲覧できる画面** を追加（既存 `/inventory` は原料・資材のみ）
2. 既存 `/inventory`（原料・資材）に **planned / confirmed / unconfirmed の区分** を視覚的に出す
3. 製品の不足判定（`hard_shortage` / `unconfirmed_dependency` / `none`）を画面で表現

**デザインは絶対に崩さない**。新規ページを `/inventory/products` で追加するか、既存 `/inventory` にタブを設けるかは現状実装の構造に従って判断（既存 `/inventory` page.tsx が原料/資材2セクション構成なので、**製品セクションを追加**する方針を推奨）。

## 前提

- 2-4 完了：`getInventoryFor("product", ...)` が動く
- 2-5 完了：製品の `shortageType` が判定できる
- [`0_a_screens_inventory.md §3`](../../../docs/phase_0_outputs/0_a_screens_inventory.md) で確認された既存 UI コンポーネント・CSS クラスのみ使用
- [`0_a_screens_inventory.md §5`](../../../docs/phase_0_outputs/0_a_screens_inventory.md) のデザインシステム概観を遵守

## 触ってよいファイル

- `app/src/app/inventory/page.tsx`
- `app/src/app/inventory/` 配下の新規ファイル（製品在庫テーブル等）
- `app/src/lib/labels.ts`（shortageType ラベル等の追加）
- `app/src/lib/monthly-inventory-sheet.ts`（製品在庫対応の拡張）

## 触ってはいけないファイル

- `app/src/app/layout.tsx`
- `app/src/app/globals.css`
- `app/src/app/app-nav.tsx`
- `app/src/components/layout/`, `components/ui/`
- `components.json`

## 読むファイル

- `app/src/app/inventory/page.tsx`（既存の Excel 風シート構造）
- `app/src/lib/monthly-inventory-sheet.ts:buildMonthlyInventorySheet`（純関数）
- `app/src/lib/inventory.ts:getInventoryFor`（2-4 で拡張済み）
- `app/src/lib/product-planning.ts`（2-5 で拡張済み）

## やってほしいこと

### 1. 既存 `/inventory` に製品セクションを追加

既存の原料セクション・資材セクションの **下に**「製品在庫」セクションを追加。同じ `.excel-inventory-*` クラスを使い、視覚的に揃える。

- 列：商品コード / 商品名 / 月別 (使用量 / 入荷 / 残 / 賞味期限) ← 製品の「使用量」は出荷予定数量、「入荷」は生産予定数量に読み替え
- 製品の場合は **賞味期限の代わりに**「不足ステータス」を表示する案もあり（ただし既存原料側のクラスに揃える必要があるため、月別残数の色付けで `hard_shortage` / `unconfirmed_dependency` を区別）

### 2. 既存 `/inventory` の planned / confirmed / unconfirmed 区分表示

原料・資材セクションの月別シートで、**残数セル**を以下のいずれかで色分け：

- 全行 status=CONFIRMED 由来 → 通常表示
- 残に PLANNED 行が混じる → 軽く色付け（`.subtext` の muted 色）
- 未確定発注に依存 → 警告色（`.badge warn` 相当）
- 確定だけで不足 → 危険色（`.badge danger` 相当）

判定は 2-5 で導入した `shortageType` を製品側にも統一適用したものを利用。

### 3. labels.ts に shortageType ラベル追加

```ts
export function shortageTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "none":
      return "充足";
    case "hard_shortage":
      return "不足";
    case "unconfirmed_dependency":
      return "未確定発注に依存";
    default:
      return value || "—";
  }
}
```

### 4. `monthly-inventory-sheet.ts` の拡張

既存 `buildMonthlyInventorySheet` は原料・資材を前提に作られている。**製品も同じ構造で扱える**よう、引数で `itemType: "product" | "raw_material" | "packaging"` を受け取れるように拡張。

ただし **既存呼び出し互換**：引数省略時は既存挙動。追加引数で製品サポート。

純関数テストを `monthly-inventory-sheet.test.ts` に追加：
- 製品 itemType の入出力（生産予定数量を入荷扱い、出荷予定数量を使用量扱い）

### 5. 製品在庫テーブルコンポーネント

`app/src/app/inventory/product-inventory-section.tsx` 新規（サーバーコンポーネント or クライアントコンポーネント）：

- 既存の原料セクションと同じ視覚スタイル
- `getInventoryFor("product", productIds, asOfDate)` で当月初の残数を取得
- `monthly-inventory-sheet.ts` で月別シートを構築
- セル色分けで shortage を表現

### 6. HOME 画面の統計カード（任意）

`app/src/app/page.tsx` に「製品在庫不足見込み」カードを追加（既存「原料在庫不足」と並べる）。これは **任意**で、Phase 2-U では既存 HOME の構造を壊さない範囲で対応。

### 7. デザイン目視確認

`npm run dev` で：
- `/inventory` の原料・資材セクションが既存と同じ見た目で動作
- 新規製品セクションが既存と同じ視覚スタイル
- レスポンシブ（<= 760px）でも壊れない
- スマホでは Excel 風スクロールが効く

## 絶対遵守

- 新規 shadcn コンポーネントを投入しない（Dialog/Select/Toast 等）
- `globals.css` を変更しない
- `components/ui/` の新規バリアントを作らない
- 既存 `.excel-inventory-*` クラスを使う
- 既存 `/inventory` page.tsx の原料・資材セクションのレイアウトを変えない
- 配色・余白・タイポグラフィの "改善" をしない

## 完了条件

- [ ] `/inventory` 画面に製品セクションが追加された
- [ ] 原料・資材セクションの残数セルが planned / confirmed / unconfirmed で色分けされている
- [ ] `shortageTypeLabel` が `labels.ts` に追加されている
- [ ] `monthly-inventory-sheet.ts` が製品サポートに拡張されている（既存呼び出し互換）
- [ ] 純関数テスト追加（製品 itemType の入出力）
- [ ] `npm run typecheck` clean
- [ ] `npm run test` 全件 pass
- [ ] `npm run dev` でデザイン崩れ無し（手動目視）

## 報告

300 字以内で：
- 編集ファイル一覧
- 製品セクションの構成（行数・列構成）
- 追加した shortageType の表示方法（色分け基準）
- monthly-inventory-sheet.ts に追加した引数
- 既存画面の視覚的影響（あれば）
- レスポンシブ確認結果
