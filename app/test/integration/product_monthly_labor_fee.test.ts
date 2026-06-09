// 蓄積日報(B)から月次の1袋手間賃(laborFeePerUnit の中央値)を算出し、apply で BillingPrice(売値) へ反映する。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("月次手間賃 (ProductMonthlyLaborFee)", () => {
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

  it("中央値を算出して保存し、apply で BillingPrice(翌月適用) を作る", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const { createProductDailyReportEntry } = await import("@/lib/product-daily-report-service");
    const { recomputeMonthlyLaborFees, applyMonthlyLaborFee } = await import(
      "@/lib/product-monthly-labor-fee"
    );

    // 既定手間賃時給 1200。 9:00-11:00(120分)・休憩0・1人 → 稼動2h。
    // 生産120 → 60個/人時 → 1袋手間賃 = 1200/60 = 20。
    await createProductDailyReportEntry({
      reportDate: "2026-05-10",
      productId: product.id,
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 1,
      productionQty: 120,
      materials: [],
    });
    // 生産240 → 120個/人時 → 1袋手間賃 = 1200/120 = 10。
    await createProductDailyReportEntry({
      reportDate: "2026-05-12",
      productId: product.id,
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 1,
      productionQty: 240,
      materials: [],
    });

    const rows = await recomputeMonthlyLaborFees("2026-05");
    const row = rows.find((r) => r.productId === product.id);
    expect(row).toBeDefined();
    // median(20, 10) = 15。
    expect(row!.perBagLaborFee).toBe(15);
    expect(row!.sampleCount).toBe(2);
    expect(row!.status).toBe("draft");

    const applied = await applyMonthlyLaborFee(row!.id);
    expect(applied.status).toBe("applied");
    expect(applied.appliedBillingPriceId).toBeTruthy();

    const price = await prisma.billingPrice.findUniqueOrThrow({
      where: { id: applied.appliedBillingPriceId! },
    });
    expect(price.unitPrice).toBe(15);
    expect(price.productId).toBe(product.id);
    expect(price.billingTarget).toBe(true);
    // 既定の適用開始日は対象月の翌月1日。
    expect(price.effectiveFrom.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});
