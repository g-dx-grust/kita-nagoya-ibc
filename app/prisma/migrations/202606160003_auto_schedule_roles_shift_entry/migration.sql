ALTER TABLE "WorkArea" ADD COLUMN "autoScheduleRole" TEXT NOT NULL DEFAULT 'SHARED';

ALTER TABLE "Employee" ADD COLUMN "shiftEntryToken" TEXT;
ALTER TABLE "Employee" ADD COLUMN "shiftEntryEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Employee_shiftEntryToken_key" ON "Employee"("shiftEntryToken");
