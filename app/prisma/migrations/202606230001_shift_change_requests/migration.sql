CREATE TABLE "shift_change_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestType" TEXT NOT NULL DEFAULT 'staff_month_replace',
    "currentDaysJson" TEXT NOT NULL,
    "requestedDaysJson" TEXT NOT NULL,
    "requestedByToken" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shift_change_requests_status_yearMonth_idx" ON "shift_change_requests"("status", "yearMonth");
CREATE INDEX "shift_change_requests_employeeId_yearMonth_idx" ON "shift_change_requests"("employeeId", "yearMonth");

ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
