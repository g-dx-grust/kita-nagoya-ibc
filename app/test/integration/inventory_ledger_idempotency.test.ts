// Phase 2-1 完了時に status カラムと sourceType/sourceId/movementType のユニーク制約が追加されるため、以下のテストの skip を解除すること。
// 2-1 prompt: prompts/v2/phase_2_subtasks/2_1_stock_movement_extension.md

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("InventoryLedger idempotency", () => {
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

  it("Same (sourceType, sourceId, movementType) cannot be inserted twice", async () => {
    const material = await createTestMaterial(prisma);
    const source = { sourceType: "daily_report", sourceId: "daily-report-001" };

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "ACTUAL_MATERIAL_USE",
      quantity: -12,
      movementDate: new Date("2026-05-10T00:00:00.000Z"),
      status: "CONFIRMED",
      ...source,
    });

    await expect(
      createTestStockMovement(prisma, {
        itemId: material.id,
        itemType: "raw_material",
        movementType: "ACTUAL_MATERIAL_USE",
        quantity: -12,
        movementDate: new Date("2026-05-10T00:00:00.000Z"),
        status: "CONFIRMED",
        ...source,
      }),
    ).rejects.toThrow();
  });

  it("B日報の再保存(更新)は冪等(movement重複なし)", async () => {
    const material = await createTestMaterial(prisma, { standardUnitPrice: 100 });
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const { createProductDailyReportEntry, updateProductDailyReportEntry } = await import(
      "@/lib/product-daily-report-service"
    );
    const input = {
      reportDate: "2026-05-10",
      productId: product.id,
      startTime: "09:00",
      endTime: "10:00",
      breakMinutes: 0,
      workerCount: 1,
      productionQty: 10,
      materials: [{ materialId: material.id, materialName: material.name, usedKg: 5 }],
    };

    const entry = await createProductDailyReportEntry(input);
    const firstCount = await prisma.stockMovement.count({
      where: { sourceType: "production_daily_report" },
    });

    await updateProductDailyReportEntry(entry!.id, input);
    const secondCount = await prisma.stockMovement.count({
      where: { sourceType: "production_daily_report" },
    });

    expect(firstCount).toBe(2);
    expect(secondCount).toBe(firstCount);
  });

  it("Different movementType under same source is allowed", async () => {
    const material = await createTestMaterial(prisma);
    const source = { sourceType: "daily_report", sourceId: "daily-report-002" };

    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "ACTUAL_MATERIAL_USE",
      quantity: -12,
      movementDate: new Date("2026-05-10T00:00:00.000Z"),
      status: "CONFIRMED",
      ...source,
    });
    await createTestStockMovement(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      movementType: "INBOUND_CONFIRMED",
      quantity: 12,
      movementDate: new Date("2026-05-10T00:00:00.000Z"),
      status: "CONFIRMED",
      ...source,
    });

    const movements = await prisma.stockMovement.findMany({
      where: { sourceType: source.sourceType, sourceId: source.sourceId },
      orderBy: { movementType: "asc" },
    });

    expect(movements.map((movement) => movement.movementType)).toEqual([
      "ACTUAL_MATERIAL_USE",
      "INBOUND_CONFIRMED",
    ]);
  });
});
