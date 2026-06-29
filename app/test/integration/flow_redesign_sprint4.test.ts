import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProductionPlan,
  createTestPurchaseOrder,
  createTestProduct,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Flow redesign Sprint 4", () => {
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

  it("month_end forecast separates opening, confirmed PO, unconfirmed PO, and planned statuses", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({ safetyStockQuantity: 5 });

    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      movementType: "opening",
      quantity: 100,
      movementDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "CONFIRMED",
    });
    const receivedPo = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 20,
      status: "received",
      expectedArrivalDate: new Date("2026-07-05T00:00:00.000Z"),
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      movementType: "INBOUND_CONFIRMED",
      quantity: 20,
      movementDate: new Date("2026-07-05T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "purchase_order",
      sourceId: receivedPo.id,
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 30,
      status: "confirmed",
      expectedArrivalDate: new Date("2026-07-10T00:00:00.000Z"),
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 40,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-12T00:00:00.000Z"),
    });

    for (const status of ["draft", "tentative_confirmed", "confirmed", "completed"] as const) {
      const plan = await createTestProductionPlan(prisma, {
        productId: product.id,
        workAreaId: workArea.id,
        date: new Date("2026-07-20T00:00:00.000Z"),
        plannedQuantity: 10,
        status,
      });
      await createRequirement(plan.id, material.id, material.name, 10);
    }

    const { loadMonthEndInventoryForecast } = await import("@/lib/material-forecast");
    const forecast = await loadMonthEndInventoryForecast({ targetMonth: "2026-07" });
    const line = forecast.lines.find((row) => row.itemType === "raw_material" && row.itemId === material.id);

    expect(line).toMatchObject({
      openingQuantity: 120,
      confirmedStockMovementQuantity: 20,
      confirmedInboundQuantity: 30,
      unconfirmedInboundQuantity: 40,
      plannedUsageQuantity: 30,
      confirmedProjectedQuantity: 120,
      projectedWithUnconfirmedQuantity: 160,
      shortageType: "none",
    });
  });

  it("month_end purchase candidates subtract orderProcessingBufferDays from recommendedOrderDate", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({
      leadTimeDays: 2,
      orderProcessingBufferDays: 3,
      safetyStockQuantity: 0,
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-08-20T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
    });
    await createRequirement(plan.id, material.id, material.name, 10);

    const { POST } = await import("@/app/api/purchase-candidates/generate/route");
    const response = await POST(
      jsonRequest("/api/purchase-candidates/generate", {
        mode: "month_end",
        targetMonth: "2026-08",
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.mode).toBe("month_end");
    expect(body.rowCount).toBe(1);
    expect(body.candidates[0].shortageDate.slice(0, 10)).toBe("2026-08-20");
    expect(body.candidates[0].recommendedOrderDate.slice(0, 10)).toBe("2026-08-15");
    expect(body.candidates[0].orderedQuantity).toBe(10);
  });

  it("month_end order quantity covers the maximum in-month shortage, not only month-end safety stock", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({ safetyStockQuantity: 0 });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      movementType: "opening",
      quantity: 5,
      movementDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "CONFIRMED",
    });
    for (const date of ["2026-08-10", "2026-08-20"]) {
      const plan = await createTestProductionPlan(prisma, {
        productId: product.id,
        workAreaId: workArea.id,
        date: new Date(`${date}T00:00:00.000Z`),
        plannedQuantity: 10,
        status: "draft",
      });
      await createRequirement(plan.id, material.id, material.name, 10);
    }

    const { POST } = await import("@/app/api/purchase-candidates/generate/route");
    const response = await POST(
      jsonRequest("/api/purchase-candidates/generate", {
        mode: "month_end",
        targetMonth: "2026-08",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.rowCount).toBe(1);
    expect(body.candidates[0].shortageDate.slice(0, 10)).toBe("2026-08-10");
    expect(body.candidates[0].orderedQuantity).toBe(15);
  });

  it("month_end forecast uses buildMaterialForecast semantics for below_safety", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({ safetyStockQuantity: 5 });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      movementType: "opening",
      quantity: 12,
      movementDate: new Date("2026-08-01T00:00:00.000Z"),
      status: "CONFIRMED",
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-08-10T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
    });
    await createRequirement(plan.id, material.id, material.name, 10);

    const { loadMonthEndInventoryForecast } = await import("@/lib/material-forecast");
    const forecast = await loadMonthEndInventoryForecast({ targetMonth: "2026-08" });
    const line = forecast.lines.find((row) => row.itemId === material.id);

    expect(line?.shortageDate).toBe("2026-08-10");
    expect(line?.shortageType).toBe("below_safety");
    expect(line?.shortageQuantity).toBe(3);
  });

  it("month_end forecast uses buildMaterialForecast semantics for unconfirmed_dependency", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({ safetyStockQuantity: 0 });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 10,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-08-09T00:00:00.000Z"),
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-08-10T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
    });
    await createRequirement(plan.id, material.id, material.name, 10);

    const { loadMonthEndInventoryForecast } = await import("@/lib/material-forecast");
    const forecast = await loadMonthEndInventoryForecast({ targetMonth: "2026-08" });
    const line = forecast.lines.find((row) => row.itemId === material.id);

    expect(line?.shortageDate).toBe("2026-08-10");
    expect(line?.shortageType).toBe("unconfirmed_dependency");
    expect(line?.shortageQuantity).toBe(10);
  });

  it("month_end generation requires targetMonth", async () => {
    const { POST } = await import("@/app/api/purchase-candidates/generate/route");
    const response = await POST(
      jsonRequest("/api/purchase-candidates/generate", {
        mode: "month_end",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("validation_error");
  });

  it("window mode keeps the existing date-window purchase candidate behavior", async () => {
    const { workArea, product, material } = await seedMaterialPlanBase({
      leadTimeDays: 2,
      safetyStockQuantity: 0,
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-09-10T00:00:00.000Z"),
      plannedQuantity: 12,
      status: "draft",
    });
    await createRequirement(plan.id, material.id, material.name, 12);

    const { POST } = await import("@/app/api/purchase-candidates/generate/route");
    const response = await POST(
      jsonRequest("/api/purchase-candidates/generate", {
        mode: "window",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.mode).toBe("window");
    expect(body.rowCount).toBe(1);
    expect(body.candidates[0].shortageDate.slice(0, 10)).toBe("2026-09-10");
    expect(body.candidates[0].recommendedOrderDate.slice(0, 10)).toBe("2026-09-08");
    expect(body.candidates[0].orderedQuantity).toBe(12);
  });

  it("PO arrival update creates ReplanEvent and ReplanJob", async () => {
    const { material } = await seedMaterialPlanBase();
    const order = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 10,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-10T00:00:00.000Z"),
      shortageDate: new Date("2026-07-20T00:00:00.000Z"),
    });

    const { PUT } = await import("@/app/api/purchase-orders/[id]/route");
    const response = await PUT(
      jsonRequest(`/api/purchase-orders/${order.id}`, { expectedArrivalDate: "2026-07-12" }, "PUT"),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(200);

    const event = await prisma.replanEvent.findFirst({
      where: { eventType: "purchase_arrival_updated", sourceId: order.id },
      include: { jobs: true },
    });
    expect(event?.status).toBe("pending");
    expect(event?.targetMonth).toBe("2026-07");
    expect(event?.jobs[0]?.status).toBe("pending");
  });

  it("PO receive and cancel create ReplanEvent and ReplanJob", async () => {
    const { material } = await seedMaterialPlanBase();
    const receivedOrder = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 10,
      status: "confirmed",
      expectedArrivalDate: new Date("2026-07-10T00:00:00.000Z"),
      shortageDate: new Date("2026-07-20T00:00:00.000Z"),
    });
    const cancelOrder = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 10,
      status: "confirmed",
      expectedArrivalDate: new Date("2026-07-11T00:00:00.000Z"),
      shortageDate: new Date("2026-07-21T00:00:00.000Z"),
    });

    const { POST: RECEIVE } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");
    const receiveResponse = await RECEIVE(
      jsonRequest(`/api/purchase-orders/${receivedOrder.id}/receive`, {
        receivedQuantity: 10,
        receivedDate: "2026-07-10",
      }),
      { params: Promise.resolve({ id: receivedOrder.id }) },
    );
    const cancelResponse = await DELETE(
      new Request(`http://test.local/api/purchase-orders/${cancelOrder.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: cancelOrder.id }) },
    );

    expect(receiveResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    const events = await prisma.replanEvent.findMany({
      where: { sourceType: "PurchaseOrder", sourceId: { in: [receivedOrder.id, cancelOrder.id] } },
      include: { jobs: true },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.eventType).sort()).toEqual(["po_cancelled", "po_received"]);
    expect(events.every((event) => event.jobs[0]?.status === "pending")).toBe(true);
  });

  it("ProductDemand create/update/delete creates ReplanEvent and ReplanJob", async () => {
    const product = await createTestProduct(prisma);
    const { POST } = await import("@/app/api/product-demands/route");
    const { PUT, DELETE } = await import("@/app/api/product-demands/[id]/route");

    const created = await POST(
      jsonRequest("/api/product-demands", {
        productId: product.id,
        dueDate: "2026-07-20",
        quantity: 10,
        demandType: "order",
      }),
    );
    const createdBody = await created.json();
    expect(created.status).toBe(201);

    const updated = await PUT(
      jsonRequest(`/api/product-demands/${createdBody.id}`, { quantity: 12 }, "PUT"),
      { params: Promise.resolve({ id: createdBody.id }) },
    );
    expect(updated.status).toBe(200);

    const deleted = await DELETE(new Request(`http://test.local/api/product-demands/${createdBody.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: createdBody.id }),
    });
    expect(deleted.status).toBe(200);

    const events = await prisma.replanEvent.findMany({
      where: { sourceType: "ProductDemand", sourceId: createdBody.id },
      include: { jobs: true },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "demand_created",
      "demand_updated",
      "demand_updated",
    ]);
    expect(events.every((event) => event.jobs[0]?.status === "pending")).toBe(true);
  });

  it("ProductDemand create succeeds without duplicate retry pressure when ReplanEvent creation fails", async () => {
    const product = await createTestProduct(prisma);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.REPLAN_EVENT_FAIL_ONCE = "1";

    try {
      const { POST } = await import("@/app/api/product-demands/route");
      const response = await POST(
        jsonRequest("/api/product-demands", {
          productId: product.id,
          dueDate: "2026-07-20",
          quantity: 10,
          demandType: "order",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.replanEventId).toBeNull();
      expect(await prisma.productDemand.count()).toBe(1);
      expect(await prisma.replanEvent.count()).toBe(0);
    } finally {
      delete process.env.REPLAN_EVENT_FAIL_ONCE;
      consoleSpy.mockRestore();
    }
  });

  it("persisted day allocation creates ReplanEvent and ReplanJob", async () => {
    const { POST } = await import("@/app/api/production-plans/allocate-day/route");
    const response = await POST(
      jsonRequest("/api/production-plans/allocate-day", {
        date: "2026-07-15",
        persist: true,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.replanEventId).toBeTruthy();

    const event = await prisma.replanEvent.findUnique({
      where: { id: body.replanEventId },
      include: { jobs: true },
    });
    expect(event?.eventType).toBe("day_allocation_changed");
    expect(event?.jobs[0]?.status).toBe("pending");
  });

  it("daily report approval creates ReplanEvent and ReplanJob", async () => {
    const product = await createTestProduct(prisma);
    const entry = await prisma.productionDailyReportEntry.create({
      data: {
        reportDate: new Date("2026-07-16T00:00:00.000Z"),
        productId: product.id,
        productName: product.officialName,
        normalizedProductName: product.officialName,
        productMatchStatus: "product_id",
        startTime: "09:00",
        endTime: "10:00",
        workerCount: 1,
        productionQty: 10,
        materialUsedKg: 0,
        approvalStatus: "submitted",
        inventoryReflected: false,
      },
    });

    const { POST } = await import("@/app/api/production-daily-reports/[id]/approve/route");
    const response = await POST(
      jsonRequest(`/api/production-daily-reports/${entry.id}/approve`, { approvedBy: "管理者" }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(response.status).toBe(200);

    const event = await prisma.replanEvent.findFirst({
      where: { eventType: "daily_report_approved", sourceId: entry.id },
      include: { jobs: true },
    });
    expect(event?.targetMonth).toBe("2026-07");
    expect(event?.jobs[0]?.status).toBe("pending");
  });

  it("replan queue APIs list pending events and jobs", async () => {
    const product = await createTestProduct(prisma);
    const { POST } = await import("@/app/api/product-demands/route");
    await POST(
      jsonRequest("/api/product-demands", {
        productId: product.id,
        dueDate: "2026-07-20",
        quantity: 10,
      }),
    );

    const { GET: GET_EVENTS } = await import("@/app/api/replan-events/route");
    const { GET: GET_JOBS } = await import("@/app/api/replan-jobs/route");
    const eventsResponse = await GET_EVENTS(new Request("http://test.local/api/replan-events?targetMonth=2026-07"));
    const jobsResponse = await GET_JOBS(new Request("http://test.local/api/replan-jobs?scopeMonth=2026-07"));
    const eventsBody = await eventsResponse.json();
    const jobsBody = await jobsResponse.json();

    expect(eventsResponse.status).toBe(200);
    expect(jobsResponse.status).toBe(200);
    expect(eventsBody.rowCount).toBe(1);
    expect(jobsBody.rowCount).toBe(1);
  });

  async function seedMaterialPlanBase(materialData: Parameters<typeof createTestMaterial>[1] = {}) {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const material = await createTestMaterial(prisma, materialData);
    return { workArea, product, material };
  }

  async function createRequirement(planId: string, materialId: string, materialName: string, quantity: number) {
    return prisma.productionPlanRequirement.create({
      data: {
        productionPlanId: planId,
        itemType: "raw_material",
        itemId: materialId,
        itemName: materialName,
        unit: "kg",
        plannedQuantity: quantity,
        unitPriceSnapshot: 0,
      },
    });
  }
});

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`http://test.local${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
