# Phase 4-2: 発注承認エンドポイント（`/confirm`, `/receive`）

## 使用ツール

Codex

## 位置づけ

4-1 完了後に着手。4-3 と並列実行可。

## 目的

[`docs/18 §6 4-6`](../../../docs/18_implementation_phase_plan.md)「候補→人の承認→本発注化」を実装。既存 `PUT /api/purchase-orders/[id]` で status を直接更新できる仕組みを残しつつ、**専用エンドポイント**を新設して監査ログを区別する。

- `POST /api/purchase-orders/[id]/confirm`：`ordered_unconfirmed → confirmed`
- `POST /api/purchase-orders/[id]/receive`：`confirmed → received`（受領数量を引数で受ける）

両方とも Phase 2-2 で実装した **StockMovement.status との連動** を継承する。

## 確定仕様

`PurchaseOrder.status` 遷移と StockMovement.status の連動（Phase 2-2 で整理済み）:

| PO.status 遷移 | StockMovement への副作用 |
|---|---|
| candidate → draft | 何も発行しない |
| draft → ordered_unconfirmed | `INBOUND_UNCONFIRMED`, `status=PLANNED` 発行 |
| ordered_unconfirmed → confirmed | 該当行を `INBOUND_CONFIRMED`, `status=PLANNED` に更新 |
| confirmed → received | 該当行を `status=CONFIRMED` に更新（実在庫に反映） |
| 任意 → cancelled | 該当行を `status=CANCELLED` に更新 |

新エンドポイントは：
- `/confirm` は `ordered_unconfirmed → confirmed` のみ受け付け（他 status はエラー）
- `/receive` は `confirmed → received` のみ受け付け
- 監査ログ：`confirm_purchase_order` / `receive_purchase_order`（既存の `update` action と区別）

## 前提

- 4-1 完了：urgency カラムあり、緊急度算出ロジックあり
- Phase 2-2 完了：PO.status と StockMovement.status の連動が `PUT /api/purchase-orders/[id]` 内に実装されている

## 読むファイル

- [`app/src/app/api/purchase-orders/[id]/route.ts`](../../../app/src/app/api/purchase-orders/[id]/route.ts)（既存 PUT 内の status 遷移ロジック）
- [`app/src/lib/audit.ts`](../../../app/src/lib/audit.ts)
- [`app/src/lib/material-forecast.ts:refreshCumulativeMaterialRequirements`](../../../app/src/lib/material-forecast.ts)
- [`app/src/lib/schemas.ts`](../../../app/src/lib/schemas.ts)

## やってほしいこと

### 1. 新規 API ルート

`app/src/app/api/purchase-orders/[id]/confirm/route.ts`（新規）：

```ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 1. PO を取得、status が ordered_unconfirmed であることを検証
  //    → 違えば 400 (invalid_status)
  // 2. PO を ordered_unconfirmed → confirmed に更新
  // 3. 既存ロジック（PUT /api/purchase-orders/[id] の status 連動部分）を呼び出すか抽出して再利用
  //    → 該当 StockMovement 行を INBOUND_CONFIRMED, status=PLANNED に更新
  // 4. refreshCumulativeMaterialRequirements を呼ぶ
  // 5. audit("confirm_purchase_order", entityId: po.id, before/after)
  // 6. ok(updated PO)
}
```

`app/src/app/api/purchase-orders/[id]/receive/route.ts`（新規）：

```ts
type ReceiveBody = {
  receivedQuantity: number;
  receivedDate?: string;  // ISO date, default today
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseJson<ReceiveBody>(req);
  // 1. PO を取得、status が confirmed であることを検証
  // 2. receivedQuantity > 0 のバリデーション
  // 3. PO を confirmed → received に更新、receivedQuantity を保存
  //    （PO に receivedQuantity / receivedDate カラムが既に存在するか確認、無ければ追加）
  // 4. StockMovement 行を status=CONFIRMED に更新（実在庫反映）
  //    - quantity は receivedQuantity に上書き（orderedQuantity と乖離する場合あり）
  // 5. refreshCumulativeMaterialRequirements
  // 6. audit("receive_purchase_order", ...)
  // 7. ok
}
```

### 2. PurchaseOrder に receivedQuantity / receivedDate がなければ追加

既存 schema を確認し、無ければ：

```prisma
model PurchaseOrder {
  // ... 既存 ...
  receivedQuantity Float?
  receivedDate     DateTime?
}
```

マイグレーション：`YYYYMMDDXXXX_purchase_order_received_fields/migration.sql`

### 3. Zod 拡張

```ts
export const PurchaseOrderReceiveSchema = z.object({
  receivedQuantity: z.number().positive(),
  receivedDate: z.string().datetime().optional(),
});
```

### 4. 既存 PUT のロジック整理

既存 `PUT /api/purchase-orders/[id]` 内の「status 遷移時の StockMovement 連動」処理を共通関数 `lib/purchase-order-stock-sync.ts` に抽出して、`/confirm`, `/receive` から再利用。**既存 PUT の挙動は変えない**（リファクタのみ）。

### 5. 冪等性

`/confirm` を二度実行 → 二度目は invalid_status エラー（既に confirmed）でレスポンス。エラーでも StockMovement に副作用なし。
`/receive` も同様。

### 6. 監査ログ

新規 action：
- `confirm_purchase_order`（before/after に PO 全体）
- `receive_purchase_order`（after に receivedQuantity/receivedDate を含む）

既存 `audit("update")` は他の任意フィールド更新で引き続き使う。**status 専用遷移とは区別**。

### 7. 統合テスト skip 解除（4-T 連携）

`test/integration/purchase_order_approval.test.ts` の 9 件全部 skip 解除 → pass。

特に：
- candidate → draft 遷移は StockMovement を発行しない（既存 PUT 内の挙動）
- /confirm 二重実行で副作用なし（冪等性）
- /receive で receivedQuantity が PO に保存される
- /confirm で audit_log に confirm_purchase_order 行が追加される

### 8. 既存テストへの影響

既存 + 4-1 解除分 全件 pass。

## 絶対遵守

- 既存 `PUT /api/purchase-orders/[id]` のレスポンスシェイプを壊さない
- 既存 `PurchaseOrder.status` enum 値を維持
- Phase 2-2 で実装した StockMovement.status 連動を壊さない
- マイグレーション時に既存データ（既に confirmed/received な PO）に `receivedQuantity` を埋め戻すロジックは慎重に（推奨：null 許容のままで OK、過去データは null）

## 完了条件

- [ ] `/confirm`, `/receive` API ルート追加
- [ ] `lib/purchase-order-stock-sync.ts` に状態連動ロジック抽出
- [ ] 必要なら `receivedQuantity` / `receivedDate` カラム追加 + マイグレーション
- [ ] 4-T の 9 件統合テスト全部 pass
- [ ] 既存テスト全件 pass
- [ ] `npm run typecheck` clean
- [ ] 既存 `/purchases` 画面で「発注確定」「入荷確定」が動く（手動目視。UI 拡張は 4-U で）

## 報告

300 字以内で：
- 追加した API ルートと監査 action 名
- 抽出した共通関数のシグネチャ
- 追加マイグレーション（あれば）
- 4-T skip 解除件数
- StockMovement.status 連動の動作確認結果
