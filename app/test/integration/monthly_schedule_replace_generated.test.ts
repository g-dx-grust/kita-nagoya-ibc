import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MONTHLY_SHIFT_GENERATED_NOTE_PREFIX } from "@/lib/product-planning-service";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestEmployee,
  createTestProduct,
  createTestProductionPlan,
  createTestWorkArea,
} from "../helpers/factories";
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

  it("前々月前年比モードでも未処理の受注生産需要を仮予定化する", async () => {
    const workArea = await createTestWorkArea(prisma, {
      name: "月間受注_一般部屋",
      autoScheduleRole: "ORDER_PRIMARY",
      maxPeopleCount: 2,
    });
    const product = await createTestProduct(prisma, {
      productCode: "MONTHLY-ORDER-001",
      officialName: "月間受注テスト商品",
      productionType: "make_to_order",
      forecastMethod: "NONE",
      standardProductionLotSize: 80,
      defaultWorkAreaId: workArea.id,
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 1000,
        standardPeople: 1,
        candidatePriority: 1,
      },
    });
    const employee = await createTestEmployee(prisma, { name: "月間受注_作業者" });
    await prisma.shift.create({
      data: {
        employeeId: employee.id,
        date: new Date("2026-06-23T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "17:00",
        breakMinutes: 0,
        status: "confirmed",
      },
    });
    await prisma.productDemand.create({
      data: {
        productId: product.id,
        dueDate: new Date("2026-06-23T00:00:00.000Z"),
        demandType: "order",
        quantity: 100,
        status: "open",
      },
    });

    const { POST } = await import("@/app/api/product-planning/monthly-schedule/route");
    const response = await POST(
      new Request("http://test.local/api/product-planning/monthly-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: "2026-06-23",
          dateTo: "2026-06-23",
          planningBasis: "historical_actual",
          defaultStartTime: "09:00",
          baselineEndTime: "17:00",
          replaceExistingDrafts: true,
          replaceGeneratedDraftsOnly: true,
        }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.createdCount).toBe(1);
    expect(json.plans[0]).toMatchObject({
      date: "2026-06-23",
      productCode: "MONTHLY-ORDER-001",
      quantity: 100,
      assignedCount: 1,
    });

    const plan = await prisma.productionPlan.findFirst({
      where: { productId: product.id, date: new Date("2026-06-23T00:00:00.000Z") },
      include: { assignments: true },
    });
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe("draft");
    expect(plan!.productionType).toBe("make_to_order");
    expect(plan!.plannedQuantity).toBe(100);
    expect(plan!.note).toContain(MONTHLY_SHIFT_GENERATED_NOTE_PREFIX);
    expect(plan!.note).toContain("受注/出荷予定 100袋");
    expect(plan!.assignments).toHaveLength(1);
  });
});
