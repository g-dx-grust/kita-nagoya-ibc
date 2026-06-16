ALTER TABLE "ProductionDailyReportEntry" ADD COLUMN "inventoryReflected" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ProductionDailyReportEntry"
SET "inventoryReflected" = false
WHERE "approvalStatus" <> 'approved';
