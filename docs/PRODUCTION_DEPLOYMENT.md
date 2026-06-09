# 本番デプロイ手順 (Vercel + Supabase)

## 方針

- GitHub リポジトリは public のため、SQLite DB、Excel、PDF、CSV/JSON の実データ抽出は commit しない。
- 本番 DB は Supabase PostgreSQL を使う。
- Vercel は `app/` を Root Directory にする。
- 本番初期データはローカルの `app/prisma/dev.db` から `app/tmp/production-seed.json` を生成し、Supabase へ直接 import する。

## 本番初期データの扱い

投入するデータ:

- マスター: `User`, `WorkArea`, `Supplier`, `Material`, `PackagingMaterial`, `Product`, `ProductAlias`, `ProductBomItem`, `ProductionCapacity`, `BillingPrice`, `Employee`, `shift_patterns`, `shift_breaks`, 商品同等グループ系
- 過去実績: `ProductMonthlyActual` のうち `sourceType = 'import'` のもの

空にするデータ:

- テストで入力したシフト: `Shift`
- システム側で試した日報入力: `DailyReport`, `ProductionDailyReportEntry` とその明細
- 予測生産・候補・派生データ: `ProductionPlan`, `ProductionPlanRequirement`, `ProductionPlanAssignment`, `ProductDemand`, `special_demand_events`, `PurchaseOrder`, `StockMovement`, `InvoiceExport`, `AuditLog`, `ProductMonthlyLaborFee`
- 月間予測トライアル seed: `ProductMonthlyActual.sourceType = 'manual'` や `daily_report` は投入しない

## Supabase

1. Supabase で PostgreSQL プロジェクトを作成する。
2. Vercel runtime 用に pooled connection URL を控える。
3. Prisma migration 用に direct/session connection URL を控える。
4. ローカルで以下を実行する。

```bash
cd app
npm ci
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."
npm run db:migrate:deploy
npm run production:seed:export
npm run production:seed:import -- --confirm-production-reset
```

`production:seed:import` は `--confirm-production-reset` がない場合 dry run だけを行う。

## Vercel

Project Settings:

- Framework Preset: Next.js
- Root Directory: `app`
- Install Command: `npm ci`
- Build Command: `npm run build`

Environment Variables:

```env
DATABASE_URL="postgresql://...pooled..."
DIRECT_URL="postgresql://...direct-or-session..."
NEXT_PUBLIC_KITAGOYA_BASE_PATH="/manufacturing/kitanagoya"
NEXT_PUBLIC_KITAGOYA_API_BASE_PATH="/api/kitanagoya"
```

Prisma migration は Vercel build では実行しない。Supabase に対してローカルまたは CI から `npm run db:migrate:deploy` を先に実行する。
