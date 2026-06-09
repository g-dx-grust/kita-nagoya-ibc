/* eslint-disable no-console */
// Verify the historical YoY forecast produces a schedule from the imported actuals.
//   npx tsx scripts/verify-forecast.ts 2026-05
import { PrismaClient } from "@prisma/client";
import {
  computeHistoricalMonthlyProductionForecasts,
  getHistoricalForecastReferenceMonths,
} from "../src/lib/monthly-production-forecast";

const prisma = new PrismaClient();
const target = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "2026-05";

async function main() {
  const ref = getHistoricalForecastReferenceMonths(target);
  const months = Object.values(ref);
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { productCode: "asc" } });
  const actuals = await prisma.productMonthlyActual.findMany({ where: { yearMonth: { in: months }, product: { active: true } } });
  const actualProductIds = new Set(actuals.map((a) => a.productId));

  const { forecasts } = computeHistoricalMonthlyProductionForecasts({
    targetMonth: target,
    products: products.map((p) => ({
      productId: p.id,
      productCode: p.productCode,
      productName: p.officialName,
      productionType: p.productionType as never,
      unit: p.unit,
      standardProductionLotSize: p.standardProductionLotSize,
      forecastMethod: p.forecastMethod as never,
    })),
    actuals: actuals.map((a) => ({ productId: a.productId, yearMonth: a.yearMonth, actualQuantity: a.actualQuantity })),
  });

  // only products that have at least one actual in the window are "schedulable" (matches service filter)
  const visible = forecasts.filter((f) => actualProductIds.has(f.productId));
  const byStatus: Record<string, number> = {};
  let totalQty = 0;
  for (const f of visible) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    totalQty += f.forecastQuantity ?? 0;
  }
  console.log(`=== forecast for ${target} (refs: ${JSON.stringify(ref)}) ===`);
  console.log(`active products: ${products.length} | with actuals in window: ${actualProductIds.size}`);
  console.log(`status breakdown:`, JSON.stringify(byStatus));
  console.log(`total forecast quantity (袋): ${Math.round(totalQty)}`);
  const top = visible
    .filter((f) => (f.forecastQuantity ?? 0) > 0)
    .sort((a, b) => (b.forecastQuantity ?? 0) - (a.forecastQuantity ?? 0))
    .slice(0, 15);
  console.log(`\ntop 15 forecast products:`);
  for (const f of top) {
    console.log(`  ${String(Math.round(f.forecastQuantity ?? 0)).padStart(7)}  ${f.forecastBasis ?? ""}  ${f.productName}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
