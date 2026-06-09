import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ExportPolicy = {
  table: string;
  where?: string;
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

const sourceDb = path.resolve(process.env.SOURCE_SQLITE_DB ?? path.join(appRoot, "prisma/dev.db"));
const outputPath = path.resolve(process.env.PRODUCTION_SEED_PATH ?? path.join(appRoot, "tmp/production-seed.json"));

const exportPolicies: ExportPolicy[] = [
  { table: "User" },
  { table: "WorkArea" },
  { table: "Supplier" },
  { table: "Material" },
  { table: "PackagingMaterial" },
  { table: "product_equivalence_groups" },
  { table: "Product" },
  { table: "ProductAlias" },
  { table: "ProductBomItem" },
  { table: "ProductionCapacity" },
  { table: "BillingPrice" },
  { table: "Employee" },
  { table: "shift_patterns" },
  { table: "shift_breaks" },
  { table: "LaborFeeRate" },
  {
    table: "ProductMonthlyActual",
    where: `"sourceType" = 'import'`,
  },
  { table: "product_equivalence_group_items" },
];

const intentionallyEmptyTables = [
  "Shift",
  "ProductionPlan",
  "ProductionPlanRequirement",
  "ProductionPlanAssignment",
  "DailyReport",
  "DailyReportConsumption",
  "ProductionDailyReportEntry",
  "ProductionDailyReportEntryMaterial",
  "ProductDemand",
  "special_demand_events",
  "PurchaseOrder",
  "StockMovement",
  "InvoiceExport",
  "AuditLog",
  "ProductMonthlyLaborFee",
];

const dateFieldsByTable: Record<string, string[]> = {
  User: ["createdAt", "updatedAt"],
  WorkArea: ["validFrom", "validTo", "createdAt", "updatedAt"],
  Supplier: ["validFrom", "validTo", "createdAt", "updatedAt"],
  Material: ["validFrom", "validTo", "createdAt", "updatedAt"],
  PackagingMaterial: ["validFrom", "validTo", "createdAt", "updatedAt"],
  product_equivalence_groups: ["validFrom", "validTo", "createdAt", "updatedAt"],
  Product: ["validFrom", "validTo", "createdAt", "updatedAt"],
  ProductBomItem: ["validFrom", "validTo"],
  ProductionCapacity: ["validFrom", "validTo", "reviewedAt"],
  BillingPrice: ["effectiveFrom", "effectiveTo"],
  Employee: ["createdAt", "updatedAt"],
  shift_patterns: ["validFrom", "validTo", "createdAt", "updatedAt"],
  shift_breaks: ["validFrom", "validTo", "createdAt", "updatedAt"],
  LaborFeeRate: ["validFrom", "validTo", "createdAt", "updatedAt"],
  ProductMonthlyActual: ["createdAt", "updatedAt"],
  product_equivalence_group_items: ["validFrom", "validTo", "createdAt"],
};

const booleanFieldsByTable: Record<string, string[]> = {
  User: ["active"],
  WorkArea: ["concurrentOperationAllowed", "active", "externalFlag"],
  Supplier: ["active"],
  Material: ["shelfLifeManaged", "active"],
  PackagingMaterial: ["active"],
  product_equivalence_groups: ["active"],
  Product: ["billingEnabled", "usedAtKitagoya", "active"],
  ProductBomItem: ["active"],
  ProductionCapacity: ["locked", "active"],
  BillingPrice: ["billingTarget"],
  Employee: ["active"],
  shift_patterns: ["overtimeAllowed", "active"],
  shift_breaks: ["active"],
  LaborFeeRate: ["active"],
};

function main() {
  const tables: ProductionSeed["tables"] = {};
  for (const policy of exportPolicies) {
    const rows = readRows(policy).map((row) => normalizeRow(policy.table, row));
    tables[policy.table] = rows;
  }

  const payload: ProductionSeed = {
    exportedAt: new Date().toISOString(),
    sourceDb,
    policy: {
      kept: exportPolicies.map((policy) => policy.table),
      intentionallyEmpty: intentionallyEmptyTables,
      monthlyActualFilter: "ProductMonthlyActual.sourceType = 'import'",
    },
    tables,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  const counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
  // eslint-disable-next-line no-console
  console.log("Exported production seed:", { outputPath, counts });
}

function readRows(policy: ExportPolicy) {
  const sql = `SELECT * FROM "${policy.table}"${policy.where ? ` WHERE ${policy.where}` : ""}`;
  const output = execFileSync("sqlite3", ["-json", sourceDb, sql], { encoding: "utf8" }).trim();
  return output ? (JSON.parse(output) as Record<string, unknown>[]) : [];
}

function normalizeRow(table: string, row: Record<string, unknown>) {
  const normalized = { ...row };
  for (const field of dateFieldsByTable[table] ?? []) {
    normalized[field] = normalizeDate(normalized[field]);
  }
  for (const field of booleanFieldsByTable[table] ?? []) {
    normalized[field] = normalizeBoolean(normalized[field]);
  }
  return normalized;
}

function normalizeDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return value;
}

function normalizeBoolean(value: unknown) {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return value;
}

main();
