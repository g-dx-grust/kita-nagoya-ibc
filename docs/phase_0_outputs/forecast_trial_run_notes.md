# 月間予測トライアル確認メモ

## 数式確認

- docs/18 §C の例: `700 × 1.25 = 875`
- 既存テストの例: `1000 × (1000 ÷ 800) = 1250`、在庫生産で標準ロット 500 のため `1500` に切り上げ

両方とも「前年対象月実績 × (今年前々月実績 ÷ 前年前々月実績)」で一致する。

## トライアル seed

- `prisma/seed.ts` は、既に商品マスタが 5 件以上ある場合、商品を作り直さずに `productCode` 昇順の上位 N 件へ月次実績だけを投入する。
- N は `MONTHLY_ACTUAL_SEED_PRODUCT_LIMIT` で変更でき、未指定時は 5 件。
- 2024-12 から 2026-05 までの 18 ヶ月分を生成する。
- 上位 4 件目だけ `2025-03` を欠損させ、`/production-plans/monthly` で `実績不足` を確認できる。
- 既存サンプル `P001` / `P002` が対象に含まれる場合、従来の検証値は維持する。
- 前々月前年比モードの予測表は、参照月の月次実績が少なくとも 1 件ある商品だけを表示する。

## CSV

- テンプレート: `/api/export/master-template?type=product-monthly-actuals`
- 取込 API: `/api/import/product-monthly-actuals`
- CLI: `npm run import:product-monthly-actuals -- ./monthly_actuals.csv`

列は `product_code,year_month,actual_quantity,source_type,note`。
