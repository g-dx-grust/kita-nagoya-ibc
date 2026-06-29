import type { PrismaClient } from "@prisma/client";

const CLEANUP_ORDER = [
  "auditLog",
  "replanJob",
  "replanEvent",
  "productionDailyReportEntry",
  "dailyReportConsumption",
  "dailyReport",
  "invoiceExport",
  "productionPlanAssignment",
  "productionPlanRequirement",
  "productionPlanCandidate",
  "productionPlan",
  "productionPlanBatch",
  "monthlyPlanningRun",
  "productDemand",
  "productMonthlyActual",
  "specialDemandEvent",
  "productEquivalenceGroupItem",
  "purchaseOrder",
  "stockMovement",
  "laborFeeRate",
  "billingPrice",
  "productBomItem",
  "productionCapacity",
  "productAlias",
  "product",
  "productEquivalenceGroup",
  "packagingMaterial",
  "material",
  "supplier",
  "shiftBreak",
  "shift",
  "shiftPattern",
  "employee",
  "workArea",
  "user",
] as const;

export async function cleanupAll(prisma: PrismaClient): Promise<void> {
  for (const model of CLEANUP_ORDER) {
    // @ts-expect-error – dynamic model access for cleanup loop
    await prisma[model].deleteMany();
  }
}

export async function cleanupTables(
  prisma: PrismaClient,
  ...models: Array<(typeof CLEANUP_ORDER)[number]>
): Promise<void> {
  for (const model of models) {
    // @ts-expect-error – dynamic model access for cleanup loop
    await prisma[model].deleteMany();
  }
}
