import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runDayAllocation } from "@/lib/day-allocation-service";
import { cleanupAll } from "../helpers/cleanup";
import {
  createTestEmployee,
  createTestProduct,
  createTestProductionPlan,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("day allocation service (integration)", () => {
  const prisma = getTestPrisma();
  const date = new Date("2026-06-02");

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

  it("moves a production plan to another valid room in preview and persists the room change on save", async () => {
    const originalRoom = await createTestWorkArea(prisma, {
      name: "当日割当_元部屋",
      maxPeopleCount: 1,
      displayOrder: 1,
    });
    const movedRoom = await createTestWorkArea(prisma, {
      name: "当日割当_移動先",
      maxPeopleCount: 2,
      displayOrder: 2,
    });
    const product = await createTestProduct(prisma, { defaultWorkAreaId: originalRoom.id });
    await prisma.productionCapacity.createMany({
      data: [
        {
          productId: product.id,
          workAreaId: originalRoom.id,
          unitsPerPersonHour: 60,
          standardPeople: 1,
        },
        {
          productId: product.id,
          workAreaId: movedRoom.id,
          unitsPerPersonHour: 120,
          standardPeople: 1,
        },
      ],
    });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: originalRoom.id,
      plannedQuantity: 120,
      date,
      status: "confirmed",
    });
    const employee = await createTestEmployee(prisma, { name: "当日割当_作業者" });
    await prisma.shift.create({
      data: {
        employeeId: employee.id,
        date,
        startTime: "09:00",
        endTime: "11:00",
        status: "confirmed",
        breakMinutes: 0,
      },
    });

    const preview = await runDayAllocation({
      date: "2026-06-02",
      dayStart: "09:00",
      dayEnd: "11:00",
      stepMinutes: 60,
      planStatuses: ["confirmed"],
      persist: false,
      planWorkAreaOverrides: [{ planId: plan.id, workAreaId: movedRoom.id }],
    });

    const previewJob = preview.allocation.jobs[0];
    expect(previewJob.workAreaId).toBe(movedRoom.id);
    expect(previewJob.originalWorkAreaId).toBe(originalRoom.id);
    expect(previewJob.workAreaOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workAreaId: originalRoom.id }),
        expect.objectContaining({ workAreaId: movedRoom.id }),
      ]),
    );
    await expect(prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } })).resolves.toMatchObject({
      workAreaId: originalRoom.id,
    });

    await runDayAllocation({
      date: "2026-06-02",
      dayStart: "09:00",
      dayEnd: "11:00",
      stepMinutes: 60,
      planStatuses: ["confirmed"],
      persist: true,
      planWorkAreaOverrides: [{ planId: plan.id, workAreaId: movedRoom.id }],
    });

    await expect(prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } })).resolves.toMatchObject({
      workAreaId: movedRoom.id,
      estUnitsPerPersonHour: 120,
    });
  });
});
