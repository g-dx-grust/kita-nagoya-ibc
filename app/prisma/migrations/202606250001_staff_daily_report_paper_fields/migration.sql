-- Staff daily report additions from the current paper manufacturing report.

ALTER TABLE "Product"
ADD COLUMN "rawMaterialLossToleranceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05;

UPDATE "Product"
SET "rawMaterialLossToleranceRate" = 0.08
WHERE "officialName" ILIKE '%NTS%するめ%ソーメン%10%'
   OR COALESCE("displayName", '') ILIKE '%NTS%するめ%ソーメン%10%';

ALTER TABLE "ProductionDailyReportEntry"
ADD COLUMN "pillowManufacturedDate" TIMESTAMP(3),
ADD COLUMN "pillowExpiryDate" TIMESTAMP(3),
ADD COLUMN "packagingLotNumber" TEXT,
ADD COLUMN "fixedCode" TEXT,
ADD COLUMN "ribbonChangeTime" TEXT,
ADD COLUMN "staffSealerCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "staffSetCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "staffReportNote" TEXT,
ADD COLUMN "preCheckExpiryOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "preCheckSealerPressureOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metalDetectorBeforeFe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metalDetectorBeforeSus" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metalDetectorAfterFe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metalDetectorAfterSus" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lossRateReasonNote" TEXT,
ADD COLUMN "lossToleranceRateSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0.05;

ALTER TABLE "ProductionDailyReportEntryMaterial"
ADD COLUMN "lotNumber" TEXT,
ADD COLUMN "expiryDate" TIMESTAMP(3);
