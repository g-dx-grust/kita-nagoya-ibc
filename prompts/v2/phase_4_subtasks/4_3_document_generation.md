# Phase 4-3: 発注書 Excel/PDF 自動生成（標準テンプレ + 仮発注対応）

## 使用ツール

Codex

## 位置づけ

4-1 完了後に着手。4-2 と並列実行可。Phase 4 の **本丸**。

## 目的

[`docs/18 §6 4-7`](../../../docs/18_implementation_phase_plan.md)「発注書 PDF/Excel 自動生成」を実装。「**人は発注書を確認して送るだけ**」の状態を実現する。

## 確定仕様

| 項目 | 仕様 |
|---|---|
| **出力形式** | Excel 主、PDF サブ |
| **Excel ライブラリ** | 既存 `xlsx` を活用 |
| **PDF ライブラリ** | `pdf-lib` を新規追加 |
| **テンプレ** | 標準テンプレ 1 種のみ |
| **差し込み項目** | 仕入先名、品目名、数量、単価、合計、発注日、希望納期、緊急度、PO 番号、備考 |
| **仮発注（draft）対応** | status=draft でも出力可能。「**仮発注書**」と表示 |
| **本発注** | status=ordered_unconfirmed 以降は「発注書」と表示 |
| **対象外 status** | candidate / cancelled は出力不可（400 を返す） |
| **言語** | 日本語のみ |

## 前提

