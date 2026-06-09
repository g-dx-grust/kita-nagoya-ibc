import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Delegate = {
  deleteMany(args?: unknown): Promise<unknown>;
  createMany(args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
};

type TableImportPolicy = {
  table: string;
  model: string;
};

type ProductionSeed = {
  exportedAt: string;
  sourceDb: string;
  policy: {
    kept: string[];
    intentionallyEmpty: string[];
    monthlyActualFilter: string;
  };
  tables: Record<string, Record<string, unknown>[]>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

const seedPath = path.resolve(process.env.PRODUCTION_SEED_PATH ?? path.join(appRoot, "tmp/production-seed.json"));
const shouldWrite = process.argv.includes("--confirm-production-reset");

const importPolicies: TableImportPolicy[] = [
  { table: "User", model: "user" },
  { table: "WorkArea", model: "workArea" },
  { table: "Supplier", model: "supplier" },
  { table: "Material", model: "material" },
  { table: "PackagingMaterial", model: "packagingMaterial" },
  { table: "product_equivalence_groups", model: "productEquivalenceGroup" },
  { table: "Product", model: "product" },
  { table: "ProductAlias", model: "productAlias" },
  { table: "ProductBomItem", model: "productBomItem" },
  { table: "ProductionCapacity", model: "productionCapacity" },
  { table: "BillingPrice", model: "billingPrice" },
  { table: "Employee", model: "employee" },
  { table: "shift_patterns", model: "shiftPattern" },
  { table: "shift_breaks", model: "shiftBreak" },
  { table: "LaborFeeRate", model: "laborFeeRate" },
  { table: "ProductMonthlyActual", model: "productMonthlyActual" },
  { table: "product_equivalence_group_items", model: "productEquivalenceGroupItem" },
];

const transientModelsToClear = [
  "auditLog",
  "invoiceExport",
  "dailyReportConsumption",
  "dailyReport",
  "productionDailyReportEntryMaterial",
  "productionDailyReportEntry",
  "productionPlanAssignment",
  "productionPlanRequirement",
  "productionPlan",
  "shift",
  "productDemand",
  "specialDemandEvent",
  "purchaseOrder",
  "stockMovement",
  "productMonthlyLaborFee",
];

const prisma = new PrismaClient();

async function main() {
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as ProductionSeed;
  const counts = Object.fromEntries(
    importPolicies.map((policy) => [policy.table, seed.tables[policy.table]?.length ?? 0]),
  );

  if (!shouldWrite) {
    // eslint-disable-next-line no-console
    console.log("Dry run only. Re-run with --confirm-production-reset to write to DATABASE_URL.", {
      seedPath,
      exportedAt: seed.exportedAt,
      counts,
      intentionallyEmpty: seed.policy.intentionallyEmpty,
    });
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const model of transientModelsToClear) {
        await delegate(tx, model).deleteMany({});
      }
      for (const policy of [...importPolicies].reverse()) {
        await delegate(tx, policy.model).deleteMany({});
      }
      for (const policy of importPolicies) {
        const rows = seed.tables[policy.table] ?? [];
        if (rows.length === 0) continue;
        const result = await delegate(tx, policy.model).createMany({
          data: rows,
          skipDuplicates: true,
        });
        // eslint-disable-next-line no-console
        console.log(`Inserted ${policy.table}: ${result.count}`);
      }
    },
    { timeout: 120_000 },
  );

  // eslint-disable-next-line no-console
  console.log("Production seed import complete.", {
    seedPath,
    exportedAt: seed.exportedAt,
    intentionallyEmpty: seed.policy.intentionallyEmpty,
  });
}

function delegate(client: unknown, model: string): Delegate {
  const value = (client as Record<string, unknown>)[model];
  if (!value) throw new Error(`Prisma delegate not found: ${model}`);
  return value as Delegate;
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
