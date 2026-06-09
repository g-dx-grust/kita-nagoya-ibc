-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaType" TEXT NOT NULL,
    "defaultStartTime" TEXT,
    "defaultEndTime" TEXT,
    "maxPeopleCount" INTEGER NOT NULL DEFAULT 4,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "equipmentKind" TEXT NOT NULL DEFAULT 'ROOM',
    "concurrentOperationAllowed" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalFlag" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "displayName" TEXT,
    "productionType" TEXT NOT NULL,
    "forecastMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "equivalenceGroupId" TEXT,
    "safetyStockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "standardProductionLotSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "schedulePriority" INTEGER,
    "unit" TEXT NOT NULL DEFAULT '袋',
    "packSizeG" DOUBLE PRECISION,
    "packCount" INTEGER,
    "casePackQty" DOUBLE PRECISION,
    "category" TEXT,
    "sourceSystem" TEXT,
    "sourceProductKey" TEXT,
    "sourceSheetName" TEXT,
    "sourceRowNumber" INTEGER,
    "specification" TEXT,
    "packCountExpression" TEXT,
    "bundleCount" TEXT,
    "brandName" TEXT,
    "bagTrayName" TEXT,
    "cartonName" TEXT,
    "accessoryName" TEXT,
    "sealCount" DOUBLE PRECISION,
    "classificationNote" TEXT,
    "rawMaterialNote" TEXT,
    "defaultWorkAreaId" TEXT,
    "billingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "usedAtKitagoya" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "standardUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "safetyStockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderLotQty" DOUBLE PRECISION,
    "minOrderQty" DOUBLE PRECISION,
    "shelfLifeManaged" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingMaterial" (
    "id" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "unit" TEXT NOT NULL DEFAULT '枚',
    "casePackQty" DOUBLE PRECISION,
    "standardUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "safetyStockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderLotQty" DOUBLE PRECISION,
    "minOrderQty" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "orderingUnit" TEXT,
    "closingInfo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBomItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "lossRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mixRatio" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ProductBomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCapacity" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workAreaId" TEXT NOT NULL,
    "unitsPerPersonHour" DOUBLE PRECISION NOT NULL,
    "standardPeople" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "standardBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "reviewMemo" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "billingTarget" BOOLEAN NOT NULL DEFAULT true,
    "externalCode" TEXT,
    "note" TEXT,

    CONSTRAINT "BillingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'own',
    "affiliation" TEXT,
    "defaultStartTime" TEXT NOT NULL DEFAULT '09:00',
    "defaultEndTime" TEXT NOT NULL DEFAULT '17:00',
    "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_patterns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "overtimeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" TEXT NOT NULL,
    "shiftPatternId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "shiftPatternId" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "productionType" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "workAreaId" TEXT NOT NULL,
    "plannedStartTime" TEXT NOT NULL,
    "plannedEndTime" TEXT,
    "desiredEndTime" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "plannedPeopleCount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "overflowQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "estUnitsPerPersonHour" DOUBLE PRECISION,
    "estLaborCost" DOUBLE PRECISION,
    "estMaterialCost" DOUBLE PRECISION,
    "estPackagingCost" DOUBLE PRECISION,
    "estTotalCost" DOUBLE PRECISION,
    "baselineEndTime" TEXT NOT NULL DEFAULT '17:00',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanRequirement" (
    "id" TEXT NOT NULL,
    "productionPlanId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "onHandQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmedInbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unconfirmedInbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortageQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortageType" TEXT NOT NULL DEFAULT 'none',
    "unitPriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionPlanRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanAssignment" (
    "id" TEXT NOT NULL,
    "productionPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "moveAfterPlanId" TEXT,

    CONSTRAINT "ProductionPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT,
    "movementType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "unitPrice" DOUBLE PRECISION,
    "note" TEXT,
    "expiryDate" TIMESTAMP(3),
    "shippingDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierId" TEXT,
    "orderedQuantity" DOUBLE PRECISION NOT NULL,
    "confirmedQuantity" DOUBLE PRECISION,
    "expectedArrivalDate" TIMESTAMP(3),
    "shortageDate" TIMESTAMP(3),
    "recommendedOrderDate" TIMESTAMP(3),
    "urgency" TEXT NOT NULL DEFAULT 'NONE',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "receivedQuantity" DOUBLE PRECISION,
    "receivedDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDemand" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "demandType" TEXT NOT NULL DEFAULT 'order',
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "customerName" TEXT,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMonthlyActual" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMonthlyActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborFeeRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborFeeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDailyReportEntry" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "normalizedProductName" TEXT NOT NULL,
    "productMatchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "expiryDate" TIMESTAMP(3),
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workerCount" DOUBLE PRECISION NOT NULL,
    "productionQty" DOUBLE PRECISION NOT NULL,
    "materialUsedKg" DOUBLE PRECISION NOT NULL,
    "laborFeeRateId" TEXT,
    "note" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceSheetName" TEXT,
    "sourceRowNumber" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" TEXT NOT NULL DEFAULT 'approved',
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "labelPhotosJson" TEXT NOT NULL DEFAULT '[]',
    "capacityGSnapshot" DOUBLE PRECISION,
    "materialUnitCostSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packageCostPerUnitSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborHourlyRateSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatingMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOperatingMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perHourQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perUnitTimeMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborFeePerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bagWeightG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lossRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationWarnings" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionDailyReportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDailyReportEntryMaterial" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "materialCode" TEXT,
    "usedKg" DOUBLE PRECISION NOT NULL,
    "unitPriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mixRatio" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionDailyReportEntryMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMonthlyLaborFee" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "perBagLaborFee" DOUBLE PRECISION NOT NULL,
    "avgPerHourQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedBillingPriceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMonthlyLaborFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_equivalence_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calculationMode" TEXT NOT NULL DEFAULT 'SUM_AS_SAME_PRODUCT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_equivalence_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_equivalence_group_items" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_equivalence_group_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_demand_events" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productionPlanCandidate" TEXT,
    "customerLabel" TEXT,
    "targetYearMonth" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "eventType" TEXT NOT NULL,
    "includeInNormalForecast" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_demand_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "productionPlanId" TEXT NOT NULL,
    "actualStartTime" TEXT,
    "actualEndTime" TEXT,
    "actualBreakMinutes" INTEGER,
    "actualPeopleCount" DOUBLE PRECISION,
    "actualQuantity" DOUBLE PRECISION,
    "actualLaborCost" DOUBLE PRECISION,
    "actualMaterialCost" DOUBLE PRECISION,
    "actualPackagingCost" DOUBLE PRECISION,
    "actualTotalCost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportConsumption" (
    "id" TEXT NOT NULL,
    "dailyReportId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL,
    "unitPriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceExport" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "exportedBy" TEXT,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkArea_name_key" ON "WorkArea"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "Product"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sourceProductKey_key" ON "Product"("sourceProductKey");

-- CreateIndex
CREATE INDEX "Product_equivalenceGroupId_idx" ON "Product"("equivalenceGroupId");

-- CreateIndex
CREATE INDEX "Product_sourceSystem_sourceProductKey_idx" ON "Product"("sourceSystem", "sourceProductKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_productId_aliasName_key" ON "ProductAlias"("productId", "aliasName");

-- CreateIndex
CREATE UNIQUE INDEX "Material_materialCode_key" ON "Material"("materialCode");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingMaterial_materialCode_key" ON "PackagingMaterial"("materialCode");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "ProductBomItem_productId_idx" ON "ProductBomItem"("productId");

-- CreateIndex
CREATE INDEX "ProductBomItem_itemType_itemId_idx" ON "ProductBomItem"("itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCapacity_productId_workAreaId_key" ON "ProductionCapacity"("productId", "workAreaId");

-- CreateIndex
CREATE INDEX "BillingPrice_productId_effectiveFrom_idx" ON "BillingPrice"("productId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "shift_breaks_shiftPatternId_startTime_idx" ON "shift_breaks"("shiftPatternId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_employeeId_date_key" ON "Shift"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ProductionPlan_date_idx" ON "ProductionPlan"("date");

-- CreateIndex
CREATE INDEX "ProductionPlan_workAreaId_date_idx" ON "ProductionPlan"("workAreaId", "date");

-- CreateIndex
CREATE INDEX "ProductionPlanRequirement_productionPlanId_idx" ON "ProductionPlanRequirement"("productionPlanId");

-- CreateIndex
CREATE INDEX "StockMovement_itemType_itemId_effectiveDate_idx" ON "StockMovement"("itemType", "itemId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_sourceType_sourceId_movementType_key" ON "StockMovement"("sourceType", "sourceId", "movementType");

-- CreateIndex
CREATE INDEX "PurchaseOrder_itemType_itemId_status_idx" ON "PurchaseOrder"("itemType", "itemId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_shortageDate_idx" ON "PurchaseOrder"("status", "shortageDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_urgency_recommendedOrderDate_idx" ON "PurchaseOrder"("urgency", "recommendedOrderDate");

-- CreateIndex
CREATE INDEX "ProductDemand_productId_dueDate_idx" ON "ProductDemand"("productId", "dueDate");

-- CreateIndex
CREATE INDEX "ProductDemand_status_dueDate_idx" ON "ProductDemand"("status", "dueDate");

-- CreateIndex
CREATE INDEX "ProductMonthlyActual_yearMonth_idx" ON "ProductMonthlyActual"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMonthlyActual_productId_yearMonth_key" ON "ProductMonthlyActual"("productId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "LaborFeeRate_code_key" ON "LaborFeeRate"("code");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntry_reportDate_idx" ON "ProductionDailyReportEntry"("reportDate");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntry_productId_reportDate_idx" ON "ProductionDailyReportEntry"("productId", "reportDate");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntry_normalizedProductName_idx" ON "ProductionDailyReportEntry"("normalizedProductName");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntry_sourceType_sourceSheetName_sourc_idx" ON "ProductionDailyReportEntry"("sourceType", "sourceSheetName", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntryMaterial_entryId_idx" ON "ProductionDailyReportEntryMaterial"("entryId");

-- CreateIndex
CREATE INDEX "ProductionDailyReportEntryMaterial_materialId_idx" ON "ProductionDailyReportEntryMaterial"("materialId");

-- CreateIndex
CREATE INDEX "ProductMonthlyLaborFee_yearMonth_idx" ON "ProductMonthlyLaborFee"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMonthlyLaborFee_productId_yearMonth_key" ON "ProductMonthlyLaborFee"("productId", "yearMonth");

-- CreateIndex
CREATE INDEX "product_equivalence_group_items_productId_idx" ON "product_equivalence_group_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_equivalence_group_items_groupId_productId_key" ON "product_equivalence_group_items"("groupId", "productId");

-- CreateIndex
CREATE INDEX "special_demand_events_targetYearMonth_productId_idx" ON "special_demand_events"("targetYearMonth", "productId");

-- CreateIndex
CREATE INDEX "special_demand_events_productId_idx" ON "special_demand_events"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_productionPlanId_key" ON "DailyReport"("productionPlanId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultWorkAreaId_fkey" FOREIGN KEY ("defaultWorkAreaId") REFERENCES "WorkArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_equivalenceGroupId_fkey" FOREIGN KEY ("equivalenceGroupId") REFERENCES "product_equivalence_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingMaterial" ADD CONSTRAINT "PackagingMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBomItem" ADD CONSTRAINT "ProductBomItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCapacity" ADD CONSTRAINT "ProductionCapacity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCapacity" ADD CONSTRAINT "ProductionCapacity_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPrice" ADD CONSTRAINT "BillingPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shiftPatternId_fkey" FOREIGN KEY ("shiftPatternId") REFERENCES "shift_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_shiftPatternId_fkey" FOREIGN KEY ("shiftPatternId") REFERENCES "shift_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanRequirement" ADD CONSTRAINT "ProductionPlanRequirement_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanAssignment" ADD CONSTRAINT "ProductionPlanAssignment_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanAssignment" ADD CONSTRAINT "ProductionPlanAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDemand" ADD CONSTRAINT "ProductDemand_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMonthlyActual" ADD CONSTRAINT "ProductMonthlyActual_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyReportEntry" ADD CONSTRAINT "ProductionDailyReportEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyReportEntry" ADD CONSTRAINT "ProductionDailyReportEntry_laborFeeRateId_fkey" FOREIGN KEY ("laborFeeRateId") REFERENCES "LaborFeeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyReportEntryMaterial" ADD CONSTRAINT "ProductionDailyReportEntryMaterial_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ProductionDailyReportEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyReportEntryMaterial" ADD CONSTRAINT "ProductionDailyReportEntryMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMonthlyLaborFee" ADD CONSTRAINT "ProductMonthlyLaborFee_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_equivalence_group_items" ADD CONSTRAINT "product_equivalence_group_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_equivalence_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_equivalence_group_items" ADD CONSTRAINT "product_equivalence_group_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_demand_events" ADD CONSTRAINT "special_demand_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportConsumption" ADD CONSTRAINT "DailyReportConsumption_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

