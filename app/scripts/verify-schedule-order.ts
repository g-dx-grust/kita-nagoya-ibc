/* eslint-disable no-console */
// Print monthly-schedule suggestions in their actual (priority-aware) order.
//   npx tsx scripts/verify-schedule-order.ts 2026-04
import { loadMonthlyProductionSchedulePreview } from "../src/lib/product-planning-service";

function endOfMonth(ym: string) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)); }

async function main() {
  const target = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "2026-04";
  const preview = await loadMonthlyProductionSchedulePreview({
    dateFrom: new Date(target + "-01T00:00:00.000Z"),
    dateTo: endOfMonth(target),
    planningBasis: "historical_actual",
  });
  console.log(`=== ${target} suggestions order (first 12) ===`);
  preview.suggestions.slice(0, 12).forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. pri=${s.schedulePriority ?? "-"}  ${String(Math.round(s.suggestedQuantity)).padStart(6)}${s.unit}  ${s.productName}`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
