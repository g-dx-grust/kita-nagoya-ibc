# Phase 4-T: 統合テスト先行追加（発注承認パイプライン・緊急度判定・出力冪等性）

## 使用ツール

Claude Code

## 位置づけ

Phase 4 の **先行タスク**。4-1 と並列に着手可。Phase 4 完了時の挙動を **失敗するテスト** として先に書き、各サブタスク完了時に skip 解除する。

## 目的

Phase 4 で実装される最重要挙動を `it.skip` 状態で先に書き出す。

対象シナリオ（[`docs/phase_0_outputs/0_c_test_coverage_diff.md §4 E2`](../../../docs/phase_0_outputs/0_c_test_coverage_diff.md) ベース）：

- **緊急度判定**：required_order_date と today の差で CRITICAL / WARNING / INFO が正しく付く
- **発注承認パイプライン**：candidate → draft → ordered_unconfirmed → confirmed → received
- **StockMovement.status 連動**：PurchaseOrder の状態遷移で対応 movement の status が PLANNED → CONFIRMED → CANCELLED と動く（Phase 2-2 の継承確認）
- **発注書出力の冪等性**：同じ PO で 2 回出力しても破壊的副作用なし
- **仮発注（draft）の出力**：status=draft でも document API が成功する

## 前提

- 統合テスト基盤は Phase 1-T で構築済み（[`app/test/README.md`](../../../app/test/README.md)）
- Phase 2 完了：`StockMovement.status` 列あり、二重登録防止のユニーク制約あり
- 既存 85 統合テスト + ユニット 46 = 131 件は全件 pass

## 読むファイル

- [`app/prisma/schema.prisma`](../../../app/prisma/schema.prisma) model PurchaseOrder, StockMovement
- [`app/src/app/api/purchase-candidates/generate/route.ts`](../../../app/src/app/api/purchase-candidates/generate/route.ts)
- [`app/src/app/api/purchase-orders/[id]/route.ts`](../../../app/src/app/api/purchase-orders/[id]/route.ts)
- [`app/src/lib/material-forecast.ts`](../../../app/src/lib/material-forecast.ts)
- [`app/test/helpers/factories.ts`](../../../app/test/helpers/factories.ts)（`createTestPurchaseOrder` 既存）

## やってほしいこと

### 1. ファクトリ拡張（必要分のみ）

`createTestPurchaseOrder` は既存。Phase 4 で必要な追加引数（`shortageDate`, `recommendedOrderDate`, `urgency`, `supplierId`, `templateRef`）が optional で受け取れるよう拡張する。**既存呼び出し互換**を維持。

### 2. テストファイル新規作成（すべて `it.skip` で開始）

#### `test/integration/purchase_order_urgency.test.ts`

```ts
describe("PurchaseOrder urgency classification", () => {
  it.skip("required_order_date が今日 → CRITICAL");
  it.skip("required_order_date が昨日（過去日） → CRITICAL");
  it.skip("required_order_date が今日+1日 → CRITICAL（境界）");
  it.skip("required_order_date が今日+2日 → WARNING（境界）");
  it.skip("required_order_date が今日+7日 → WARNING（境界）");
  it.skip("required_order_date が今日+8日 → INFO（境界）");
  it.skip("required_order_date が null → urgency=NONE");
  it.skip("purchase-candidates/generate が urgency を自動付与する");
});
```

#### `test/integration/purchase_order_approval.test.ts`

```ts
describe("PurchaseOrder approval pipeline", () => {
  it.skip("candidate → draft 遷移は StockMovement を発行しない");
  it.skip("draft → ordered_unconfirmed で INBOUND_UNCONFIRMED 行が PLANNED で発行される");
  it.skip("ordered_unconfirmed → confirmed で対応行が INBOUND_CONFIRMED + status=PLANNED に更新");
  it.skip("confirmed → received で対応行が status=CONFIRMED に更新（実在庫に反映）");
  it.skip("確定済みを cancel すると StockMovement が status=CANCELLED に");
  it.skip("/confirm エンドポイントが二重実行で副作用無し（冪等）");
  it.skip("/receive エンドポイントが受領数量を引数で受ける");
  it.skip("/receive で audit_log に receive_purchase_order が 1 件追加される");
  it.skip("/confirm で audit_log に confirm_purchase_order が 1 件追加される");
});
```

#### `test/integration/purchase_order_document.test.ts`

```ts
describe("PurchaseOrder document generation", () => {
  it.skip("status=draft の PO で発注書 Excel が出力できる（仮発注）");
  it.skip("status=ordered_unconfirmed の PO で発注書 Excel が出力できる");
  it.skip("status=ordered_unconfirmed の PO で発注書 PDF が出力できる");
  it.skip("Excel の bytes が妥当（empty でない、Excel header マジックバイト）");
  it.skip("PDF の bytes が妥当（PDF header %PDF-）");
  it.skip("同じ PO で 2 回出力しても副作用なし（冪等）");
  it.skip("仕入先名・品目名・数量・単価がテンプレに正しく差し込まれる");
  it.skip("status=candidate の PO は出力不可（400 を返す）");
  it.skip("active=false の PO は出力不可");
});
```

### 3. 既存呼び出し互換性チェックテスト（追加）

`test/integration/phase4_baseline.test.ts`：

```ts
describe("Phase 4 baseline (既存挙動の維持)", () => {
  it.skip("purchase-candidates/generate のレスポンスシェイプが既存と一致（urgency 追加のみ）");
  it.skip("PUT /api/purchase-orders/[id] が既存どおり動作");
  it.skip("DELETE /api/purchase-orders/[id] が既存どおり candidate/draft/cancelled は物理削除");
  it.skip("既存 material-forecast.ts の shortage 判定が変わらない");
});
```

### 4. テスト初期状態

すべて `it.skip(...)`。`describe.skip` は使わない（個別 skip 解除を可能にするため）。

各テストファイル冒頭にコメント：

```ts
// Phase 4-X 完了時にこの skip を解除すること:
// - urgency: 4-1
// - approval pipeline: 4-2
// - document generation: 4-3
// - baseline: 4-1 〜 4-3 にまたがる
```

### 5. 既存テストへの影響

既存 131 件は1件も変更しない。新規追加分は全部 skip で `npm run test` 全体に影響しない。

## 絶対遵守

- 既存テストファイルを編集しない
- 既存ファクトリのシグネチャを変更しない（追加引数は optional のみ）
- `schema.prisma` は触らない（4-1 の担当）
- `lib/material-forecast.ts`, `purchase-candidates/generate/route.ts` は触らない（4-1, 4-2 の担当）
- `app/src/app/`, `components/`, `globals.css`, `layout.tsx` は触らない

## 完了条件

- [ ] 4 ファイル新規追加（urgency, approval, document, baseline）
- [ ] 全テスト `it.skip` 状態
- [ ] `npm run test` で既存 131 件 + 0 件 pass（skip 数表示は出る）
- [ ] `npm run typecheck` clean
- [ ] ファクトリ拡張（既存呼び出し互換）

## 報告

300 字以内で：
- 追加したテストファイル一覧
- 各ファイルの skip 件数
- 各シナリオで何を検証しているか（1 行）
- ファクトリ拡張の差分
- どの skip を 4-1/4-2/4-3 で解除すべきか
