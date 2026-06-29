import type { ReactElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import MonthlyPlanningHubPage from "@/app/planning/monthly/page";
import { GET as GET_INVENTORY_VISIBILITY } from "@/app/api/inventory/visibility/route";
import { POST as POST_PRODUCT_DEMAND } from "@/app/api/product-demands/route";
import { POST as POST_PRODUCT_DEMAND_SCHEDULE } from "@/app/api/product-demands/[id]/schedule/route";
import { GET as GET_REPLAN_EVENTS } from "@/app/api/replan-events/route";
import { GET as GET_REPLAN_JOBS } from "@/app/api/replan-jobs/route";
import { POST as POST_REPLAN_JOB_APPLY } from "@/app/api/replan-jobs/[id]/apply/route";
import ProductPlanningClient from "@/app/product-planning/product-planning-client";
import { menuSections } from "@/components/layout/Sidebar";
import { confirmDailyReport, upsertDailyReportDraft } from "@/lib/daily-report-service";
import {
  approveProductDailyReportEntry,
  createProductDailyReportEntry,
} from "@/lib/product-daily-report-service";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProduct,
  createTestProductionPlan,
  createTestPurchaseOrder,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/",
  notFound: () => {
    throw new Error("not_found");
  },
}));

(globalThis as { React?: typeof React }).React = React;

