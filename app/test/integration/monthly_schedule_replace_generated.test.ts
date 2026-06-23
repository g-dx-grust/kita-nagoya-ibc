import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MONTHLY_SHIFT_GENERATED_NOTE_PREFIX } from "@/lib/product-planning-service";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestProductionPlan, createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("月間シフト連動の自動生成draft置換", () => {
  const prisma = getTestPrisma();

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("replaceGeneratedDraftsOnly=true では手入力draftを残し、自動生成draftだけ削除する", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const generated = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
      note: `${MONTHLY_SHIFT_GENERATED_NOTE_PREFIX} / 古い在庫生産draft`,
    });
    const manual = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-11T00:00:00.000Z"),
      plannedQuantity: 5,
      status: "draft",
      note: "手入力の受注生産draft",
    });

    const { POST } = await import("@/app/api/product-planning/monthly-schedule/route");
    const response = await POST(
      new Request("http://test.local/api/product-planning/monthly-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          replaceExistingDrafts: true,
          replaceGeneratedDraftsOnly: true,
        }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.createdCount).toBe(0);
    expect(json.replacedDraftCount).toBe(1);
    await expect(prisma.productionPlan.findUnique({ where: { id: generated.id } })).resolves.toBeNull();
    await expect(prisma.productionPlan.findUnique({ where: { id: manual.id } })).resolves.toBeTruthy();
  });
});
