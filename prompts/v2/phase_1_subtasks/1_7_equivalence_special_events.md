# Phase 1-7: 統合グループ・特殊案件マスタ新設

## 使用ツール

Codex

## 位置づけ

1-3 後、1-4 / 1-5 と並列実行可。

## 目的

[`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §Phase 1 1-7 と [`0_3_boundary_decision.md`](../../../docs/phase_0_outputs/0_3_boundary_decision.md) §1-1 に基づき、Phase 8 で使う 3 テーブルを **枠だけ**新設する。

- `product_equivalence_groups`：規格変更グループのヘッダ（70g→80g 等の同一視）
- `product_equivalence_group_items`：メンバーテーブル
- `special_demand_events`：特殊案件（チラシ等）。通常実績から除外する印付け

**Phase 1 では実運用ロジックは作らない**。CRUD と Product との FK だけ。実際の合算予測・除外計算は Phase 8。

## 前提

- 1-1 で追加した `Product.equivalenceGroupId` の FK 先テーブルがここで定義される。1-1 完了後に着手。
- [§7-1 #3](../../../docs/phase_0_outputs/0_3_boundary_decision.md)「請求」と聞こえるチラシ系案件の正式名称が未確定のうちは、`special_demand_events` の初期データは **空のまま**で良い。

## 読むファイル

- `app/prisma/schema.prisma`（model Product, ProductionPlan 周辺）
- `app/src/lib/schemas.ts`
- 1-1 で編集された Product カラム

## やってほしいこと

### 1. Prisma スキーマ追加

```prisma
model ProductEquivalenceGroup {
  id              String    @id @default(cuid())
  name            String
  calculationMode EquivalenceCalculationMode @default(SUM_AS_SAME_PRODUCT)
  active          Boolean   @default(true)
  validFrom       DateTime?
  validTo         DateTime?
  note            String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  items           ProductEquivalenceGroupItem[]
  products        Product[]   // 1-1 で Product.equivalenceGroupId を追加済み
  @@map("product_equivalence_groups")
}

model ProductEquivalenceGroupItem {
  id        String    @id @default(cuid())
  groupId   String
  productId String
  validFrom DateTime?
  validTo   DateTime?
  group     ProductEquivalenceGroup @relation(fields: [groupId], references: [id])
  product   Product   @relation(fields: [productId], references: [id])
  createdAt DateTime  @default(now())
  @@unique([groupId, productId])
  @@map("product_equivalence_group_items")
}

enum EquivalenceCalculationMode {
  SUM_AS_SAME_PRODUCT   // 合算して同一視
  REFERENCE_ONLY        // 参考表示のみ（合算しない）
}

model SpecialDemandEvent {
  id                       String    @id @default(cuid())
  productId                String
  productionPlanCandidate  String?
  customerLabel            String?
  targetYearMonth          String   // "YYYY-MM"
  qty                      Float
  eventType                SpecialDemandEventType
  includeInNormalForecast  Boolean   @default(false)
  status                   SpecialDemandEventStatus @default(DRAFT)
  note                     String?
  validFrom                DateTime?
  validTo                  DateTime?
  active                   Boolean   @default(true)
  product                  Product   @relation(fields: [productId], references: [id])
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt
  @@index([targetYearMonth, productId])
  @@map("special_demand_events")
}

enum SpecialDemandEventType {
  FLYER             // チラシ案件
  SPECIAL_CUSTOMER  // 特定顧客
  CAMPAIGN          // キャンペーン
  OTHER
}

enum SpecialDemandEventStatus {
  DRAFT
  CONFIRMED
  CANCELLED
}
```

1-1 でコメントアウトしていた `Product.equivalenceGroup` リレーション宣言をここで有効化する。

### 2. マイグレーション

`app/prisma/migrations/YYYYMMDDXXXX_equivalence_special_events/migration.sql`

### 3. Zod スキーマ追加

`schemas.ts` に：
- `ProductEquivalenceGroupCreateSchema` / `UpdateSchema`
- `ProductEquivalenceGroupItemCreateSchema`
- `SpecialDemandEventCreateSchema` / `UpdateSchema`
- それぞれの enum 用 Zod

### 4. 最低限の CRUD API

新規 route 追加（既存パターンに揃える）：
- `GET /api/product-equivalence-groups`
- `POST /api/product-equivalence-groups`
- `GET /api/product-equivalence-groups/[id]`
- `PUT /api/product-equivalence-groups/[id]`
- `DELETE /api/product-equivalence-groups/[id]`（ソフトデリート）
- 同様に `/api/product-equivalence-group-items`
- 同様に `/api/special-demand-events`

監査ログ（`audit()`）を全 mutation に入れる。

### 5. テスト

`app/test/integration/equivalence-groups.test.ts`：
- グループ作成 → 商品追加 → 一覧取得 → ソフトデリート
- `Product.equivalenceGroupId` 経由で逆引き取得できる
- 同じ商品を 2 つのグループに入れた場合の挙動（ユニーク制約は `groupId+productId` のみ。商品が複数グループに属するのは許容するか業務判断）

`app/test/integration/special-demand-events.test.ts`：
- 作成・取得・更新・ソフトデリート
- `targetYearMonth` での絞り込み
- `includeInNormalForecast = false` のレコードが通常予測から除外される判定ロジック（純関数で 1 行のフィルタ関数を `lib/special-demand-events.ts` に作って単体テスト）

### 6. seed（任意・初期データ未確定なら空）

§7-1 #3 が確定するまで `special_demand_events` の seed は **空**でよい。テスト用のサンプル 1 件を seed に入れて、Phase 8 で参照できる状態にしておく。

## 絶対遵守

- 既存テーブルは編集しない（ただし 1-1 で予約した `Product.equivalenceGroupId` のリレーション宣言はここで有効化）。
- 既存 API レスポンスを壊さない。
- 「チラシ」「カラーテレビ」等の語をハードコードしない（CLAUDE.md ルール）。
- Phase 8 で使う予測除外・合算ロジックは **ここでは作らない**（テーブルと CRUD だけ）。
- マスタ画面（仕入先・統合グループ等の UI）は触らない（1-U で扱う）。

## 完了条件

- [ ] マイグレーション成功
- [ ] 3 テーブル新設・全 CRUD API 動作
- [ ] テスト全件 pass
- [ ] typecheck 通る
- [ ] Product から equivalenceGroup を include した GET が動く（既存 `/api/products/[id]` のレスポンスに含めるかは API 設計判断。**既存レスポンスを壊さない範囲で**ペイロード追加するなら可）

## 報告

300 字以内で：マイグレーション名、追加した route 一覧、テスト数、特殊案件の予測除外フィルタ関数のシグネチャ。
