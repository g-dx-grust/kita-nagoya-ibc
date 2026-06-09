/* eslint-disable no-console */
// 既存 ProductionDailyReportEntry(単一 materialUsedKg のみ) を複数原料モデルへ移行する。
// 各エントリに子 ProductionDailyReportEntryMaterial を1行作成する。
//   usedKg            = entry.materialUsedKg
//   unitPriceSnapshot = entry.materialUnitCostSnapshot
//   materialId        = null (フリーテキスト。過去行は在庫差引対象にしない)
//   materialName      = 商品BOMの主原料名(あれば) / なければ "(取込)"
// 冪等: 既に子を持つエントリはスキップ。過去行に在庫movementは作らない。
//   Dry-run: npx tsx scripts/backfill-daily-report-materials.ts
//   Apply:   npx tsx scripts/backfill-daily-report-materials.ts --apply
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const entries = await prisma.productionDailyReportEntry.findMany({
    select: { id: true, productId: true, materialUsedKg: true, materialUnitCostSnapshot: true },
  });

  // 既に子を持つエントリ(再実行時)を除外。
  const withMaterials = new Set(
    (
      await prisma.productionDailyReportEntryMaterial.findMany({ select: { entryId: true } })
    ).map((m) => m.entryId),
  );

  // 商品ごとの主原料名(BOMの raw_material 先頭) を解決する。
  const bomItems = await prisma.productBomItem.findMany({
    where: { itemType: "raw_material", active: true },
    select: { productId: true, itemId: true },
  });
  const materials = await prisma.material.findMany({ select: { id: true, name: true } });
  const matName = new Map(materials.map((m) => [m.id, m.name]));
  const primaryMaterialName = new Map<string, string>();
  for (const b of bomItems) {
    if (!primaryMaterialName.has(b.productId)) {
      const name = matName.get(b.itemId);
      if (name) primaryMaterialName.set(b.productId, name);
    }
  }

  const targets = entries.filter((e) => !withMaterials.has(e.id));
  let created = 0;
  for (const e of targets) {
    const materialName =
      (e.productId ? primaryMaterialName.get(e.productId) : null) ?? "(取込)";
    if (APPLY) {
      await prisma.productionDailyReportEntryMaterial.create({
        data: {
          entryId: e.id,
          materialId: null,
          materialName,
          usedKg: e.materialUsedKg ?? 0,
          unitPriceSnapshot: e.materialUnitCostSnapshot ?? 0,
          sortOrder: 0,
        },
      });
    }
    created++;
  }

  console.log(
    `${APPLY ? "APPLIED" : "DRY-RUN"}: entries=${entries.length} alreadyMigrated=${withMaterials.size} created=${created}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
