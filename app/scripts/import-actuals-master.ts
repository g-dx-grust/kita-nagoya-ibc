/* eslint-disable no-console */
//
// Import historical production actuals from files/{products,monthly_summary,daily_reports}.json
// and adopt the 商品リスト (products.json) universe as the production master.
//
//   Dry-run (default):  npx tsx scripts/import-actuals-master.ts
//   Apply:              npx tsx scripts/import-actuals-master.ts --apply
//
// Inputs (prebuilt by the analysis step):
//   /tmp/actuals_dataset.json   { rows:[{name,ym,qty}], distinctNames:[...] }
//   /tmp/verified_merges.json   { "<actualsName>": "<existing KCL productCode>", ... }  (verified same-SKU)
//   ../files/products.json      enrichment (pack_size_g, pack counts, costs) keyed by name
//
// Strategy:
//   - merged names -> attach actuals onto the existing master product (keeps its BOM/capacity/billing)
//   - all other names -> create/upsert a new production-list product (KRL- code)
//   - actuals are aggregated by (resolved productCode, yearMonth) so name-variants SUM, not overwrite
//
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeIdentityText } from "../src/lib/product-classification";
import {
  defaultForecastMethodForProductionType,
  resolveProductProductionType,
} from "../src/lib/product-production-type";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const NEW_SOURCE_SYSTEM = "production_list_xlsx";
const NEW_CODE_PREFIX = "KRL";
const IMPORT_VALID_FROM = new Date("2026-06-08T00:00:00.000Z");

