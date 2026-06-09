/* eslint-disable no-console */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { importProductMonthlyActualsCsv } from "../src/lib/product-monthly-actuals-import";

const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const prisma = new PrismaClient();

async function main() {
  if (!inputPath) {
    console.error("Usage: npm run import:product-monthly-actuals -- ./monthly_actuals.csv");
    process.exitCode = 1;
    return;
  }

  const csvPath = path.resolve(process.cwd(), inputPath);
  const csvText = readFileSync(csvPath, "utf8");
  const result = await importProductMonthlyActualsCsv(prisma, csvText);

  console.log(`月次実績CSV: 取込 ${result.imported} 件 / スキップ ${result.skipped} 件`);
  for (const error of result.errors.slice(0, 20)) {
    console.log(`  row ${error.row}: ${error.reason}`);
  }
  if (result.errors.length > 20) {
    console.log(`  ... +${result.errors.length - 20} 件`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