- 4-1 完了：urgency カラムあり
- 既存 npm パッケージ：`xlsx@^0.18.5`
- 新規追加：`npm install pdf-lib`
- PDF の日本語フォントは [Noto Sans JP](https://github.com/notofonts/noto-cjk) を `public/fonts/` または `app/fonts/` に配置 or pdf-lib の標準 14 フォントで凌げない場合は **追加調査**

## 読むファイル

- [`app/src/app/api/invoice-exports/route.ts`](../../../app/src/app/api/invoice-exports/route.ts)（CSV 生成のパターン）
- [`app/src/lib/csv.ts`](../../../app/src/lib/csv.ts)
- [`app/package.json`](../../../app/package.json)（xlsx の使い方）
- [`app/prisma/schema.prisma`](../../../app/prisma/schema.prisma) model PurchaseOrder, Supplier, Material, PackagingMaterial

## やってほしいこと

### 1. テンプレ定義（純関数）

`app/src/lib/purchase-order-document.ts`（新規）：

```ts
export type PurchaseOrderDocumentInput = {
  purchaseOrder: {
    id: string;
    code: string;             // PO 番号（無ければ id の頭8桁等）
    status: string;
    urgency: string;
    orderedQuantity: number;
    receivedQuantity?: number | null;
    unitPrice?: number | null;
    totalAmount?: number | null;
    shortageDate?: Date | null;
    recommendedOrderDate?: Date | null;
    note?: string | null;
    createdAt: Date;
  };
  item: {
    code: string;             // Material.materialCode or PackagingMaterial.materialCode
    name: string;
    unit: string;
  };
  supplier: {
    name: string;
    contact?: string | null;
    orderingUnit?: string | null;
  };
  generatedAt: Date;
  isProvisional: boolean;     // status=draft なら true
};

export type PurchaseOrderDocumentFormat = "xlsx" | "pdf";

export function renderPurchaseOrderXlsx(input: PurchaseOrderDocumentInput): Buffer;
export async function renderPurchaseOrderPdf(input: PurchaseOrderDocumentInput): Promise<Uint8Array>;

// 共通テンプレ構成のヘルパ関数
export function buildDocumentRows(input: PurchaseOrderDocumentInput): {
  header: { label: string; value: string }[];
  itemTable: { columns: string[]; rows: string[][] };
  footer: { label: string; value: string }[];
};
```

純関数テスト `purchase-order-document.test.ts`（新規）：
- `buildDocumentRows` の入出力（タイトル「発注書」or「仮発注書」、各セルの値、合計計算）
- isProvisional=true でタイトルが「**仮発注書**」になる
- urgency=CRITICAL のとき何かしらマーカー（赤フォント等）が入る（実装方法はテストでは緩く）

### 2. Excel 出力（`renderPurchaseOrderXlsx`）

`xlsx` を使って単一シート構成：

- **A1**：タイトル（「発注書」or「仮発注書」、大きく）
- **A3〜B7**：ヘッダー情報（仕入先名、発注日、希望納期、PO 番号、緊急度）
- **A9〜E9**：品目テーブルのヘッダー（品目コード / 品目名 / 数量 / 単位 / 単価 / 金額）
- **A10〜**：品目行（PurchaseOrder 1 件につき 1 行。複数行は将来拡張）
- 最下行：合計
- フッター：備考、注意書き、自社情報（後で固定値、いまは「（自社名）」プレースホルダ）

### 3. PDF 出力（`renderPurchaseOrderPdf`）

`pdf-lib` を使う。A4 縦、日本語フォント。

**日本語フォント問題**：pdf-lib の標準フォントは英文のみ。CJK 対応の方法：
1. Noto Sans JP TTF を `app/public/fonts/NotoSansJP-Regular.ttf`（あるいは別パス）にダウンロード配置
2. `pdf-lib` の `embedFont` でフォントを埋め込む
3. ファイルサイズが増えるが、必要

代替案：当面は **PDF 出力をスタブで先に作る**（プレースホルダ「PDF preview not available」のダミー PDF を返す）。Excel が主なので、PDF は次のサブタスクで本実装する選択肢もあり。**Codex で判断 → 報告**。

### 4. API ルート

`app/src/app/api/purchase-orders/[id]/document/route.ts`（新規）：

```ts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "xlsx") as "xlsx" | "pdf";

  // 1. PO + item (Material or PackagingMaterial) + Supplier を join 取得
  // 2. status が candidate / cancelled / active=false なら 400
  // 3. 入力を組み立てて buildDocumentRows + render*** を呼ぶ
  // 4. レスポンス：Content-Type を切替 + Content-Disposition: attachment; filename="..."
  //    - xlsx: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  //    - pdf: application/pdf
  // 5. audit("generate_purchase_order_document", entityId: po.id, after: { format, isProvisional })
}
```

### 5. 監査ログ

新 action：`generate_purchase_order_document`（after に format / isProvisional / fileName）

### 6. 統合テスト skip 解除（4-T 連携）

`test/integration/purchase_order_document.test.ts` の 9 件全部 skip 解除：
- Excel/PDF magic bytes チェック
- 仮発注（draft）出力
- 二重出力の冪等性（audit_log は 2 件入る、PO 本体に副作用なし）
- candidate/cancelled の reject
- テンプレ差し込み（仕入先名・品目名・数量・単価）

### 7. fixture / seed

テスト用の PurchaseOrder を生成するファクトリは Phase 4-T で拡張済み。実装に必要なら `prisma/seed.ts` にサンプル発注 1 件を追加。

### 8. 既存 csv.ts との関係

`lib/csv.ts` は Phase 6 で引き続き使う。`lib/purchase-order-document.ts` は **独立**。

## 絶対遵守

- 既存 `PUT /api/purchase-orders/[id]` のレスポンスシェイプを壊さない
- 新規 API ルートは GET（副作用無し、ただし audit_log は記録）
- `npm install pdf-lib` 以外の npm パッケージ追加は **要相談**
- `globals.css`, `components/ui/`, `layout.tsx` は触らない
- 文字起こし誤変換語（部屋名・外注先名）をハードコードしない

## 完了条件

- [ ] `lib/purchase-order-document.ts` + 純関数テスト追加
- [ ] `npm install pdf-lib` 完了、`package.json` 更新
- [ ] `/api/purchase-orders/[id]/document` 新設
- [ ] Excel 出力が実用品質（最低限のレイアウト）
- [ ] PDF 出力が動作（日本語 OK or 英字スタブで動く形）
- [ ] 4-T の 9 件統合テスト全部 pass
- [ ] 既存全テスト pass
- [ ] `npm run typecheck` clean
- [ ] 仮発注（draft）でも出力できる

## 報告

400 字以内で：
- 追加した lib ファイル + テスト件数
- 採用した PDF アプローチ（フォント埋め込み有 or スタブ）
- Excel テンプレの構成（行数、シート数）
- 4-T skip 解除件数
- 既存テスト全件 pass の確認
- 知見：pdf-lib の日本語対応で詰まった場合の選択肢
