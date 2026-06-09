# Hotfix: 月間生産予測のトライアル運用化（CSV 取込追加 + トライアル seed + 動作確認）

## 使用ツール

Codex（実装あり）

## ミッション

「**前年度・前年同月・前年前々月の数量から今月の生産量を決める**」予測機能を、**実データを入れて画面で見える状態** にする。3 つのゴール：

1. **検証**：既存予測ロジックが docs/18 §C の数式通り動くことを実データで確認
2. **CSV 一括取込機能を追加**（前年度実績を一括投入する手段）
3. **トライアル seed 拡充**：商品 5〜8 件 × 過去 18 ヶ月分のリアル実績で seed を作り、`/production-plans/monthly` を開いて結果が見える

最終形：ユーザーが `npm run db:seed && npm run dev` → `/production-plans/monthly` を開いて、複数商品の月間生産予測が表示され、reason 文字列で計算根拠が見える状態。

---

## 現状把握（着手前にこの認識を持つこと）

| 要素 | 現状 |
|---|---|
| API CRUD | ✅ `GET/POST /api/product-monthly-actuals`、`PUT/DELETE /[id]` 完備 |
| 手動入力 UI | ✅ `/product-planning` 画面内 `product-planning-client.tsx` にフォームあり |
| CSV インポート API | ❌ **無い**（`api/import/` 配下に product-monthly-actuals 用なし） |
| CSV インポートスクリプト | ❌ **無い**（`scripts/import-*.ts` にもなし） |
| seed | △ 既存 10 件のみ（P001/P002 × 2025-03〜2026-04） |
| 予測ロジック | ✅ `lib/monthly-production-forecast.ts`、テスト 5 件 pass |
| 予測表示画面 | ✅ `/production-plans/monthly` あり |

---

## 必読ファイル

1. [`app/src/lib/monthly-production-forecast.ts`](../../../app/src/lib/monthly-production-forecast.ts) — 予測ロジック
2. [`app/src/lib/monthly-production-forecast.test.ts`](../../../app/src/lib/monthly-production-forecast.test.ts) — 既存テスト 5 件
3. [`app/src/app/api/product-monthly-actuals/route.ts`](../../../app/src/app/api/product-monthly-actuals/route.ts) — CRUD
4. [`app/src/app/api/product-monthly-actuals/[id]/route.ts`](../../../app/src/app/api/product-monthly-actuals/[id]/route.ts)
5. [`app/src/lib/schemas.ts`](../../../app/src/lib/schemas.ts) — `ProductMonthlyActualUpsertSchema` 周辺
6. [`app/src/app/api/import/materials/route.ts`](../../../app/src/app/api/import/materials/route.ts) — 既存 CSV インポートのパターン
7. [`app/src/app/api/export/master-template/route.ts`](../../../app/src/app/api/export/master-template/route.ts) — テンプレ出力のパターン
8. [`app/scripts/import-products.ts`](../../../app/scripts/import-products.ts) — CLI スクリプトのパターン
9. [`app/prisma/seed.ts`](../../../app/prisma/seed.ts) — 既存 seed 構造
10. [`app/src/app/production-plans/monthly/page.tsx`](../../../app/src/app/production-plans/monthly/page.tsx) — 表示画面
11. [`docs/18_implementation_phase_plan.md`](../../../docs/18_implementation_phase_plan.md) §C / §Phase 8 §8-5

---

## Step 1: 数式検証（最初に手計算で確認）

docs/18 §C の例：

```
前年5月 = 700 ケース
今年3月 = 1000、前年3月 = 800 → 前々月前年比 = 1000/800 = 1.25
今年5月予測 = 700 × 1.25 = 875
```

既存テストの例（[`monthly-production-forecast.test.ts`](../../../app/src/lib/monthly-production-forecast.test.ts) 第1 it）：

```
前年5月 = 1000、今年3月 = 1000、前年3月 = 800 → 1.25
予測 = 1000 × 1.25 = 1250
標準ロット 500 で切り上げ丸め → 1500
```

**手計算 → 既存テスト → 実装の挙動** がすべて一致することを確認する。Step 1 では編集なし、確認のみ。一致しない場合はここで一度止まって報告。

---

## Step 2: CSV 取込機能を追加

### 2-1. API ルート新規

`app/src/app/api/import/product-monthly-actuals/route.ts`（新規）

既存 `api/import/materials/route.ts` のパターンを踏襲：

- `POST` で `text/csv` を受け取る
- ヘッダー: `product_code`, `year_month`, `actual_quantity`, `source_type`（オプション、デフォルト `manual`）, `note`（オプション）
- 商品コードから `Product.id` を逆引き
- 重複（productId + yearMonth）は upsert
- バリデーション：
  - `year_month` が `YYYY-MM` 形式
  - `actual_quantity` が 0 以上の数値
  - `source_type` は `manual | import | daily_report` のいずれか
