// 日報入力画面用の商品スナップショットは本番DBの往復回数を抑えるため一括取得する。
// 単品取得と同じ計算結果になることを検証する。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestPackagingMaterial,
  createTestProduct,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("日報スナップショット一括取得", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });
  beforeEach(async () => {
    await cleanupAll(prisma);
  });
  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("単品取得と同じ原料単価・資材単価・売値を返す", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      packSizeG: 500,
    });
    const productWithoutBom = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      packSizeG: 250,
    });
    const materialA = await createTestMaterial(prisma, { standardUnitPrice: 100 });
    const materialB = await createTestMaterial(prisma, { standardUnitPrice: 200 });
    const packaging = await createTestPackagingMaterial(prisma, { standardUnitPrice: 5 });

    await prisma.productBomItem.createMany({
      data: [
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: materialA.id,
          quantityPerUnit: 2,
          unit: "kg",
        },
        {
          productId: product.id,
          itemType: "raw_material",
          itemId: materialB.id,
          quantityPerUnit: 1,
          unit: "kg",
        },
        {
          productId: product.id,
          itemType: "packaging",
          itemId: packaging.id,
          quantityPerUnit: 3,
          lossRate: 0.1,
          unit: "枚",
        },
      ],
    });
    await prisma.billingPrice.createMany({
      data: [
        {
          productId: product.id,
          unitPrice: 10,
          unit: "袋",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          productId: product.id,
          unitPrice: 15,
          unit: "袋",
          effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const { loadProductDailyReportSnapshots, loadProductDailyReportSnapshotsForProducts } = await import(
      "@/lib/product-daily-report-service"
    );
    const reportDate = new Date("2026-05-15T00:00:00.000Z");

    const single = await loadProductDailyReportSnapshots(product.id, reportDate);
    const batch = await loadProductDailyReportSnapshotsForProducts(
      [
        { id: product.id, packSizeG: product.packSizeG },
        { id: productWithoutBom.id, packSizeG: productWithoutBom.packSizeG },
      ],
      reportDate,
    );

    expect(batch.get(product.id)).toEqual(single);
    expect(single.capacityG).toBe(500);
    expect(single.materialUnitCostPerKg).toBeCloseTo(133.333, 3);
    expect(single.packageCostPerUnit).toBe(16.5);
    expect(single.unitPrice).toBe(15);
    expect(batch.get(productWithoutBom.id)).toEqual({
      capacityG: 250,
      materialUnitCostPerKg: 0,
      packageCostPerUnit: 0,
      unitPrice: 0,
    });
  });
});
