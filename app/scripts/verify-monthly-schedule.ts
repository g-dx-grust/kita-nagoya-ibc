/* eslint-disable no-console */
// Verify the full monthly-schedule PREVIEW pipeline (actuals -> forecast -> suggestions).
//   npx tsx scripts/verify-monthly-schedule.ts 2026-05
import { loadMonthlyProductionSchedulePreview } from "../src/lib/product-planning-service";
import { aggregateMonthlySuggestions } from "../src/lib/monthly-production-schedule";
import { prisma } from "../src/lib/prisma";

function endOfMonth(ym: string) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)); }

async function main() {
  const target = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "2026-05";
  const dateFrom = new Date(target + "-01T00:00:00.000Z");
  const dateTo = endOfMonth(target);

  const preview = await loadMonthlyProductionSchedulePreview({ dateFrom, dateTo, planningBasis: "historical_actual" });
  const items = aggregateMonthlySuggestions(preview.suggestions);
  const totalQty = preview.suggestions.reduce((s, x) => s + x.suggestedQuantity, 0);

  console.log(`=== 月間スケジュール ${target} (basis=historical_actual) ===`);
  console.log(`予測対象(実績あり): ${preview.historicalForecasts.length}品 | 仮予定候補(suggestions): ${preview.suggestions.length}品 | 合算アイテム: ${items.length}`);
  console.log(`提案生産数 合計: ${Math.round(totalQty).toLocaleString()} 袋`);
  console.log(`\n--- 上位15品の月間生産提案 ---`);
  for (const s of [...preview.suggestions].sort((a, b) => b.suggestedQuantity - a.suggestedQuantity).slice(0, 15)) {
    console.log(`  ${String(Math.round(s.suggestedQuantity)).padStart(7)} ${s.unit}  ${s.productName}`);
  }

  // shift availability for the materialize step (day/people assignment)
  const shifts = await prisma.shift.count({ where: { date: { gte: dateFrom, lte: dateTo }, status: { not: "off" } } });
  console.log(`\n対象月のシフト件数: ${shifts}  ${shifts === 0 ? "(0 -> 日別の人員割付は不可。数量スケジュールは出る)" : ""}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
