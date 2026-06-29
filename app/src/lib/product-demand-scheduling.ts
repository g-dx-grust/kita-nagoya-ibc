import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { audit } from "./audit";
import { HttpError } from "./http";
import { recalculateProductionPlan } from "./plan-engine";
import { prisma } from "./prisma";
import { enqueueDemandReplanEvent } from "./replan-service";
import type { ProductDemandScheduleSchema } from "./schemas";

export type ProductDemandScheduleInput = z.infer<typeof ProductDemandScheduleSchema>;

type DemandForScheduling = Prisma.ProductDemandGetPayload<{
  include: {
    productionPlan: { include: { product: true; workArea: true } };
    product: {
      include: {
        defaultWorkArea: true;
        capacities: { include: { workArea: true } };
      };
    };
  };
}>;

export async function scheduleProductDemand(demandId: string, input: ProductDemandScheduleInput = {}) {
  const before = await prisma.productDemand.findUnique({
    where: { id: demandId },
    include: {
      productionPlan: { include: { product: true, workArea: true } },
      product: {
        include: {
          defaultWorkArea: true,
          capacities: {
            where: { active: true },
            include: { workArea: true },
            orderBy: [{ candidatePriority: "asc" }, { workArea: { displayOrder: "asc" } }, { id: "asc" }],
          },
        },
      },
    },
  });
  if (!before) throw new HttpError(404, "product_demand_not_found");
  if (before.productionPlan) {
    return {
      created: false,
      demand: before,
      productionPlan: before.productionPlan,
      replanEventId: null,
      replanJobId: null,
    };
  }
  if (before.status === "cancelled" || before.status === "fulfilled") {
    throw new HttpError(409, "product_demand_not_schedulable", { status: before.status });
  }

  const selected = await resolveWorkArea(before, input.workAreaId);
  const productionDate = new Date(input.date ?? dateInput(before.productionDueDate ?? before.dueDate));
  const plannedQuantity = input.quantity ?? before.quantity;
  const plannedStartTime = input.plannedStartTime ?? selected.workArea.defaultStartTime ?? "09:00";
  const baselineEndTime = input.baselineEndTime ?? selected.workArea.defaultEndTime ?? "17:00";
  const plannedPeopleCount = input.plannedPeopleCount ?? Math.max(1, selected.capacity?.standardPeople ?? 1);
  const note = [
    input.note?.trim() || null,
    `受注予定化 / ProductDemand ${before.id}`,
    before.customerName ? `得意先 ${before.customerName}` : null,
    before.externalRef ? `参照 ${before.externalRef}` : null,
  ].filter(Boolean).join(" / ");

  const { planId } = await prisma.$transaction(async (tx) => {
    const plan = await tx.productionPlan.create({
      data: {
        date: productionDate,
        productId: before.productId,
        productionType: "make_to_order",
        plannedQuantity,
        unit: before.product.unit,
        workAreaId: selected.workArea.id,
        plannedStartTime,
        desiredEndTime: baselineEndTime,
        breakMinutes: 0,
        plannedPeopleCount,
        status: "draft",
        baselineEndTime,
        note,
      },
    });
    const after = await tx.productDemand.update({
      where: { id: before.id },
      data: {
        productionPlanId: plan.id,
        productionDueDate: productionDate,
      },
    });
    await audit({ action: "create", entityType: "ProductionPlan", entityId: plan.id, after: plan }, tx);
    await audit({ action: "schedule", entityType: "ProductDemand", entityId: before.id, before, after }, tx);
    return { planId: plan.id };
  });

  await recalculateProductionPlan(planId, { refreshMaterialForecast: true });

  const demand = await prisma.productDemand.findUniqueOrThrow({
    where: { id: before.id },
    include: {
      product: true,
      productionPlan: { include: { product: true, workArea: true, requirements: true } },
    },
  });
  const replanEvent = await enqueueDemandReplanEvent({
    eventType: "demand_updated",
    demand,
    before,
    action: "update",
  });

  return {
    created: true,
    demand,
    productionPlan: demand.productionPlan,
    replanEventId: replanEvent?.id ?? null,
    replanJobId: replanEvent?.jobs[0]?.id ?? null,
  };
}

async function resolveWorkArea(demand: DemandForScheduling, requestedWorkAreaId?: string | null) {
  const activeCapacities = demand.product.capacities.filter(
    (capacity) =>
      capacity.workArea.active &&
      capacity.workArea.areaType === "internal" &&
      !capacity.workArea.externalFlag,
  );

  const capacity =
    (requestedWorkAreaId
      ? activeCapacities.find((row) => row.workAreaId === requestedWorkAreaId)
      : null) ??
    activeCapacities.find((row) => row.workAreaId === demand.product.defaultWorkAreaId) ??
    activeCapacities[0] ??
    null;

  if (capacity) return { workArea: capacity.workArea, capacity };

  const fallbackWorkArea = requestedWorkAreaId
    ? await prisma.workArea.findFirst({
        where: { id: requestedWorkAreaId, active: true, areaType: "internal", externalFlag: false },
      })
    : demand.product.defaultWorkArea && demand.product.defaultWorkArea.active && !demand.product.defaultWorkArea.externalFlag
      ? demand.product.defaultWorkArea
      : await prisma.workArea.findFirst({
          where: { active: true, areaType: "internal", externalFlag: false },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        });

  if (!fallbackWorkArea) {
    throw new HttpError(400, "schedulable_work_area_not_found", {
      productId: demand.productId,
      requestedWorkAreaId,
    });
  }

  return { workArea: fallbackWorkArea, capacity: null };
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
