# Phase 4-U: 発注書作成画面（プレビュー → 出力ボタン）

## 使用ツール

Claude Code

## 位置づけ

4-2 + 4-3 完了後に着手。Phase 4 の最終仕上げ。

## 目的

[`docs/18 §19-4`](../../../docs/18_implementation_phase_plan.md)「発注書作成画面」を実装。既存 `/purchases` 画面から自然に発注書を出力できるようにする。

## 確定仕様

- 既存 `/purchases` 画面に **「発注書 Excel」「発注書 PDF」ボタン** を発注候補テーブルの各行に追加
- ボタン押下で `/api/purchase-orders/[id]/document?format=xlsx|pdf` を fetch → ブラウザにダウンロードさせる
- status=candidate / cancelled の PO はボタン非活性
- status=draft の PO は **「仮発注書」** ラベルでボタン表示
- 緊急度 CRITICAL / WARNING に応じて行全体の警告色（`.badge danger` / `.badge warn` 既存クラスを使う）

**追加スコープ無し**：メール送信ボタン、一括出力、プレビューモーダルは Phase 4-U では実装しない。

## 触ってよいファイル

- `app/src/app/purchases/page.tsx`
- `app/src/app/purchases/purchase-order-table.tsx`
- `app/src/app/purchases/generate-button.tsx`（既存。位置調整のみ）
- `app/src/app/purchases/` 配下の新規ファイル（必要なら）
- `app/src/lib/labels.ts`（urgency ラベル追加、status ラベル拡張）

## 触ってはいけないファイル

- `app/src/app/layout.tsx`
- `app/src/app/globals.css`
- `app/src/components/layout/`, `components/ui/`
- `components.json`
- `app/src/app/app-nav.tsx`（メニュー追加もしない。`/purchases` 内に閉じる）

## 読むファイル

- [`app/src/app/purchases/page.tsx`](../../../app/src/app/purchases/page.tsx)
- [`app/src/app/purchases/purchase-order-table.tsx`](../../../app/src/app/purchases/purchase-order-table.tsx)
- [`app/src/lib/labels.ts`](../../../app/src/lib/labels.ts)
- [`app/src/app/inventory/page.tsx`](../../../app/src/app/inventory/page.tsx)（参考：Excel 出力ボタンの既存パターン）
- 4-3 で実装した `/api/purchase-orders/[id]/document` のシグネチャ

## やってほしいこと

### 1. labels.ts に追加

```ts
export function purchaseOrderUrgencyLabel(value: string | null | undefined) {
  switch (value) {
    case "CRITICAL": return "緊急";
    case "WARNING":  return "注意";
    case "INFO":     return "余裕あり";
    case "NONE":     return "—";
    default: return value || "—";
  }
}

export function purchaseOrderUrgencyClass(value: string | null | undefined): string {
  switch (value) {
    case "CRITICAL": return "danger";
    case "WARNING":  return "warn";
    case "INFO":     return "info";
    default: return "muted";
  }
}

export function purchaseOrderStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "candidate":            return "候補";
    case "draft":                return "仮発注";
    case "ordered_unconfirmed":  return "未確定発注";
    case "confirmed":            return "確定発注";
    case "received":             return "入荷済み";
    case "cancelled":            return "取消";
    default: return value || "未設定";
  }
}
```

### 2. `purchase-order-table.tsx` 拡張

既存テーブルに以下を追加：

- **緊急度カラム**：`<span className="badge ${purchaseOrderUrgencyClass(po.urgency)}">{purchaseOrderUrgencyLabel(po.urgency)}</span>`
- **出力ボタン**（行内アクション列）：
  - `status` が draft/ordered_unconfirmed/confirmed/received → 「発注書 Excel」「発注書 PDF」ボタン
  - status=draft なら ラベルは「**仮発注書 Excel**」「**仮発注書 PDF**」
  - status=candidate/cancelled → ボタン無し or disabled

ダウンロード処理（Client Component）：

```tsx
async function downloadDocument(poId: string, format: "xlsx" | "pdf") {
  const url = kitagoyaApiPath(`/purchase-orders/${poId}/document?format=${format}`);
  const res = await fetch(url);
  if (!res.ok) { alert("発注書の生成に失敗しました"); return; }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1]
    ?? `purchase-order-${poId}.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

### 3. `purchases/page.tsx`

既存の発注候補一覧 + 発注 PO テーブルの構成は維持。`purchase-order-table.tsx` を経由するため、上位ページの編集は最小限。

ただし、サーバー側で PO を取得するクエリに **urgency / supplier の include** が抜けていれば追加。

### 4. 発注承認・受領ボタン（4-2 連携）

既存テーブルに：
- status=ordered_unconfirmed → 「**確定する**」ボタン → `POST /api/purchase-orders/[id]/confirm`
- status=confirmed → 「**入荷確定**」ボタン（受領数量入力モーダル）→ `POST /api/purchase-orders/[id]/receive`

入荷確定のモーダルは `globals.css` の `.modal-*` クラスを使う（shadcn Dialog は **追加投入しない**）。

### 5. デザイン目視確認

`npm run dev` で `/purchases` を開いて：
- 緊急度バッジが正しい色で出る（CRITICAL 赤 / WARNING 黄 / INFO 青）
- 仮発注／本発注書ボタンが status に応じて切り替わる
- ダウンロードが正常に動く
- 確定・入荷確定ボタンが動く
- レスポンシブ（<= 760px）でも崩れない

### 6. 既存テスト維持

UI 変更だけなので統合テストへの影響はないはず。`npm run test` が全件 pass を確認。

## 絶対遵守

- 新規 shadcn コンポーネントを投入しない
- `globals.css` を変更しない
- 既存 `.badge`, `.modal`, `.button-link` クラスを使う
- 既存 `purchase-order-table.tsx` の構造を **大きく変えない**（列・ボタン追加のみ）
- 配色・余白の "改善" をしない

## 完了条件

- [ ] `labels.ts` に urgency / status ラベル + class 追加
- [ ] `/purchases` 画面で緊急度バッジが表示される
- [ ] 「発注書 Excel」「発注書 PDF」ボタンが動作
- [ ] draft 状態でも「仮発注書」ラベルでボタン表示・ダウンロード可能
- [ ] 「確定する」「入荷確定」ボタンが動作（4-2 API 連携）
- [ ] 入荷確定モーダルで受領数量を入力できる
- [ ] `npm run typecheck` clean
- [ ] `npm run test` 全件 pass
- [ ] `npm run dev` でデザイン崩れ無し（手動目視）

## 報告

300 字以内で：
- 編集ファイル一覧
- 追加したボタンの動作（ダウンロード、確定、入荷確定）
- 緊急度バッジの色分け確認結果
- デザイン懸念があれば 1 行
