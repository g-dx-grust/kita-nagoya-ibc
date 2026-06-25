-- Split daily report and monthly labor fee calculations by work area.

ALTER TABLE "BillingPrice"
ADD COLUMN "workAreaId" TEXT,
ADD COLUMN "workAreaNameSnapshot" TEXT;

ALTER TABLE "BillingPrice"
ADD CONSTRAINT "BillingPrice_workAreaId_fkey"
FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BillingPrice_productId_workAreaId_effectiveFrom_idx"
ON "BillingPrice"("productId", "workAreaId", "effectiveFrom");

ALTER TABLE "ProductionDailyReportEntry"
ADD COLUMN "productionPlanId" TEXT,
ADD COLUMN "workAreaId" TEXT,
ADD COLUMN "workAreaNameSnapshot" TEXT;

ALTER TABLE "ProductionDailyReportEntry"
ADD CONSTRAINT "ProductionDailyReportEntry_workAreaId_fkey"
FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProductionDailyReportEntry_workAreaId_reportDate_idx"
ON "ProductionDailyReportEntry"("workAreaId", "reportDate");

ALTER TABLE "ProductMonthlyLaborFee"
ADD COLUMN "workAreaId" TEXT,
ADD COLUMN "workAreaKey" TEXT NOT NULL DEFAULT 'unassigned',
ADD COLUMN "workAreaNameSnapshot" TEXT;

ALTER TABLE "ProductMonthlyLaborFee"
ADD CONSTRAINT "ProductMonthlyLaborFee_workAreaId_fkey"
FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductMonthlyLaborFee"
DROP CONSTRAINT IF EXISTS "ProductMonthlyLaborFee_productId_yearMonth_key";

DROP INDEX IF EXISTS "ProductMonthlyLaborFee_productId_yearMonth_key";

CREATE UNIQUE INDEX "ProductMonthlyLaborFee_productId_yearMonth_workAreaKey_key"
ON "ProductMonthlyLaborFee"("productId", "yearMonth", "workAreaKey");

CREATE INDEX "ProductMonthlyLaborFee_workAreaId_yearMonth_idx"
ON "ProductMonthlyLaborFee"("workAreaId", "yearMonth");
