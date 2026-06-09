# Phase 1-U: マスタ管理画面の拡張カラム表示

## 使用ツール

Claude Code

## 位置づけ

1-1〜1-7 すべて完了後に着手。1-V と並列実行可。

## 目的

1-1〜1-7 で追加したマスタの新カラム（`validFrom`, `validTo`, `forecastMethod`, `safetyStockQuantity`, `equipmentKind`, `sourceType`, `locked` 等）を **既存マスタ管理画面に表示・編集できるようにする**。

**デザインを崩さない**ことが最優先。新カラムは既存テーブルの列として追加、編集フォームには行追加で対応。**新規ページの作成、レイアウトの再設計、shadcn コンポーネントの追加投入は禁止**。

## 前提

- [`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §5（Phase 1 で触らないもの）・§6（デザイン保護ルール）を最優先で遵守。
- [`0_a_screens_inventory.md`](../../../docs/phase_0_outputs/0_a_screens_inventory.md) §1 で確認された既存マスタ画面の構造を維持。
- 1-1〜1-7 のマイグレーションと API 拡張がすべて完了している前提。
- §7-1 #5 「作業場所マスタの追加・改廃の権限者」が未確定なら、編集権限分岐は実装しない（全員編集可のまま）。
- 仕入先マスタ画面・統合グループ画面・特殊案件画面が現状未実装。**Phase 1-U では既存画面の拡張のみ**を扱い、これら新規画面は本サブタスクのスコープ外とする（Phase 5 着手前にメニュー追加と合わせて別途）。

## 触ってよいファイル

- `app/src/app/masters/products/page.tsx`, `[id]/page.tsx`, `product-editor.tsx`, `product-create-form.tsx`
- `app/src/app/masters/materials/page.tsx`
- `app/src/app/masters/packaging/page.tsx`
- `app/src/app/masters/work-areas/page.tsx`, `work-area-capacity-table.tsx`, `work-area-fields.ts`
- `app/src/app/masters/employees/page.tsx`
- `app/src/app/masters/master-form.tsx`（汎用フォーム。**シグネチャを壊さない形で**拡張可）
- `app/src/app/masters/master-edit-button.tsx`（モーダル経由の編集。`globals.css` の `.modal` クラスに依存）

## 触ってはいけないファイル

- `app/src/app/layout.tsx`
- `app/src/app/globals.css`
- `app/src/app/app-nav.tsx`
- `app/src/components/layout/` 全部（Header/Sidebar/MainLayout）
- `app/src/components/ui/` 全部（Button/Badge/Card/Input/MenuCard/Table）
- `app/components.json`

## 読むファイル

- 1-1〜1-7 の出力（schema.prisma の最新、各 API ルートの実装）
- [`0_a_screens_inventory.md`](../../../docs/phase_0_outputs/0_a_screens_inventory.md) §3（UI コンポーネントライブラリ現状）
- [`0_a_screens_inventory.md`](../../../docs/phase_0_outputs/0_a_screens_inventory.md) §5（デザインシステム概観：CSS 変数・既存クラス）

## やってほしいこと

### 1. 商品マスタ（`/masters/products`）

一覧画面：
- 既存テーブルに `forecastMethod`（日本語ラベル化）、`validFrom`/`validTo`（短縮日付表示）の列を追加
- 列追加で横スクロールが発生する場合は `.table-frame` の `overflow-x: auto` に任せる
- 「予測方式」ラベルは `lib/labels.ts` に `forecastMethodLabel()` を追加して使う

詳細画面（`/masters/products/[id]`）：
- `product-editor.tsx` のフォームに `forecastMethod`（select）、`validFrom`/`validTo`（date input）の行を追加
- 既存の `productionType`, `category`, `safetyStockQuantity`（既存）と同じ視覚的階層

新規作成画面：
- `product-create-form.tsx` に `forecastMethod` の select を追加。デフォルトは `MANUAL`。
- `validFrom` / `validTo` は新規作成時には任意のまま（空でも保存できる）

### 2. 原材料マスタ（`/masters/materials`）

一覧：`safetyStockQuantity`, `orderLotQty`, `minOrderQty` 列を追加。空欄は `-` 表示。

編集（`master-form.tsx`）：3 カラムの入力行を追加。`safetyStockQuantity` は必須・既定 0。`orderLotQty` と `minOrderQty` は任意。

### 3. 資材マスタ（`/masters/packaging`）

材料と同じ 3 カラム追加 + `validFrom`/`validTo`。

### 4. 作業場所マスタ（`/masters/work-areas`）

一覧：`equipmentKind`（日本語ラベル）、`concurrentOperationAllowed`（◯/×）列を追加。

`work-area-fields.ts` がフィールド定義の共通 source なら、それに `equipmentKind` / `concurrentOperationAllowed` を追加。`equipmentKind` は select、`concurrentOperationAllowed` は checkbox。

ラベル：`equipmentKindLabel()` を `lib/labels.ts` に追加。

### 5. 能力レビュー（`/capacity-review`）

`capacity-review-table.tsx` の各行に `sourceType`（MANUAL/中央値）と `locked`（ロック中バッジ）を表示。

`reviewStatus` バッジと併存。`locked = true` は赤系の `Badge variant="warning"` または `destructive` を使う。

### 6. 従業員マスタ（`/masters/employees`）

`validFrom`/`validTo` の表示・編集を追加（追加カラムはこれだけ）。

### 7. 仕入先・統合グループ・特殊案件画面

**Phase 1-U では着手しない**。これらは現状画面未実装で、新規画面作成はデザイン崩しのリスクが高いため、Phase 5 着手前のメニュー追加タイミングで別途。

### 8. デザイン崩れ確認

すべての変更後に：
- `npm run dev` で起動
- 各マスタ画面を巡回し、列追加で横スクロールが想定通り効くこと
- モーダル編集（`.modal`）が `globals.css` のスタイルで崩れず開閉できること
- レスポンシブ（`<= 760px`）でフォームが縦並びに崩れないこと

スクリーンショットの自動取得は不要だが、各画面を目視で確認すること（dev サーバー手動起動の手間は許容）。

## 絶対遵守

- 新規 UI ライブラリコンポーネント（Dialog/Select/Toast 等）を **shadcn から追加投入しない**。
- 既存の `<select>` / `<input>` / `.modal-*` パターンを使う。
- `globals.css` は触らない。
- `components/ui/` は触らない（新規バリアント追加すらしない）。
- `MenuCard` の構造は変えない（HOME 画面に新規メニュー追加もしない。これは Phase 5 で）。
- 既存 API レスポンスを前提にして表示する。クライアント側で新カラムが null/undefined の場合は `-` を表示。

## 完了条件

- [ ] 商品・原料・資材・作業場所・能力・従業員の各マスタ画面で新カラムが表示・編集できる
- [ ] 既存テスト全件 pass
- [ ] `npm run typecheck` が通る
- [ ] `npm run dev` でデザイン崩れ無く動作（手動目視）
- [ ] レスポンシブ崩れなし
- [ ] モーダル編集が機能する
- [ ] `lib/labels.ts` に `forecastMethodLabel`, `equipmentKindLabel` が追加されている
- [ ] 既存マスタ画面のレイアウトは構造維持

## 報告

300 字以内で：
- 編集したファイル一覧
- 追加した列・フォーム行の総数
- 目視確認で気付いたデザイン懸念（あれば）
- 仕入先/統合グループ/特殊案件 UI を Phase 5 と合わせて後で作る前提を再確認
