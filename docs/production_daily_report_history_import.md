# 北名古屋 製造日報履歴取込

`北名古屋製造報告 .xlsx` の月別シートを、`/production-daily-reports` の履歴日報として取り込む。

## 方針

- `ProductionDailyReportEntry` に `sourceType = excel_history` で保存する。
- `approvalStatus = approved` で一覧・集計には出す。
- `inventoryReflected = false` にして、在庫台帳 `StockMovement` は作らない。
- Excel内の数式結果（稼動時間、手間賃、原価、売値、利率など）は当時の履歴スナップショットとして保存する。
- `2025.9` など別月が混ざるシートがあるため、シート名ではなく `日付` 列を正とする。
- 同一内容の重複行は取り込み前に除外し、複数シートにある場合は日付月と一致するシートの行を優先する。
- 未来日付は既定で除外する。境界日は実行日で、必要に応じて `--max-date=YYYY-MM-DD` で指定する。

## 実行

Dry run:

```bash
cd app
npm run import:kitanagoya-daily-history
```

DBへ反映:

```bash
cd app
npm run import:kitanagoya-daily-history -- --apply --replace-history
```

一部シートだけ:

```bash
cd app
npm run import:kitanagoya-daily-history -- --sheets=2026.4,2026.5,2026.6 --apply --replace-history
```

未来日付の境界を固定する場合:

```bash
cd app
npm run import:kitanagoya-daily-history -- --max-date=2026-06-16 --apply --replace-history
```

`--replace-history` は同じ対象シート由来の `excel_history` 行を入れ直す。履歴行は在庫未反映のため、再取込しても原料・資材・商品在庫の二重差引は発生しない。