describe("Flow redesign Sprint 5 IA / order loop / daily report integration", () => {
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

  it("ホームに今日の業務と月次計画ループ/次アクションが同居する", async () => {
    const html = await renderPage(await HomePage());

    expect(html).toContain("今日の業務キュー");
    expect(html).toContain("月次計画ループ");
    expect(html).toContain("次:");
    expect(html).toContain("月次計画ハブ");
  });

  it("Sidebarから月次計画ハブへ遷移できる", () => {
    const planningSection = menuSections.find((section) => section.label === "計画・確認");
    const hub = planningSection?.items.find((item) => item.label === "月次計画ハブ");

    expect(hub?.href).toMatch(/\/planning\/monthly$/);
  });

  it("月次計画ハブでrun/candidate/adopted状態とpending再計画が見える", async () => {
    const { product, workArea } = await seedProductAndWorkArea("S5-HUB");
    const run = await prisma.monthlyPlanningRun.create({
      data: {
        yearMonth: "2026-07",
        status: "adopted",
        basis: "historical_actual",
        adoptedAt: new Date("2026-06-29T00:00:00.000Z"),
      },
    });
    await prisma.productionPlanCandidate.create({
      data: {
        planningRunId: run.id,
        productId: product.id,
        planDate: new Date("2026-07-08T00:00:00.000Z"),
        quantity: 120,
        workAreaId: workArea.id,
        demandType: "forecast",
        priority: 1,
        materialRisk: "not_evaluated",
      },
    });
    await prisma.replanEvent.create({
      data: {
        eventType: "demand_created",
        targetMonth: "2026-07",
        sourceType: "ProductDemand",
        sourceId: "demand-1",
        status: "pending",
        jobs: { create: { scopeMonth: "2026-07", status: "pending" } },
      },
    });

    const html = await renderPage(
      await MonthlyPlanningHubPage({ searchParams: Promise.resolve({ ym: "2026-07" }) }),
    );

    expect(html).toContain("月次計画ハブ");
    expect(html).toContain("MonthlyPlanningRun");
    expect(html).toContain("採用済み");
    expect(html).toContain("S5-HUB");
    expect(html).toContain("再計画キュー");
    expect(html).toContain("受注登録");
  });

  it("受注登録後に予定化すると製造予定リンク/再計画導線が見える", async () => {
    const { product } = await seedProductAndWorkArea("S5-DEMAND");

    const response = await POST_PRODUCT_DEMAND(
      jsonRequest("http://test.local/api/product-demands", {
        productId: product.id,
        dueDate: "2026-07-12",
        productionDueDate: "2026-07-10",
        demandType: "order",
        status: "tentative",
        quantity: 50,
        customerName: "テスト得意先",
        note: "再計画導線テスト",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("tentative");
    expect(body.replanEventId).toBeTruthy();
    expect(body.replanJobId).toBeTruthy();

    const events = await (await GET_REPLAN_EVENTS(new Request("http://test.local/api/replan-events?targetMonth=2026-07"))).json();
    const jobs = await (await GET_REPLAN_JOBS(new Request("http://test.local/api/replan-jobs?scopeMonth=2026-07"))).json();

    expect(events.rowCount).toBe(1);
    expect(events.events[0]).toMatchObject({
      eventType: "demand_created",
      sourceType: "ProductDemand",
      status: "pending",
    });
    expect(jobs.rowCount).toBe(1);
    expect(jobs.jobs[0]).toMatchObject({ status: "pending", scopeMonth: "2026-07" });

    const scheduleResponse = await POST_PRODUCT_DEMAND_SCHEDULE(
      jsonRequest(`http://test.local/api/product-demands/${body.id}/schedule`, {}),
      { params: Promise.resolve({ id: body.id }) },
    );
    const scheduled = await scheduleResponse.json();
    const linkedDemand = await prisma.productDemand.findUniqueOrThrow({ where: { id: body.id } });

    expect(scheduleResponse.status).toBe(200);
    expect(scheduled.created).toBe(true);
    expect(scheduled.productionPlan).toMatchObject({ productionType: "make_to_order", status: "draft" });
    expect(linkedDemand.productionPlanId).toBe(scheduled.productionPlan.id);
    expect(scheduled.replanJobId).toBeTruthy();

    const html = await renderPage(
      React.createElement(ProductPlanningClient, {
        products: [productOption(product)],
        demands: [
          {
            id: linkedDemand.id,
            dueDate: linkedDemand.dueDate.toISOString().slice(0, 10),
            productionDueDate: linkedDemand.productionDueDate?.toISOString().slice(0, 10) ?? null,
            demandType: linkedDemand.demandType,
            quantity: linkedDemand.quantity,
            status: linkedDemand.status,
            customerName: linkedDemand.customerName,
            externalRef: linkedDemand.externalRef,
            note: linkedDemand.note,
            productionPlanId: scheduled.productionPlan.id,
            productionPlan: {
              id: scheduled.productionPlan.id,
              date: scheduled.productionPlan.date.slice(0, 10),
              status: scheduled.productionPlan.status,
              productionType: scheduled.productionPlan.productionType,
              workAreaName: scheduled.productionPlan.workArea.name,
            },
            product: productOption(product),
          },
          {
            id: "unlinked-demand",
            dueDate: "2026-07-20",
            productionDueDate: "2026-07-19",
            demandType: "order",
            quantity: 10,
            status: "open",
            customerName: null,
            externalRef: null,
            note: null,
            productionPlanId: null,
            productionPlan: null,
            product: productOption(product),
          },
        ],
        suggestions: [],
        monthlyActuals: [],
        stockByProductId: { [product.id]: 0 },
        initialDateFrom: "2026-07-01",
        initialDateTo: "2026-07-31",
        initialTargetMonth: "2026-07",
      }),
    );

    expect(html).toContain(`/production-plans/${scheduled.productionPlan.id}`);
    expect(html).toContain("受注生産");
    expect(html).toContain("再計画差分");
  });

  it("日報B承認でProductDemand.fulfilledになり、A/B実績movementが二重計上されない", async () => {
    const { product, workArea } = await seedProductAndWorkArea("S5-REPORT");
    const demandBefore = await prisma.productDemand.create({
      data: {
        productId: product.id,
        dueDate: new Date("2026-07-12T00:00:00.000Z"),
        productionDueDate: new Date("2026-07-10T00:00:00.000Z"),
        demandType: "order",
        quantity: 100,
        status: "open",
      },
    });
    const scheduleResponse = await POST_PRODUCT_DEMAND_SCHEDULE(
      jsonRequest(`http://test.local/api/product-demands/${demandBefore.id}/schedule`, {
        date: "2026-07-10",
        quantity: 100,
        workAreaId: workArea.id,
        plannedStartTime: "09:00",
        plannedPeopleCount: 1,
      }),
      { params: Promise.resolve({ id: demandBefore.id }) },
    );
    const scheduled = await scheduleResponse.json();
    const plan = await prisma.productionPlan.update({
      where: { id: scheduled.productionPlan.id },
      data: { status: "confirmed", plannedEndTime: "10:00" },
    });
    const demand = await prisma.productDemand.findUniqueOrThrow({ where: { id: demandBefore.id } });

    expect(demand.productionPlanId).toBe(plan.id);
    expect(plan.productionType).toBe("make_to_order");

    const aDraft = await upsertDailyReportDraft(plan.id, {
      actualStartTime: "09:00",
      actualEndTime: "10:00",
      actualQuantity: 100,
      actualPeopleCount: 1,
    });
    await confirmDailyReport(aDraft.id);

    const bEntry = await createProductDailyReportEntry({
      reportDate: "2026-07-10",
      productId: product.id,
      productionPlanId: plan.id,
      startTime: "09:00",
      endTime: "10:00",
      workerCount: 1,
      productionQty: 100,
      approvalStatus: "submitted",
      inventoryReflected: false,
      sourceType: "staff_entry",
    });
    await approveProductDailyReportEntry(bEntry!.id, "管理者");

    const fulfilled = await prisma.productDemand.findUniqueOrThrow({ where: { id: demand.id } });
    expect(fulfilled.status).toBe("fulfilled");

    const movements = await prisma.stockMovement.findMany({
      where: { itemType: "product", itemId: product.id, sourceType: { in: ["daily_report", "production_daily_report"] } },
      orderBy: [{ sourceType: "asc" }, { status: "asc" }],
    });
    const confirmedQuantity = movements
      .filter((movement) => movement.status === "CONFIRMED")
      .reduce((sum, movement) => sum + movement.quantity, 0);

    expect(confirmedQuantity).toBe(100);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "daily_report", status: "CANCELLED", quantity: 100 }),
        expect.objectContaining({ sourceType: "production_daily_report", status: "CONFIRMED", quantity: 100 }),
      ]),
    );
  });

  it("在庫見える化APIで現在庫/予定引当/月末予測の主要値が取得できる", async () => {
    const { product, workArea } = await seedProductAndWorkArea("S5-STOCK");
    const material = await createTestMaterial(prisma, {
      materialCode: "S5-RAW",
      name: "Sprint5原料",
      unit: "kg",
      safetyStockQuantity: 0,
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      movementType: "opening",
      quantity: 20,
      movementDate: new Date("2026-01-01T00:00:00.000Z"),
      status: "CONFIRMED",
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 10,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-08-05T00:00:00.000Z"),
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 7,
      status: "confirmed",
      expectedArrivalDate: new Date("2026-08-03T00:00:00.000Z"),
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-08-10T00:00:00.000Z"),
      plannedQuantity: 15,
      status: "draft",
    });
    await createRequirement(plan.id, material.id, material.name, 15);

    const response = await GET_INVENTORY_VISIBILITY(
      new Request("http://test.local/api/inventory/visibility?month=2026-08&itemType=raw_material"),
    );
    const body = await response.json();
    const row = body.rows.find((r: { itemId: string }) => r.itemId === material.id);

    expect(response.status).toBe(200);
    expect(row).toMatchObject({
      currentQuantity: 20,
      plannedAllocationQuantity: -15,
      afterPlannedAllocationQuantity: 5,
      confirmedInboundQuantity: 7,
      withConfirmedInboundQuantity: 12,
      unconfirmedInboundQuantity: 10,
      withUnconfirmedInboundQuantity: 22,
      monthEndProjectedQuantity: 12,
    });
  });

  it("ReplanJob pending を確認済みにするとAPIのpendingキューから外れる", async () => {
    const event = await prisma.replanEvent.create({
      data: {
        eventType: "day_allocation_changed",
        targetMonth: "2026-07",
        sourceType: "DayAllocation",
        sourceId: "2026-07-10",
        status: "pending",
        jobs: { create: { scopeMonth: "2026-07", status: "pending" } },
      },
      include: { jobs: true },
    });

    const response = await POST_REPLAN_JOB_APPLY(
      jsonRequest(`http://test.local/api/replan-jobs/${event.jobs[0].id}/apply`, { action: "apply" }),
      { params: Promise.resolve({ id: event.jobs[0].id }) },
    );
    const body = await response.json();
    const pendingJobs = await (await GET_REPLAN_JOBS(new Request("http://test.local/api/replan-jobs?scopeMonth=2026-07"))).json();
    const allEvents = await (await GET_REPLAN_EVENTS(new Request("http://test.local/api/replan-events?status=all&targetMonth=2026-07"))).json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("applied");
    expect(pendingJobs.rowCount).toBe(0);
    expect(allEvents.events[0].status).toBe("processed");
  });

  it("現場印刷は仮確定を未確定予定として要確認にする", async () => {
    const { product, workArea } = await seedProductAndWorkArea("S5-PRINT");
    await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 50,
      status: "tentative_confirmed",
    });

    const PrintsPage = (await import("@/app/prints/page")).default;
    const html = await renderPage(await PrintsPage({ searchParams: Promise.resolve({ date: "2026-07-10" }) }));

    expect(html).toContain("要確認");
    expect(html).toContain("未確定 1件");
  });

  async function seedProductAndWorkArea(code: string) {
    const workArea = await createTestWorkArea(prisma, { name: `${code}_作業場所` });
    const product = await createTestProduct(prisma, {
      productCode: code,
      officialName: `${code}_商品`,
      unit: "袋",
      defaultWorkAreaId: workArea.id,
    });
    await prisma.productionCapacity.create({
      data: { productId: product.id, workAreaId: workArea.id, unitsPerPersonHour: 1000, standardPeople: 1 },
    });
    return { product, workArea };
  }
});

function productOption(product: {
  id: string;
  productCode: string;
  officialName: string;
  displayName?: string | null;
  unit: string;
  specification?: string | null;
  brandName?: string | null;
  casePackQty?: number | null;
}) {
  return {
    id: product.id,
    productCode: product.productCode,
    officialName: product.officialName,
    displayName: product.displayName ?? null,
    unit: product.unit,
    specification: product.specification ?? null,
    brandName: product.brandName ?? null,
    casePackQty: product.casePackQty ?? null,
  };
}

async function renderPage(element: ReactElement) {
  return renderToStaticMarkup(element);
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createRequirement(
  productionPlanId: string,
  materialId: string,
  materialName: string,
  plannedQuantity: number,
) {
  const prisma = getTestPrisma();
  return prisma.productionPlanRequirement.create({
    data: {
      productionPlanId,
      itemType: "raw_material",
      itemId: materialId,
      itemName: materialName,
      unit: "kg",
      plannedQuantity,
    },
  });
}
