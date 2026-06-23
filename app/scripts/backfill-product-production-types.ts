/* eslint-disable no-console */

import { Prisma, PrismaClient } from "@prisma/client";
import {
  STOCK_PRODUCTION_PRODUCT_LABELS,
  defaultForecastMethodForProductionType,
  matchedStockProductionProductLabels,
  resolveProductProductionType,
  type ProductMasterProductionType,
} from "../src/lib/product-production-type";

const prisma = new PrismaClient();

type ProductWithAliases = Prisma.ProductGetPayload<{ include: { aliases: true } }>;

type ProductProductionTypePreview = {
  product: ProductWithAliases;
  expectedProductionType: ProductMasterProductionType;
  expectedForecastMethod: "MANUAL" | "NONE";
  matchedLabels: string[];
  productionTypeChanged: boolean;
  forecastMethodChanged: boolean;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { aliases: true },
    orderBy: { productCode: "asc" },
  });
  const previews = products.map(buildPreview);
  const changes = previews.filter((preview) => preview.productionTypeChanged || preview.forecastMethodChanged);
  const stockPreviews = previews.filter((preview) => preview.expectedProductionType === "stock");
  const makeToOrderPreviews = previews.filter((preview) => preview.expectedProductionType === "make_to_order");
  const missingStockLabels = STOCK_PRODUCTION_PRODUCT_LABELS.filter(
    (label) => !stockPreviews.some((preview) => preview.matchedLabels.includes(label)),
  );

  console.log("=== 製品 生産区分補正 ===");
  console.log(`mode: ${apply ? "APPLY" : "dry-run"}`);
  console.log(`active products: ${products.length}`);
  console.log(`expected stock: ${stockPreviews.length}`);
  console.log(`expected make_to_order: ${makeToOrderPreviews.length}`);
  console.log(`changes: ${changes.length}`);
  console.log(`stock labels not found in active products: ${missingStockLabels.length}`);
  if (missingStockLabels.length > 0) {
    for (const label of missingStockLabels) console.log(`  - ${label}`);
  }

  if (stockPreviews.length > 0) {
    console.log("\nstock product matches:");
    for (const preview of stockPreviews.slice(0, 80)) {
      console.log(
        `  ${preview.product.productCode}\t${preview.product.displayName ?? preview.product.officialName}\t${preview.matchedLabels.join(" / ")}`,
      );
    }
    if (stockPreviews.length > 80) console.log(`  ... (+${stockPreviews.length - 80}件)`);
  }

  if (changes.length > 0) {
    console.log("\nchanges:");
    for (const preview of changes.slice(0, 120)) {
      console.log(
        `  ${preview.product.productCode}\t${preview.product.displayName ?? preview.product.officialName}\t` +
          `${preview.product.productionType}/${preview.product.forecastMethod} -> ` +
          `${preview.expectedProductionType}/${preview.expectedForecastMethod}`,
      );
    }
    if (changes.length > 120) console.log(`  ... (+${changes.length - 120}件)`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write to DB.");
    return;
  }

  for (const preview of changes) {
    await prisma.product.update({
      where: { id: preview.product.id },
      data: {
        productionType: preview.expectedProductionType,
        forecastMethod: preview.expectedForecastMethod,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "backfill_product_production_types",
      entityType: "Product",
      beforeJson: JSON.stringify(
        changes.map((preview) => ({
          productCode: preview.product.productCode,
          officialName: preview.product.officialName,
          productionType: preview.product.productionType,
          forecastMethod: preview.product.forecastMethod,
        })),
      ),
      afterJson: JSON.stringify({
        productsUpdated: changes.length,
        expectedStock: stockPreviews.length,
        expectedMakeToOrder: makeToOrderPreviews.length,
        missingStockLabels,
      }),
    },
  });

  console.log("\nApplied:");
  console.log(`  products updated: ${changes.length}`);
}

function buildPreview(product: ProductWithAliases): ProductProductionTypePreview {
  const expectedProductionType = resolveProductProductionType(product);
  const expectedForecastMethod = defaultForecastMethodForProductionType(expectedProductionType);
  const matchedLabels = matchedStockProductionProductLabels(product);
  return {
    product,
    expectedProductionType,
    expectedForecastMethod,
    matchedLabels,
    productionTypeChanged: product.productionType !== expectedProductionType,
    forecastMethodChanged: product.forecastMethod !== expectedForecastMethod,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
