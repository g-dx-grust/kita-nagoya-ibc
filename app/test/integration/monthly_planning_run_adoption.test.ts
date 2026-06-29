import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MONTHLY_SHIFT_GENERATED_NOTE_PREFIX } from "@/lib/product-planning-service";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestProduct,
  createTestProductionPlan,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Monthly planning run adoption (integration)", () => {
  const prisma = getTestPrisma();

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("採用時にbatchとdraft計画を作り、二重採用と置換禁止対象を守る", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      productCode: "RUN-ADOPT-001",
      officialName: "run採用テスト商品",
      defaultWorkAreaId: workArea.id,
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 1000,
        standardPeople: 1,
      },
    });

    const oldRun = await prisma.monthlyPlanningRun.create({
      data: {
        yearMonth: "2026-07",
        status: "adopted",
        basis: "historical_actual",
        adoptedAt: new Date("2026-06-25T00:00:00.000Z"),
      },
    });
    const oldBatch = await prisma.productionPlanBatch.create({
      data: {
        planningRunId: oldRun.id,
        status: "active",
        adoptedAt: new Date("2026-06-25T00:00:00.000Z"),
      },
    });
    const generatedDraft = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
      note: `${MONTHLY_SHIFT_GENERATED_NOTE_PREFIX} / 旧batch`,
    });
    const confirmed = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-11T00:00:00.000Z"),
      plannedQuantity: 20,
      status: "confirmed",
    });
    const completed = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-12T00:00:00.000Z"),
      plannedQuantity: 30,
      status: "completed",
    });
    await prisma.productionPlan.updateMany({
      where: { id: { in: [generatedDraft.id, confirmed.id, completed.id] } },
      data: { planningRunId: oldRun.id, planningBatchId: oldBatch.id },
    });
    const orderLinked = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-13T00:00:00.000Z"),
      plannedQuantity: 40,
      status: "draft",
      productionType: "make_to_order",
      note: "受注紐づき",
    });
    await prisma.productDemand.create({
      data: {
        productId: product.id,
        productionPlanId: orderLinked.id,
        dueDate: new Date("2026-07-20T00:00:00.000Z"),
        demandType: "order",
        quantity: 40,
        status: "open",
      },
    });

    const sourceSnapshot = {
      source: "monthly-schedule",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      productionLeadDays: 1,
      planningBasis: "historical_actual",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      replaceExistingDrafts: true,
      replaceGeneratedDraftsOnly: false,
    };
    const run = await prisma.monthlyPlanningRun.create({
      data: {
        yearMonth: "2026-07",
        status: "simulated",
        basis: "historical_actual",
        sourceSnapshotJson: JSON.stringify(sourceSnapshot),
      },
    });
    const candidate = await prisma.productionPlanCandidate.create({
      data: {
        planningRunId: run.id,
        productId: product.id,
        planDate: new Date("2026-07-14T00:00:00.000Z"),
        quantity: 50,
        workAreaId: workArea.id,
        demandType: "forecast",
        priority: 1,
        estimatedMinutes: 60,
        materialRisk: "not_evaluated",
        capacityReason: JSON.stringify({
          version: 1,
          startTime: "09:00",
          endTime: "10:00",
          breakMinutes: 0,
          peopleCount: 1,
          assignedEmployees: [],
          dueDates: ["2026-07-14"],
          reasons: ["統合テスト候補"],
          warnings: [],
          unit: "袋",
          productionType: "stock",
          productCode: product.productCode,
          productName: product.officialName,
          workAreaName: workArea.name,
          baselineEndTime: "17:00",
        }),
      },
    });

    const { POST: ADOPT } = await import("@/app/api/planning/monthly-runs/[id]/adopt/route");
    const response = await ADOPT(
      new Request("http://test.local/api/planning/monthly-runs/run/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      runId: run.id,
      createdCount: 1,
      replacedPlanCount: 1,
    });
    expect(json.batchId).toBeTruthy();
    expect(json.plans[0]).toMatchObject({
      candidateId: candidate.id,
      date: "2026-07-14",
      productCode: "RUN-ADOPT-001",
      quantity: 50,
    });

    await expect(prisma.productionPlan.findUnique({ where: { id: generatedDraft.id } })).resolves.toBeNull();
    await expect(prisma.productionPlan.findUnique({ where: { id: confirmed.id } })).resolves.toBeTruthy();
    await expect(prisma.productionPlan.findUnique({ where: { id: completed.id } })).resolves.toBeTruthy();
    await expect(prisma.productionPlan.findUnique({ where: { id: orderLinked.id } })).resolves.toBeTruthy();

    const createdPlan = await prisma.productionPlan.findFirstOrThrow({
      where: { planningRunId: run.id, planningBatchId: json.batchId },
    });
    expect(createdPlan).toMatchObject({
      status: "draft",
      plannedQuantity: 50,
      productionType: "stock",
      planningRunId: run.id,
      planningBatchId: json.batchId,
    });

    const batch = await prisma.productionPlanBatch.findUnique({ where: { id: json.batchId } });
    expect(batch).toMatchObject({ planningRunId: run.id, status: "active" });
    const adoptedRun = await prisma.monthlyPlanningRun.findUnique({ where: { id: run.id } });
    expect(adoptedRun).toMatchObject({ status: "adopted" });

    const secondResponse = await ADOPT(
      new Request("http://test.local/api/planning/monthly-runs/run/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(secondResponse.status).toBe(409);
  });

  it("同じrunを並列採用してもbatchとdraftを二重作成しない", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      productCode: "RUN-ADOPT-RACE",
      officialName: "run並列採用テスト商品",
      defaultWorkAreaId: workArea.id,
    });
    const run = await prisma.monthlyPlanningRun.create({
      data: {
        yearMonth: "2026-07",
        status: "simulated",
        basis: "historical_actual",
        sourceSnapshotJson: JSON.stringify({
          source: "monthly-schedule",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          productionLeadDays: 1,
          planningBasis: "historical_actual",
          defaultStartTime: "09:00",
          baselineEndTime: "17:00",
          replaceExistingDrafts: false,
          replaceGeneratedDraftsOnly: false,
        }),
      },
    });
    await prisma.productionPlanCandidate.create({
      data: {
        planningRunId: run.id,
        productId: product.id,
        planDate: new Date("2026-07-15T00:00:00.000Z"),
        quantity: 25,
        workAreaId: workArea.id,
        demandType: "forecast",
        priority: 1,
        estimatedMinutes: 60,
        materialRisk: "not_evaluated",
        capacityReason: JSON.stringify({
          version: 1,
          startTime: "09:00",
          endTime: "10:00",
          breakMinutes: 0,
          peopleCount: 1,
          assignedEmployees: [],
          dueDates: ["2026-07-15"],
          reasons: ["並列採用テスト候補"],
          warnings: [],
          unit: "袋",
          productionType: "stock",
          productCode: product.productCode,
          productName: product.officialName,
          workAreaName: workArea.name,
          baselineEndTime: "17:00",
        }),
      },
    });

    const { POST: ADOPT } = await import("@/app/api/planning/monthly-runs/[id]/adopt/route");
    const adopt = () =>
      ADOPT(
        new Request("http://test.local/api/planning/monthly-runs/run/adopt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: run.id }) },
      );

    const settled = await Promise.allSettled([adopt(), adopt()]);
    const responses = settled.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const batchCount = await prisma.productionPlanBatch.count({ where: { planningRunId: run.id } });
    const planCount = await prisma.productionPlan.count({ where: { planningRunId: run.id } });
    const adoptedRun = await prisma.monthlyPlanningRun.findUniqueOrThrow({ where: { id: run.id } });

    expect(batchCount).toBe(1);
    expect(planCount).toBe(1);
    expect(adoptedRun.status).toBe("adopted");
    expect(adoptedRun.adoptedAt).not.toBeNull();
  });
});
