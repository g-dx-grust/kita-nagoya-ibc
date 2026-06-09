/* eslint-disable no-console */
// Phase 2A: backfill ProductionCapacity from daily-report actuals (median).
//   Dry-run: npx tsx scripts/backfill-capacity-from-daily.ts
//   Apply:   npx tsx scripts/backfill-capacity-from-daily.ts --apply
//
// Rate per run = production_qty / (workers * effective_hours). Median over runs.
// Only creates capacity for products that currently have NONE (idempotent: re-checks DB).
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const VALID_FROM = new Date("2026-06-08T00:00:00.000Z");
const DEFAULT_WORK_AREA_NAME = "一般部屋";

type Rate = { productId: string; name: string; capRate: number | null; medWorkers: number | null; medBreak: number | null; nRuns: number };

async function main() {
  const rates = (JSON.parse(readFileSync("/tmp/phase2_rates.json", "utf8")) as Rate[]).filter(
    (r) => r.capRate != null && r.nRuns > 0,
  );
  const workArea = await prisma.workArea.findFirst({ where: { name: DEFAULT_WORK_AREA_NAME } });
  if (!workArea) throw new Error(`work area not found: ${DEFAULT_WORK_AREA_NAME}`);

  // idempotency: which target products already have ANY capacity
  const existing = await prisma.productionCapacity.findMany({ select: { productId: true } });
  const hasCap = new Set(existing.map((e) => e.productId));
  const targets = rates.filter((r) => !hasCap.has(r.productId));

  console.log("=== Phase 2A: 生産能力 日報バックフィル ===");
  console.log(`mode: ${APPLY ? "APPLY" : "dry-run"} | work area: ${workArea.name}`);
  console.log(`derivable products: ${rates.length} | already have capacity: ${rates.length - targets.length} | to create: ${targets.length}`);
  console.log("\npreview:");
  for (const t of targets.slice(0, 10))
    console.log(`  ${String(t.capRate).padStart(7)} 袋/人時 x ${t.medWorkers}人 brk${t.medBreak} (n=${t.nRuns})  ${t.name}`);

  if (!APPLY) { console.log("\nDry-run only. Re-run with --apply."); return; }

  let created = 0;
  for (const t of targets) {
    await prisma.productionCapacity.create({
      data: {
        productId: t.productId,
        workAreaId: workArea.id,
        unitsPerPersonHour: t.capRate!,
        standardPeople: Math.max(1, t.medWorkers ?? 1),
        standardBreakMinutes: t.medBreak ?? 0,
        sourceType: "DAILY_REPORT_MEDIAN",
        reviewStatus: "unreviewed",
        note: `日報実績(中央値)からバックフィル n=${t.nRuns}`,
        active: true,
        validFrom: VALID_FROM,
      },
    });
    created++;
  }
  await prisma.auditLog.create({
    data: {
      action: "backfill_capacity_from_daily",
      entityType: "ProductionCapacity",
      afterJson: JSON.stringify({ created, workArea: workArea.name }),
    },
  });
  console.log(`\nApplied: created ${created} capacities (sourceType=DAILY_REPORT_MEDIAN, reviewStatus=unreviewed).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
