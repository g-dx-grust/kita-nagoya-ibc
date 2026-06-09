/* eslint-disable no-console */
// Phase 2B: backfill raw-material BOM + Material master from daily-report material usage + products.json.
//   Dry-run: npx tsx scripts/backfill-bom-from-daily.ts
//   Apply:   npx tsx scripts/backfill-bom-from-daily.ts --apply
//
// quantityPerUnit (kg/袋) = median(material_used_kg / production_qty) from daily reports.
// Attributed to the product's PRIMARY raw material (products.json material1).
// - single-material products (93%): exact, complete BOM.
// - multi-material (note flags 要確認), no-material products: skipped -> review CSV.
// Only for products that currently have NO BOM (idempotent: re-checks DB).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const VALID_FROM = new Date("2026-06-08T00:00:00.000Z");

type Rate = { productId: string; name: string; matRate: number | null };

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s && s !== "－" && s !== "-" ? s : null; };
const numOrNull = (v: unknown) => { if (v == null) return null; const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim()); return Number.isFinite(n) ? n : null; };

async function main() {
  const rates = (JSON.parse(readFileSync("/tmp/phase2_rates.json", "utf8")) as Rate[]).filter((r) => r.matRate != null && r.matRate > 0);
  const productsJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../files/products.json"), "utf8")).products as Array<{
    name: string; material1: string | null; material1_unit_price: unknown; material2: string | null; material3: string | null;
  }>;
  const pj = new Map(productsJson.map((p) => [p.name, p]));

  const withBom = new Set((await prisma.productBomItem.findMany({ select: { productId: true } })).map((b) => b.productId));
  const materials = await prisma.material.findMany({ select: { id: true, name: true } });
  const matByName = new Map(materials.map((m) => [m.name.trim(), m.id]));

  const targets = rates.filter((r) => !withBom.has(r.productId));
  const review: Array<{ name: string; reason: string; matRate: number }> = [];
  type Plan = { productId: string; name: string; matName: string; price: number; qty: number; multi: boolean };
  const plans: Plan[] = [];
  for (const t of targets) {
    const p = pj.get(t.name);
    const m1 = p ? clean(p.material1) : null;
    if (!m1) { review.push({ name: t.name, reason: p ? "products.jsonに原料名なし" : "products.json未掲載", matRate: t.matRate! }); continue; }
    const multi = !!(p && (clean(p.material2) || clean(p.material3)));
    if (multi) review.push({ name: t.name, reason: "複数原料(主原料に合算計上)", matRate: t.matRate! });
    plans.push({ productId: t.productId, name: t.name, matName: m1, price: numOrNull(p!.material1_unit_price) ?? 0, qty: t.matRate!, multi });
  }
  const distinctMats = [...new Set(plans.map((p) => p.matName))];
  const newMats = distinctMats.filter((n) => !matByName.has(n));

  console.log("=== Phase 2B: 原料BOM 日報バックフィル ===");
  console.log(`mode: ${APPLY ? "APPLY" : "dry-run"}`);
  console.log(`target products (no BOM, has matRate): ${targets.length}`);
  console.log(`-> BOM rows to create: ${plans.length} (single: ${plans.length - plans.filter((p) => p.multi).length}, multi/flagged: ${plans.filter((p) => p.multi).length})`);
  console.log(`-> new Material masters to create: ${newMats.length} (reuse existing: ${distinctMats.length - newMats.length})`);
  console.log(`-> skipped to review (no material name): ${review.filter((r) => r.reason.includes("なし") || r.reason.includes("未掲載")).length}`);
  console.log("\npreview BOM:");
  for (const p of plans.slice(0, 8)) console.log(`  ${p.qty} kg/袋  原料=${p.matName} (@${p.price})  ${p.multi ? "[複数]" : ""}  ${p.name}`);

  writeFileSync(path.resolve(__dirname, "../../docs/production_bom_review_2026-06-08.json"), JSON.stringify(review, null, 1));
  console.log(`\nreview list -> docs/production_bom_review_2026-06-08.json (${review.length} items)`);

  if (!APPLY) { console.log("\nDry-run only. Re-run with --apply."); return; }

  const result = await prisma.$transaction(async (tx) => {
    // create new materials
    const used = new Set<string>();
    for (const name of newMats) {
      let code = `RML-${fnv1aHex(name)}`; let s = 2;
      while (used.has(code)) code = `RML-${fnv1aHex(name)}-${s++}`;
      used.add(code);
      const price = plans.find((p) => p.matName === name)?.price ?? 0;
      const existing = await tx.material.findFirst({ where: { name } });
      if (existing) { matByName.set(name, existing.id); continue; }
      const m = await tx.material.create({ data: { materialCode: code, name, unit: "kg", standardUnitPrice: price, active: true, validFrom: VALID_FROM } });
      matByName.set(name, m.id);
    }
    let bom = 0;
    for (const p of plans) {
      const matId = matByName.get(p.matName)!;
      await tx.productBomItem.create({
        data: {
          productId: p.productId, itemType: "raw_material", itemId: matId,
          quantityPerUnit: p.qty, unit: "kg", lossRate: 0,
          active: true, validFrom: VALID_FROM,
          note: p.multi ? "日報実績原単位(主原料に合算・複数原料あり・要確認)" : "日報実績原単位(主原料)",
        },
      });
      bom++;
    }
    await tx.auditLog.create({ data: { action: "backfill_bom_from_daily", entityType: "ProductBomItem", afterJson: JSON.stringify({ bomRows: bom, newMaterials: newMats.length }) } });
    return { bom, newMats: newMats.length };
  }, { timeout: 120000 });

  console.log(`\nApplied: ${result.bom} BOM rows, ${result.newMats} new materials.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
