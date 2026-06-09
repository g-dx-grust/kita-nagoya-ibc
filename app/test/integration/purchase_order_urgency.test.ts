import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestPurchaseOrder,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("PurchaseOrder urgency classification", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T09:00:00.000Z"));
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it.each([
    ["今日", "2026-05-28", "CRITICAL"],
    ["昨日", "2026-05-27", "CRITICAL"],
    ["今日+1日", "2026-05-29", "CRITICAL"],
    ["今日+2日", "2026-05-30", "WARNING"],
    ["今日+7日", "2026-06-04", "WARNING"],
    ["今日+8日", "2026-06-05", "INFO"],
    ["null", null, "NONE"],
  ])("required_order_date が%s → %s", async (_label, recommendedOrderDate, expected) => {
    const material = await createTestMaterial(prisma);
    const order = await createTestPurchaseOrder(prisma, {
      itemId: material.id,
      itemType: "raw_material",
      quantity: 10,
    });
    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");

    const response = await PUT(
      new Request(`http://localhost/api/purchase-orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify({ recommendedOrderDate }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.urgency).toBe(expected);
  });

  it("purchase-candidates/generate が urgency を自動付与する", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const material = await createTestMaterial(prisma, { leadTimeDays: 1 });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      plannedQuantity: 20,
      date: new Date("2026-06-05T00:00:00.000Z"),
    });
    await prisma.productionPlanRequirement.create({
      data: {
        productionPlanId: plan.id,
        itemType: "raw_material",
        itemId: material.id,
        itemName: material.name,
        unit: material.unit,
        plannedQuantity: 10,
        onHandQuantity: 0,
        confirmedInbound: 0,
        unconfirmedInbound: 0,
        shortageQuantity: 10,
        shortageType: "hard_shortage",
        unitPriceSnapshot: material.standardUnitPrice,
      },
    });
    const { POST } = await import("@/app/api/purchase-candidates/generate/route");

    const response = await POST(
      new Request("http://localhost/api/purchase-candidates/generate", {
        method: "POST",
        body: JSON.stringify({
          dateFrom: "2026-06-01",
          dateTo: "2026-06-30",
          replaceExistingCandidates: true,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.candidates[0]).toMatchObject({
      itemId: material.id,
      recommendedOrderDate: expect.any(String),
      urgency: "WARNING",
    });
  });
});
