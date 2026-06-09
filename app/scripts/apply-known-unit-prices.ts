/* eslint-disable no-console */
//
// Apply only high-confidence unit prices that can be read from the existing
// "商品リスト" workbook today.
//
// This script intentionally uses a curated whitelist instead of fuzzy matching
// every candidate. A wrong unit price affects cost calculations, so ambiguous
// names should stay at 0 until the client confirms them.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PricePatch = {
  code: string;
  price: number;
  sourceName: string;
  note: string;
};

const MATERIAL_PRICES: PricePatch[] = [
  { code: "XLR-003", price: 2600, sourceName: "燻製さきいか", note: "商品リスト 原料単価" },
  { code: "XLR-006", price: 1650, sourceName: "スライスいかくん", note: "商品リスト 原料単価" },
  { code: "XLR-020", price: 2100, sourceName: "焼いかチーズピロ", note: "商品リスト 原料単価" },
  { code: "XLR-021", price: 3500, sourceName: "鮭チーズピロ", note: "商品リスト 原料単価" },
  { code: "XLR-022", price: 2350, sourceName: "スペシャルチーズ帆立ピロ", note: "商品リスト 原料単価" },
  { code: "XLR-026", price: 824.5, sourceName: "おさつチップ", note: "商品リスト 原料単価" },
  { code: "XLR-029", price: 2580, sourceName: "素焼きマカダミアナッツ", note: "商品リスト 原料単価" },
  { code: "XLR-031", price: 2650, sourceName: "シュリンプヘッド", note: "商品リスト 原料単価" },
  { code: "XLR-037", price: 1490, sourceName: "ココナッツチップ", note: "商品リスト 原料単価" },
  { code: "XLR-041", price: 571.42, sourceName: "ジャイアンツ柿ピーテトラ", note: "商品リスト 原料単価" },
  { code: "XLR-043", price: 1944, sourceName: "揚げ塩ぎんなん", note: "商品リスト 原料単価" },
];

const PACKAGING_PRICES: PricePatch[] = [
  { code: "XLP-002", price: 2.4, sourceName: "乾燥剤10g", note: "商品リスト 乾燥剤単価" },
  { code: "XLP-006", price: 4.95, sourceName: "オイテック", note: "商品リスト 乾燥剤単価" },
  { code: "XLP-009", price: 54.7, sourceName: "KS-1", note: "商品リスト 段ボール単価" },
  { code: "XLP-010", price: 101.2, sourceName: "KS-2", note: "商品リスト 段ボール単価" },
  { code: "XLP-011", price: 80, sourceName: "KS-3", note: "商品リスト 段ボール単価" },
  { code: "XLP-012", price: 42.9, sourceName: "KS-9", note: "商品リスト 段ボール単価" },
  { code: "XLP-016", price: 82, sourceName: "KS-3B", note: "商品リスト 段ボール単価" },
  { code: "XLP-017", price: 64, sourceName: "KS-6小", note: "商品リスト 段ボール単価" },
  { code: "XLP-018", price: 38, sourceName: "KS-323", note: "商品リスト 段ボール単価" },
  { code: "XLP-019", price: 120, sourceName: "KS-2大", note: "商品リスト 段ボール単価" },
  { code: "XLP-025", price: 77, sourceName: "KS-152", note: "商品リスト 段ボール単価" },
  { code: "XLP-031", price: 3.2, sourceName: "TM-204", note: "商品リスト トレー単価" },
  { code: "XLP-032", price: 4.86, sourceName: "TM-506", note: "商品リスト トレー単価" },
  { code: "XLP-033", price: 2.6, sourceName: "TP-825", note: "商品リスト トレー単価" },
  { code: "XLP-043", price: 11.875, sourceName: "合掌無地 240x350", note: "商品リスト 袋単価" },
  { code: "XLP-044", price: 7.425, sourceName: "合掌無地 200x310", note: "商品リスト 袋単価" },
  { code: "XLP-045", price: 9.55, sourceName: "合掌無地 190x285", note: "商品リスト 袋単価" },
  { code: "XLP-046", price: 7.79, sourceName: "三方無地袋 200x310", note: "商品リスト 袋単価" },
  { code: "XLP-050", price: 9.44, sourceName: "浜だより", note: "商品リスト 袋単価" },
  { code: "XLP-067", price: 26.25, sourceName: "つまみの達人", note: "商品リスト 袋単価" },
  { code: "XLP-070", price: 17.4, sourceName: "アルミ4", note: "商品リスト 袋単価" },
  { code: "XLP-071", price: 9.625, sourceName: "PH-29", note: "商品リスト 袋単価" },
];

async function main() {
  const updatedMaterials = await applyMaterialPrices();
  const updatedPackaging = await applyPackagingPrices();

  console.log(JSON.stringify({ updatedMaterials, updatedPackaging }, null, 2));
}

async function applyMaterialPrices() {
  const updated: Record<string, unknown>[] = [];

  for (const patch of MATERIAL_PRICES) {
    const before = await prisma.material.findUnique({ where: { materialCode: patch.code } });
    if (!before) {
      updated.push({ code: patch.code, action: "missing" });
      continue;
    }

    const note = withPriceNote(before.note, patch);
    const after = await prisma.material.update({
      where: { materialCode: patch.code },
      data: { standardUnitPrice: patch.price, note },
    });
    await prisma.auditLog.create({
      data: {
        action: "apply_known_unit_price",
        entityType: "Material",
        entityId: after.id,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
      },
    });
    updated.push({
      code: patch.code,
      name: after.name,
      beforePrice: before.standardUnitPrice,
      afterPrice: after.standardUnitPrice,
      sourceName: patch.sourceName,
    });
  }

  return updated;
}

async function applyPackagingPrices() {
  const updated: Record<string, unknown>[] = [];

  for (const patch of PACKAGING_PRICES) {
    const before = await prisma.packagingMaterial.findUnique({ where: { materialCode: patch.code } });
    if (!before) {
      updated.push({ code: patch.code, action: "missing" });
      continue;
    }

    const note = withPriceNote(before.note, patch);
    const after = await prisma.packagingMaterial.update({
      where: { materialCode: patch.code },
      data: { standardUnitPrice: patch.price, note },
    });
    await prisma.auditLog.create({
      data: {
        action: "apply_known_unit_price",
        entityType: "PackagingMaterial",
        entityId: after.id,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
      },
    });
    updated.push({
      code: patch.code,
      name: after.name,
      beforePrice: before.standardUnitPrice,
      afterPrice: after.standardUnitPrice,
      sourceName: patch.sourceName,
    });
  }

  return updated;
}

function withPriceNote(current: string | null, patch: PricePatch) {
  const marker = `単価反映: ${patch.note}「${patch.sourceName}」`;
  if (current?.includes(marker)) return current;
  return [current, marker].filter(Boolean).join(" / ");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