type ActualsRow = { name: string; ym: string; qty: number };
type ProductsJson = {
  products: Array<{
    name: string;
    pack_size_g: number | null;
    pack_count_total: number | null;
    pack_count_cs: number | null;
    material_total?: number | null;
    price?: number | null;
    material1?: string | null;
    material2?: string | null;
    material3?: string | null;
  }>;
};

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function main() {
  const dataset = JSON.parse(readFileSync("/tmp/actuals_dataset.json", "utf8")) as {
    rows: ActualsRow[];
    distinctNames: string[];
  };
  let mergeMap: Record<string, string> = {};
  try {
    mergeMap = JSON.parse(readFileSync("/tmp/verified_merges.json", "utf8"));
  } catch {
    console.warn("WARN: /tmp/verified_merges.json not found — proceeding with NO merges (all names become new products).");
  }
  const productsJson = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../files/products.json"), "utf8"),
  ) as ProductsJson;
  const enrichByName = new Map(productsJson.products.map((p) => [p.name, p]));

  // validate merge targets exist & are active
  const mergeCodes = [...new Set(Object.values(mergeMap))];
  const targets = await prisma.product.findMany({
    where: { productCode: { in: mergeCodes } },
    select: { id: true, productCode: true, active: true },
  });
  const targetByCode = new Map(targets.map((t) => [t.productCode, t]));
  for (const code of mergeCodes) {
    if (!targetByCode.has(code)) throw new Error(`merge target not found: ${code}`);
  }

  // resolve each distinct name -> { kind:'merge', code } | { kind:'new', key, name }
  const resolution = new Map<string, { kind: "merge"; code: string } | { kind: "new"; key: string }>();
  const newByKey = new Map<string, { name: string; key: string }>();
  for (const name of dataset.distinctNames) {
    const merged = mergeMap[name];
    if (merged) {
      resolution.set(name, { kind: "merge", code: merged });
    } else {
      const key = "prl|" + normalizeIdentityText(name);
      resolution.set(name, { kind: "new", key });
      if (!newByKey.has(key)) newByKey.set(key, { name, key });
    }
  }

  console.log("=== 製造実績 取込 (商品リスト採用) ===");
  console.log(`mode: ${APPLY ? "APPLY" : "dry-run"}`);
  console.log(`actuals rows: ${dataset.rows.length} | distinct names: ${dataset.distinctNames.length}`);
  console.log(`merge (onto existing master): ${Object.keys(mergeMap).length} names -> ${mergeCodes.length} products`);
  console.log(`new production-list products to upsert: ${newByKey.size}`);

  if (!APPLY) {
    // preview new product codes + a few
    const preview = [...newByKey.values()].slice(0, 10).map((n) => {
      const code = `${NEW_CODE_PREFIX}-${fnv1aHex(n.key)}`;
      const e = enrichByName.get(n.name);
      return `  ${code}\t${n.name}\tg=${e?.pack_size_g ?? "-"} cs=${e?.pack_count_cs ?? "-"}`;
    });
    console.log("\nnew product preview:\n" + preview.join("\n"));
    console.log("\nDry-run only. Re-run with --apply.");
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // 1) upsert new products, build key -> productId
      const keyToId = new Map<string, string>();
      let created = 0;
      let updatedNew = 0;
      const usedCodes = new Set<string>();
      for (const { name, key } of newByKey.values()) {
        let code = `${NEW_CODE_PREFIX}-${fnv1aHex(key)}`;
        let suffix = 2;
        while (usedCodes.has(code)) code = `${NEW_CODE_PREFIX}-${fnv1aHex(key)}-${suffix++}`;
        usedCodes.add(code);
        const e = enrichByName.get(name);
        const noteLines = [
          `商品リスト(products.json)取込`,
          e ? `原料: ${[e.material1, e.material2, e.material3].filter(Boolean).join(" / ") || "-"}` : null,
          e?.material_total != null ? `材料費(原表): ${e.material_total}` : null,
          e?.price != null ? `売価(原表): ${e.price}` : null,
        ].filter(Boolean) as string[];
        const productionType = resolveProductProductionType({ productName: name });
        const data = {
          officialName: name,
          displayName: name,
          productionType,
          forecastMethod: defaultForecastMethodForProductionType(productionType),
          unit: "袋",
          packSizeG: numOrNull(e?.pack_size_g),
          packCount: intOrNull(e?.pack_count_total),
          casePackQty: numOrNull(e?.pack_count_cs) ?? numOrNull(e?.pack_count_total),
          sourceSystem: NEW_SOURCE_SYSTEM,
          sourceProductKey: key,
          billingEnabled: true,
          usedAtKitagoya: true,
          active: true,
          validFrom: IMPORT_VALID_FROM,
          note: noteLines.join("\n"),
        };
        const existing = await tx.product.findUnique({ where: { sourceProductKey: key }, select: { id: true } });
        if (existing) {
          await tx.product.update({ where: { id: existing.id }, data });
          keyToId.set(key, existing.id);
          updatedNew++;
        } else {
          const p = await tx.product.create({ data: { productCode: code, ...data }, select: { id: true } });
          keyToId.set(key, p.id);
          created++;
        }
      }

      // 2) resolve name -> productId
      const nameToId = new Map<string, string>();
      for (const name of dataset.distinctNames) {
        const r = resolution.get(name)!;
        if (r.kind === "merge") nameToId.set(name, targetByCode.get(r.code)!.id);
        else nameToId.set(name, keyToId.get(r.key)!);
      }

      // 3) aggregate actuals by (productId, ym) — variants SUM
      const agg = new Map<string, { productId: string; ym: string; qty: number }>();
      for (const row of dataset.rows) {
        const pid = nameToId.get(row.name);
        if (!pid) continue;
        const k = pid + "|" + row.ym;
        const cur = agg.get(k);
        if (cur) cur.qty += row.qty;
        else agg.set(k, { productId: pid, ym: row.ym, qty: row.qty });
      }

      // 4) upsert ProductMonthlyActual
      let actualsUpserted = 0;
      for (const { productId, ym, qty } of agg.values()) {
        await tx.productMonthlyActual.upsert({
          where: { productId_yearMonth: { productId, yearMonth: ym } },
          update: { actualQuantity: qty, sourceType: "import", note: "製造実績取込(集計/日報)" },
          create: { productId, yearMonth: ym, actualQuantity: qty, sourceType: "import", note: "製造実績取込(集計/日報)" },
        });
        actualsUpserted++;
      }

      await tx.auditLog.create({
        data: {
          action: "import_production_actuals_master",
          entityType: "Product",
          afterJson: JSON.stringify({
            createdProducts: created,
            updatedProducts: updatedNew,
            mergedNames: Object.keys(mergeMap).length,
            actualsUpserted,
            distinctActualProducts: agg.size === 0 ? 0 : new Set([...agg.values()].map((a) => a.productId)).size,
          }),
        },
      });

      return { created, updatedNew, actualsUpserted, productMonthRows: agg.size };
    },
    { timeout: 120000 },
  );

  console.log("\nApplied:");
  console.log(`  new products created: ${result.created}`);
  console.log(`  new products updated: ${result.updatedNew}`);
  console.log(`  product-month actuals upserted: ${result.actualsUpserted} (rows: ${result.productMonthRows})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