- 失敗行はスキップしてエラー一覧を返す
- レスポンス：`{ ok, imported, skipped, errors: [{ row, reason }] }`
- 監査ログ: `audit("import_product_monthly_actuals", entityType: "ProductMonthlyActual", after: { imported, skipped })`

### 2-2. CSV テンプレ出力

`app/src/app/api/export/master-template/route.ts` に `type=product-monthly-actuals` を追加：

```csv
product_code,year_month,actual_quantity,source_type,note
P001,2025-03,800,manual,
P001,2025-04,900,manual,
```

### 2-3. CLI スクリプト

`app/scripts/import-product-monthly-actuals.ts`（新規）

既存 `scripts/import-products.ts` のパターン：

```bash
tsx scripts/import-product-monthly-actuals.ts ./path/to/actuals.csv
```

`package.json` に `"import:product-monthly-actuals": "tsx scripts/import-product-monthly-actuals.ts"` 追加。

### 2-4. UI ハンドル（最小）

`/product-planning` 画面に「**月次実績 CSV 取込**」ボタンを追加。既存 `master/csv-import.tsx` コンポーネントを使い回せるか確認。位置は既存月次実績入力フォームの **隣**。**デザイン崩しを起こさないことを優先**：

- shadcn コンポーネント新規追加禁止
- 既存 `.toolbar` クラスや既存ボタン式を流用
- アップロードはテキストエリア貼り付け形式で OK（既存 CSV 取込の方式に合わせる）

### 2-5. 統合テスト

`app/test/integration/import-product-monthly-actuals.test.ts`（新規）

- 正常 CSV を取込 → DB に反映、重複は upsert（更新）
- 商品コード未存在は skip + error 返却
- `year_month` フォーマット不正は skip + error
- 負値 `actual_quantity` は skip + error
- 監査ログ 1 行追加

---

## Step 3: トライアル用 seed 拡充

[`app/prisma/seed.ts`](../../../app/prisma/seed.ts) を以下のように拡張する。**既存 seed の構造を壊さない**（既存の deleteMany ブロック・既存商品 P001/P002・既存数値はそのまま）。

### 3-1. 商品マスタ拡充

最低 **5 商品**（既存 P001, P002 + 新規 3 商品）。新規商品例（実在しない曖昧名称はハードコードしない、汎用名で OK）：

```ts
const productA = ... ; // P001 既存
const productB = ... ; // P002 既存
const productC = await prisma.product.create({ data: {
  productCode: "P003", officialName: "サンプル商品C",
  productionType: "stock", unit: "ケース", standardProductionLotSize: 100,
  forecastMethod: "YEAR_RATIO", active: true,
}});
const productD = await prisma.product.create({ data: {
  productCode: "P004", officialName: "サンプル商品D（受注生産）",
  productionType: "make_to_order", unit: "袋", standardProductionLotSize: 0,
  forecastMethod: "MANUAL", active: true,
}});
const productE = await prisma.product.create({ data: {
  productCode: "P005", officialName: "サンプル商品E",
  productionType: "stock", unit: "袋", standardProductionLotSize: 200,
  forecastMethod: "YEAR_RATIO", active: true,
}});
```

### 3-2. ProductMonthlyActual を 18 ヶ月分

各商品について、**2024-12 〜 2026-05 の 18 ヶ月分**を seed する：

- これにより、当月を 2026-05 と仮定したとき：
  - 前年対象月 = 2025-05 ✅
  - 前年-1ヶ月 = 2025-04 ✅
  - 今年-1ヶ月 = 2026-04 ✅
  - 前年-2ヶ月 = 2025-03 ✅
  - 今年-2ヶ月 = 2026-03 ✅
  - **+ 余裕分（季節性が見える）**

数値は**ランダム値でなく業務的にあり得るパターン**（季節変動、トレンド、商品ごとの規模差）。例：

```ts
// 数値ジェネレータ（例：シード固定で再現性を担保）
function genMonthlyActual(baseQty: number, monthOffset: number, seasonality: number[]) {
  const seasonFactor = seasonality[monthOffset % 12] ?? 1.0;
  const trend = 1.0 + (monthOffset * 0.005); // 緩やかな成長
  return Math.round(baseQty * seasonFactor * trend);
}

// 商品C: 基準1200ケース、夏に増える
// 商品D: 受注生産、500前後ばらつき
// 商品E: 基準2000袋、冬に増える
```

### 3-3. forecasted vs insufficient_data の両方を意図的に含める

- 商品 A〜C, E: 全 18 ヶ月分 seed → forecasted
- 商品 D: わざと前年-2ヶ月（2025-03）を抜く → insufficient_data でレポート行が出る

