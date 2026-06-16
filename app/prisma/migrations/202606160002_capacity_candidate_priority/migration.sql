ALTER TABLE "ProductionCapacity" ADD COLUMN "candidatePriority" INTEGER;

CREATE INDEX "ProductionCapacity_productId_candidatePriority_idx" ON "ProductionCapacity"("productId", "candidatePriority");
