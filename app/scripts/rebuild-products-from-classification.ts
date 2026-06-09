/* eslint-disable no-console */
//
// Rebuild Product master from docs/商品分類表 共有.xlsx.
//
// Default is dry-run:
//   npm run rebuild:products:classification
//
// Apply to the configured DATABASE_URL:
//   npm run rebuild:products:classification -- --apply
//
// Existing products are not deleted. They are deactivated so historical plans,
// daily reports, and stock movements keep their old productId references.

import path from "node:path";
import * as XLSX from "xlsx";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  PRODUCT_CLASSIFICATION_SOURCE_SYSTEM,
  buildProductClassificationProducts,
  isProductClassificationSheet,
  parseProductClassificationSheet,
  type ProductClassificationProduct,
  type ProductClassificationCell,
} from "../src/lib/product-classification";

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = path.resolve(__dirname, "../../docs/商品分類表 共有.xlsx");
const APPLY = process.argv.includes("--apply");
const IMPORT_VALID_FROM = new Date("2026-06-08T00:00:00.000Z");

async function main() {
  const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const xlsxPath = path.resolve(process.cwd(), cliPath ?? DEFAULT_XLSX_PATH);
  const workbook = XLSX.readFile(xlsxPath);
  const rows = workbook.SheetNames.flatMap((sheetName) => {
    if (!isProductClassificationSheet(sheetName)) return [];
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    return parseProductClassificationSheet(sheetName, values as ProductClassificationCell[][]);
  });
  const products = buildProductClassificationProducts(rows);
  const duplicateRows = products.reduce((sum, product) => sum + product.duplicateSources.length, 0);

  const existing = await prisma.product.findMany({
    select: {
      id: true,
      productCode: true,
      officialName: true,
      active: true,
      sourceProductKey: true,
      sourceSystem: true,
      usedAtKitagoya: true,
    },
  });
  const currentKeys = new Set(products.map((product) => product.sourceProductKey));
  const currentCodeSet = new Set(products.map((product) => product.productCode));
  const codeConflicts = existing.filter(
    (product) =>
      currentCodeSet.has(product.productCode) &&
      product.sourceProductKey &&
      !currentKeys.has(product.sourceProductKey),
  );
  const existingCurrent = existing.filter((product) => product.sourceProductKey && currentKeys.has(product.sourceProductKey));
  const existingOldActive = existing.filter((product) => product.active && !currentKeys.has(product.sourceProductKey ?? ""));

  console.log("=== 商品分類表 再構築 ===");
  console.log(`mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`xlsx: ${xlsxPath}`);
  console.log(`classification rows: ${rows.length}`);
  console.log(`unique products: ${products.length}`);
  console.log(`duplicate source rows merged: ${duplicateRows}`);
  console.log(`existing products: ${existing.length}`);
  console.log(`existing current-source products to update: ${existingCurrent.length}`);
  console.log(`active old products to deactivate: ${existingOldActive.length}`);
  console.log(`code conflicts: ${codeConflicts.length}`);

  if (codeConflicts.length > 0) {
    for (const conflict of codeConflicts.slice(0, 20)) {
      console.log(`  conflict ${conflict.productCode}: ${conflict.officialName}`);
    }
    throw new Error("Generated product codes conflict with unrelated existing products.");
  }

  console.log("\nPreview:");
  for (const product of products.slice(0, 12)) {
    console.log(
      `  ${product.productCode}\t${product.officialName}\t${product.sheetName}:${product.rowNumber}`,
    );
  }
  if (products.length > 12) console.log(`  ... (+${products.length - 12}件)`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to update the database.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    let deactivated = 0;
    let created = 0;
    let updated = 0;

    for (const product of existingOldActive) {
      await tx.product.update({
        where: { id: product.id },
        data: {
          active: false,
          usedAtKitagoya: false,
          validTo: IMPORT_VALID_FROM,
        },
      });
      deactivated++;
    }

    for (const product of products) {
      const data = buildProductData(product);
      const existingProduct = await tx.product.findUnique({
        where: { sourceProductKey: product.sourceProductKey },
        select: { id: true },
      });

      if (existingProduct) {
        await tx.product.update({ where: { id: existingProduct.id }, data });
        await replaceAliases(tx, existingProduct.id, buildAliases(product));
        updated++;
      } else {
        const createdProduct = await tx.product.create({
          data: {
            ...data,
            aliases: { create: buildAliases(product).map((aliasName) => ({ aliasName })) },
          },
          select: { id: true },
        });
        created++;
        await tx.auditLog.create({
          data: {
            action: "create_from_product_classification",
            entityType: "Product",
            entityId: createdProduct.id,
            afterJson: JSON.stringify({ productCode: product.productCode, officialName: product.officialName }),
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        action: "rebuild_products_from_classification",
        entityType: "Product",
        afterJson: JSON.stringify({ created, updated, deactivated, sourceRows: rows.length, uniqueProducts: products.length }),
      },
    });

    return { created, updated, deactivated };
  });

  console.log("\nApplied:");
  console.log(`  created: ${result.created}`);
  console.log(`  updated: ${result.updated}`);
  console.log(`  deactivated old products: ${result.deactivated}`);
}

function buildProductData(product: ProductClassificationProduct) {
  return {
    productCode: product.productCode,
    officialName: product.officialName,
    displayName: product.productName,
    productionType: "stock",
    forecastMethod: "MANUAL",
    equivalenceGroupId: null,
    safetyStockQuantity: 0,
    standardProductionLotSize: 0,
    unit: "袋",
    packSizeG: product.packSizeG,
    packCount: toIntOrNull(product.packCountQuantity),
    casePackQty: product.packCountQuantity,
    category: product.category,
    sourceSystem: PRODUCT_CLASSIFICATION_SOURCE_SYSTEM,
    sourceProductKey: product.sourceProductKey,
    sourceSheetName: product.sheetName,
    sourceRowNumber: product.rowNumber,
    specification: product.specification,
    packCountExpression: product.packCountExpression,
    bundleCount: product.bundleCount,
    brandName: product.brandName,
    bagTrayName: product.bagTrayName,
    cartonName: product.cartonName,
    accessoryName: product.accessoryName,
    sealCount: product.sealCount,
    classificationNote: product.classificationNote,
    rawMaterialNote: product.rawMaterialNote,
    defaultWorkAreaId: null,
    billingEnabled: true,
    usedAtKitagoya: true,
    active: true,
    validFrom: IMPORT_VALID_FROM,
    validTo: null,
    note: buildNote(product),
  };
}

function buildAliases(product: ProductClassificationProduct): string[] {
  return [product.productName, product.officialName]
    .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    .filter((value) => value !== product.officialName);
}

async function replaceAliases(
  tx: Prisma.TransactionClient,
  productId: string,
  aliases: string[],
) {
  await tx.productAlias.deleteMany({ where: { productId } });
  if (aliases.length > 0) {
    await tx.productAlias.createMany({
      data: aliases.map((aliasName) => ({ productId, aliasName })),
    });
  }
}

function buildNote(product: ProductClassificationProduct): string {
  const lines = [
    `商品分類表 共有.xlsx 取込: ${product.sheetName} ${product.rowNumber}行目`,
    product.duplicateSources.length > 0
      ? `重複統合: ${product.duplicateSources.map((source) => `${source.sheetName} ${source.rowNumber}行目`).join(" / ")}`
      : null,
    product.bagTrayName ? `袋、トレー: ${product.bagTrayName}` : null,
    product.cartonName ? `ダンボール: ${product.cartonName}` : null,
    product.accessoryName ? `備品: ${product.accessoryName}` : null,
    product.sealCount != null ? `シール: ${product.sealCount}` : null,
    product.rawMaterialNote ? `原料: ${product.rawMaterialNote}` : null,
    product.classificationNote ? `備考: ${product.classificationNote}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function toIntOrNull(value: number | null): number | null {
  if (value == null) return null;
  return Number.isInteger(value) ? value : Math.trunc(value);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