これでユーザーが UI で「データ揃って計算される行」と「データ不足で警告される行」両方を確認できる。

### 3-4. 既存 seed への影響

- 既存 P001/P002 の seed 数量は **変更しない**（既存テストへの影響を避ける）
- 新規追加分のみ追加する

---

## Step 4: 動作確認

### 4-1. 自動テスト

```bash
npm run db:reset          # 全部リセット + 新 seed 適用
npm run typecheck         # clean
npm run test              # 全件 pass
```

新規追加した CSV 取込テストが pass する。

### 4-2. 手動動作確認（dev サーバー）

`npm run dev` で：

- `/product-planning` で月次実績の手動入力フォームと **CSV 取込ボタン** が並んで表示される
- `/production-plans/monthly` で予測モード（前々月前年比）を選び、対象月 2026-05 で生成
- **5 商品分の予測値**が出る
  - 商品 A〜C, E: forecasted + reason 文字列
  - 商品 D: insufficient_data + missingRequiredMonths
- 標準ロット丸めが目視で分かる（rawForecastQuantity と forecastQuantity の差が表示されているはず）
- ロット丸め後の数値がリアルな範囲（100 単位 / 200 単位）

### 4-3. CSV 取込手動確認

`/api/export/master-template?type=product-monthly-actuals` でテンプレ取得 → 1 行追記 → `/product-planning` の取込ボタンで投入 → 反映を確認。

### 4-4. 検証メモ

検証中に気づいた以下を `docs/phase_0_outputs/forecast_trial_run_notes.md`（新規）にまとめる：

- 手計算と実装の一致状況（数式適合性）
- 前年比率の発火例（数値で示す）
- 標準ロット丸めの効果例
- 商品 D で `insufficient_data` がどう見えるか
- 想定外の挙動（あれば）

---

## 絶対遵守

- 既存 41 ユニット + 85 統合テストを **全件 pass 維持**
- 既存 `seed.ts` の deleteMany 順序や既存 P001/P002 の数値を変えない
- 既存 API レスポンスシェイプを壊さない
- `app/src/app/layout.tsx`, `globals.css`, `components/ui/`, `Sidebar.tsx`, `app-nav.tsx` は触らない
- 新規 npm パッケージ追加は無し
- 「カラーテレビ」「トラック部屋」等の文字起こし誤変換語を seed にハードコードしない
- 新規商品名は「サンプル商品X」など一般名で OK

---

## 完了条件

- [ ] `lib/monthly-production-forecast.ts` の数式が docs/18 §C と一致することを手計算で確認した
- [ ] CSV 取込 API ルート追加（`/api/import/product-monthly-actuals`）
- [ ] テンプレ出力に `type=product-monthly-actuals` を追加
- [ ] CLI スクリプト `scripts/import-product-monthly-actuals.ts` 追加
- [ ] `package.json` に `import:product-monthly-actuals` 追加
- [ ] `/product-planning` 画面に CSV 取込ボタン追加（デザイン崩れ無し）
- [ ] 統合テスト `import-product-monthly-actuals.test.ts` 追加 + pass
- [ ] `seed.ts` に商品 3 件（P003〜P005）追加
- [ ] `seed.ts` に各商品の 18 ヶ月分 `ProductMonthlyActual` 追加（商品 D だけ意図的に欠損）
- [ ] `npm run db:reset && npm run test` 全件 pass
- [ ] `npm run dev` → `/production-plans/monthly` で 2026-05 を対象月にしたとき、5 商品分の予測が表示される
- [ ] `docs/phase_0_outputs/forecast_trial_run_notes.md` に検証メモを書く

---

## 報告（500 字以内）

```
## 完了報告: 月間予測トライアル

### 数式検証
- docs/18 §C との一致: ◯ / △ / ×
- 既存テスト 5 件: pass
- 手計算例: <1〜2件記載>

### 追加した実装
- CSV 取込ルート: /api/import/product-monthly-actuals
- テンプレ: type=product-monthly-actuals
- CLI スクリプト: scripts/import-product-monthly-actuals.ts
- UI: /product-planning に取込ボタン
- 統合テスト: <件数>

### Seed 拡充
- 新規商品: P003, P004, P005
- 月次実績: 計 <件数> 件（商品×月数）
- insufficient_data ケース: P004 (2025-03 欠損)

### 動作確認
- /production-plans/monthly で 2026-05 対象に予測表示 ✅
- forecasted 行: <件数>、insufficient_data 行: <件数>
- 標準ロット丸めの確認: <例>

### テスト
- ユニット <N/M> pass、統合 <N/M> pass
- 新規追加テスト <件数>

### 既知の懸念
- (あれば1行)

### 検証メモ
- docs/phase_0_outputs/forecast_trial_run_notes.md
```
