// 日報蓄積(B=ProductionDailyReportEntry)の在庫差引: 複数原料・資材BOM自動・フリーテキストスキップ・
// 編集での置換・削除での戻し。実績在庫の正は B。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestPackagingMaterial,
  createTestProduct,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("日報蓄積(B) 在庫差引", () => {
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

  async function setup() {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const m1 = await createTestMaterial(prisma, { standardUnitPrice: 100 });
    const m2 = await createTestMaterial(prisma, { standardUnitPrice: 200 });
    const pkg = await createTestPackagingMaterial(prisma, { standardUnitPrice: 5 });
    // 資材BOM: 1製品あたり1枚。原料はBはユーザー入力なのでBOMは作らない。
    await prisma.productBomItem.create({
      data: { productId: product.id, itemType: "packaging", itemId: pkg.id, quantityPerUnit: 1, unit: "枚" },
    });
    return { product, m1, m2, pkg };
  }

  function baseInput(productId: string) {
    return {
      reportDate: "2026-05-10",
      productId,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      workerCount: 1,
      productionQty: 100,
    };
  }

  it("複数原料 + 資材BOM自動 + 製品入荷を在庫へ反映する", async () => {
    const { product, m1, m2, pkg } = await setup();
    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");

    const entry = await createProductDailyReportEntry({
      ...baseInput(product.id),
      materials: [
        { materialId: m1.id, materialName: m1.name, usedKg: 30 },
        { materialId: m2.id, materialName: m2.name, usedKg: 10 },
      ],
    });

    // 原料原価 = 30*100 + 10*200 = 5000。
    expect(entry!.materialCost).toBe(5000);
    expect(entry!.materialUsedKg).toBe(40);

    const mv = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", status: "CONFIRMED" } as any,
    });
    expect(mv).toHaveLength(4); // 原料2 + 資材1 + 製品1
    expect(mv).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: "raw_material", itemId: m1.id, quantity: -30 }),
        expect.objectContaining({ itemType: "raw_material", itemId: m2.id, quantity: -10 }),
        expect.objectContaining({ itemType: "packaging", itemId: pkg.id, quantity: -100 }),
        expect.objectContaining({ itemType: "product", itemId: product.id, quantity: 100 }),
      ]),
    );
  });

  it("スタッフ提出は未計上で保存し、管理者計上時に在庫と月次実績へ反映する", async () => {
    const { product, m1, pkg } = await setup();
    const { approveProductDailyReportEntry, createProductDailyReportEntry } = await import(
      "@/lib/product-daily-report-service"
    );

    const entry = await createProductDailyReportEntry({
      ...baseInput(product.id),
      approvalStatus: "submitted",
      submittedBy: "山田",
      sourceType: "staff_entry",
      labelPhotos: [{ name: "label.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,abc" }],
      materials: [{ materialId: m1.id, materialName: m1.name, usedKg: 30 }],
    });

    expect(entry!.approvalStatus).toBe("submitted");
    expect(entry!.submittedBy).toBe("山田");
    expect(entry!.labelPhotosJson).toContain("label.jpg");

    const beforeMoves = await prisma.stockMovement.count({
      where: { sourceType: "production_daily_report" } as any,
    });
    expect(beforeMoves).toBe(0);
    const beforeMonthly = await prisma.productMonthlyActual.findUnique({
      where: { productId_yearMonth: { productId: product.id, yearMonth: "2026-05" } },
    });
    expect(beforeMonthly).toBeNull();

    const approved = await approveProductDailyReportEntry(entry!.id, "管理者");
    expect(approved!.approvalStatus).toBe("approved");
    expect(approved!.approvedBy).toBe("管理者");
    expect(approved!.approvedAt).toBeTruthy();

    const moves = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", status: "CONFIRMED" } as any,
    });
    expect(moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: "raw_material", itemId: m1.id, quantity: -30 }),
        expect.objectContaining({ itemType: "packaging", itemId: pkg.id, quantity: -100 }),
        expect.objectContaining({ itemType: "product", itemId: product.id, quantity: 100 }),
      ]),
    );

    const monthly = await prisma.productMonthlyActual.findUnique({
      where: { productId_yearMonth: { productId: product.id, yearMonth: "2026-05" } },
    });
    expect(monthly?.actualQuantity).toBe(100);
    expect(monthly?.sourceType).toBe("daily_report");
  });

  it("マスタ未紐付け(フリーテキスト)原料は在庫差引しないが原価には載らない(単価0)", async () => {
    const { product, m1 } = await setup();
    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");

    await createProductDailyReportEntry({
      ...baseInput(product.id),
      materials: [
        { materialId: m1.id, materialName: m1.name, usedKg: 5 },
        { materialId: null, materialName: "未登録原料", usedKg: 3 },
      ],
    });

    const rawMoves = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", itemType: "raw_material" } as any,
    });
    // 紐付け済み m1 のみ差引、フリーテキストはスキップ。
    expect(rawMoves).toHaveLength(1);
    expect(rawMoves[0]).toMatchObject({ itemId: m1.id, quantity: -5 });
  });

  it("編集で原料を変えると在庫差引が置換される(冪等)", async () => {
    const { product, m1, m2 } = await setup();
    const { createProductDailyReportEntry, updateProductDailyReportEntry } = await import(
      "@/lib/product-daily-report-service"
    );

    const entry = await createProductDailyReportEntry({
      ...baseInput(product.id),
      materials: [{ materialId: m1.id, materialName: m1.name, usedKg: 30 }],
    });
    await updateProductDailyReportEntry(entry!.id, {
      ...baseInput(product.id),
      materials: [
        { materialId: m1.id, materialName: m1.name, usedKg: 20 },
        { materialId: m2.id, materialName: m2.name, usedKg: 5 },
      ],
    });

    const rawMoves = await prisma.stockMovement.findMany({
      where: { sourceType: "production_daily_report", itemType: "raw_material" } as any,
      orderBy: { quantity: "asc" },
    });
    expect(rawMoves.map((m) => ({ itemId: m.itemId, quantity: m.quantity }))).toEqual([
      { itemId: m1.id, quantity: -20 },
      { itemId: m2.id, quantity: -5 },
    ]);
  });

  it("削除で在庫差引が戻る(movement除去)", async () => {
    const { product, m1 } = await setup();
    const { createProductDailyReportEntry, deactivateProductDailyReportEntry } = await import(
      "@/lib/product-daily-report-service"
    );

    const entry = await createProductDailyReportEntry({
      ...baseInput(product.id),
      materials: [{ materialId: m1.id, materialName: m1.name, usedKg: 30 }],
    });
    const before = await prisma.stockMovement.count({
      where: { sourceType: "production_daily_report" } as any,
    });
    expect(before).toBeGreaterThan(0);

    await deactivateProductDailyReportEntry(entry!.id);

    const after = await prisma.stockMovement.count({
      where: { sourceType: "production_daily_report" } as any,
    });
    expect(after).toBe(0);
  });
});
