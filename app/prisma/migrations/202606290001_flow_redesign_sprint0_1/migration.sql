-- Sprint 0-1 flow redesign scaffold.
-- New columns are nullable or unused so existing ProductionPlan/StockMovement behavior is unchanged.

-- AlterTable
ALTER TABLE "Material" ADD COLUMN "orderProcessingBufferDays" INTEGER;

-- AlterTable
ALTER TABLE "PackagingMaterial" ADD COLUMN "orderProcessingBufferDays" INTEGER;

-- AlterTable
ALTER TABLE "ProductionPlan" ADD COLUMN "planningRunId" TEXT;
ALTER TABLE "ProductionPlan" ADD COLUMN "planningBatchId" TEXT;

-- AlterTable
ALTER TABLE "ProductDemand" ADD COLUMN "productionPlanId" TEXT;
ALTER TABLE "ProductDemand" ADD COLUMN "productionDueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MonthlyPlanningRun" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "basis" TEXT NOT NULL DEFAULT 'historical_actual',
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adoptedAt" TIMESTAMP(3),
    "sourceSnapshotJson" TEXT,
    "capacitySummaryJson" TEXT,
    "demandSummaryJson" TEXT,
    "materialForecastSnapshotJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanCandidate" (
    "id" TEXT NOT NULL,
    "planningRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "workAreaId" TEXT NOT NULL,
    "roomId" TEXT,
    "demandType" TEXT NOT NULL DEFAULT 'inventory',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" DOUBLE PRECISION,
    "capacityReason" TEXT,
    "materialRisk" TEXT,
    "sourceDemandIdsJson" TEXT NOT NULL DEFAULT '[]',
    "replacesPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlanCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanBatch" (
    "id" TEXT NOT NULL,
    "planningRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "adoptedById" TEXT,
    "adoptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlanBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplanEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetMonth" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplanJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scopeMonth" TEXT,
    "scopeDateFrom" TIMESTAMP(3),
    "scopeDateTo" TIMESTAMP(3),
    "policyJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "diffJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ReplanJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionPlan_planningRunId_idx" ON "ProductionPlan"("planningRunId");

-- CreateIndex
CREATE INDEX "ProductionPlan_planningBatchId_idx" ON "ProductionPlan"("planningBatchId");

-- CreateIndex
CREATE INDEX "ProductDemand_productionPlanId_idx" ON "ProductDemand"("productionPlanId");

-- CreateIndex
CREATE INDEX "ProductDemand_productionDueDate_idx" ON "ProductDemand"("productionDueDate");

-- CreateIndex
CREATE INDEX "MonthlyPlanningRun_yearMonth_status_idx" ON "MonthlyPlanningRun"("yearMonth", "status");

-- CreateIndex
CREATE INDEX "MonthlyPlanningRun_generatedAt_idx" ON "MonthlyPlanningRun"("generatedAt");

-- CreateIndex
CREATE INDEX "ProductionPlanCandidate_planningRunId_idx" ON "ProductionPlanCandidate"("planningRunId");

-- CreateIndex
CREATE INDEX "ProductionPlanCandidate_productId_planDate_idx" ON "ProductionPlanCandidate"("productId", "planDate");

-- CreateIndex
CREATE INDEX "ProductionPlanCandidate_workAreaId_planDate_idx" ON "ProductionPlanCandidate"("workAreaId", "planDate");

-- CreateIndex
CREATE INDEX "ProductionPlanCandidate_replacesPlanId_idx" ON "ProductionPlanCandidate"("replacesPlanId");

-- CreateIndex
CREATE INDEX "ProductionPlanBatch_planningRunId_status_idx" ON "ProductionPlanBatch"("planningRunId", "status");

-- CreateIndex
CREATE INDEX "ReplanEvent_status_targetMonth_idx" ON "ReplanEvent"("status", "targetMonth");

-- CreateIndex
CREATE INDEX "ReplanEvent_sourceType_sourceId_idx" ON "ReplanEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ReplanEvent_createdAt_idx" ON "ReplanEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ReplanJob_eventId_idx" ON "ReplanJob"("eventId");

-- CreateIndex
CREATE INDEX "ReplanJob_status_scopeMonth_idx" ON "ReplanJob"("status", "scopeMonth");

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "MonthlyPlanningRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_planningBatchId_fkey" FOREIGN KEY ("planningBatchId") REFERENCES "ProductionPlanBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanCandidate" ADD CONSTRAINT "ProductionPlanCandidate_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "MonthlyPlanningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanCandidate" ADD CONSTRAINT "ProductionPlanCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanCandidate" ADD CONSTRAINT "ProductionPlanCandidate_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanCandidate" ADD CONSTRAINT "ProductionPlanCandidate_replacesPlanId_fkey" FOREIGN KEY ("replacesPlanId") REFERENCES "ProductionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanBatch" ADD CONSTRAINT "ProductionPlanBatch_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "MonthlyPlanningRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanJob" ADD CONSTRAINT "ReplanJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ReplanEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDemand" ADD CONSTRAINT "ProductDemand_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
