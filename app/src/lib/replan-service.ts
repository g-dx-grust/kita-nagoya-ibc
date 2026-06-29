import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export const REPLAN_EVENT_TYPES = [
  "demand_created",
  "demand_updated",
  "purchase_arrival_updated",
  "po_confirmed",
  "po_cancelled",
  "po_received",
  "stock_adjusted",
  "day_allocation_changed",
  "daily_report_approved",
] as const;

export type ReplanEventType = (typeof REPLAN_EVENT_TYPES)[number];

type ReplanClient = typeof prisma | Prisma.TransactionClient;
export type ReplanEventWithJobs = Prisma.ReplanEventGetPayload<{ include: { jobs: true } }>;

export type CreateReplanEventInput = {
  eventType: ReplanEventType;
  targetMonth?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  createdById?: string | null;
  payload?: unknown;
  scopeMonth?: string | null;
  scopeDateFrom?: Date | null;
  scopeDateTo?: Date | null;
  policy?: unknown;
  diff?: unknown;
};

export async function createReplanEventWithJob(
  input: CreateReplanEventInput,
  client: ReplanClient = prisma,
): Promise<ReplanEventWithJobs> {
  const scopeMonth = input.scopeMonth ?? input.targetMonth ?? null;
  return client.replanEvent.create({
    data: {
      eventType: input.eventType,
      targetMonth: input.targetMonth ?? scopeMonth,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdById: input.createdById ?? null,
      payloadJson: stringifyJson(input.payload),
      status: "pending",
      jobs: {
        create: {
          scopeMonth,
          scopeDateFrom: input.scopeDateFrom ?? null,
          scopeDateTo: input.scopeDateTo ?? null,
          policyJson: stringifyJson(input.policy ?? defaultPolicy(input.eventType)),
          status: "pending",
          diffJson: stringifyJson(
            input.diff ?? {
              status: "not_computed",
              note: "Sprint4では再計画が必要な事実だけを記録し、差分適用UIは後続Sprintで扱う。",
            },
          ),
        },
      },
    },
    include: { jobs: true },
  });
}

async function safeCreateReplanEventWithJob(
  input: CreateReplanEventInput,
  client: ReplanClient = prisma,
): Promise<ReplanEventWithJobs | null> {
  try {
    if (process.env.NODE_ENV === "test" && process.env.REPLAN_EVENT_FAIL_ONCE === "1") {
      delete process.env.REPLAN_EVENT_FAIL_ONCE;
      throw new Error("test_replan_enqueue_failure");
    }
    return await createReplanEventWithJob(input, client);
  } catch (error) {
    // ReplanEvent is a follow-up signal. Do not turn an already-successful business action
    // into a client-visible failure that could cause duplicate retries.
    console.error("[replan] failed_to_enqueue", {
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error,
    });
    return null;
  }
}

export async function enqueueDemandReplanEvent(input: {
  eventType: Extract<ReplanEventType, "demand_created" | "demand_updated">;
  demand: { id: string; dueDate: Date; productionDueDate?: Date | null };
  before?: unknown;
  action: "create" | "update" | "delete";
}) {
  const date = input.demand.productionDueDate ?? input.demand.dueDate;
  return safeCreateReplanEventWithJob({
    eventType: input.eventType,
    targetMonth: targetMonthFromDate(date),
    sourceType: "ProductDemand",
    sourceId: input.demand.id,
    payload: {
      action: input.action,
      before: input.before ?? null,
      after: input.action === "delete" ? null : input.demand,
    },
    scopeDateFrom: startOfDay(date),
    scopeDateTo: endOfMonth(date),
  });
}

export async function enqueuePurchaseOrderReplanEvents(input: {
  before: PurchaseOrderReplanSnapshot;
  after?: PurchaseOrderReplanSnapshot | null;
}) {
  const { before, after } = input;
  if (!after) return [];

  const events: ReplanEventWithJobs[] = [];
  if (dateKey(before.expectedArrivalDate) !== dateKey(after.expectedArrivalDate)) {
    const event = await safeCreateReplanEventWithJob({
        eventType: "purchase_arrival_updated",
        targetMonth: targetMonthFromPurchaseOrder(before, after),
        sourceType: "PurchaseOrder",
        sourceId: after.id ?? before.id ?? null,
        payload: { before, after },
        ...scopeFromPurchaseOrder(before, after),
      });
    if (event) events.push(event);
  }

  if (before.status !== "confirmed" && after.status === "confirmed") {
    const event = await safeCreateReplanEventWithJob({
        eventType: "po_confirmed",
        targetMonth: targetMonthFromPurchaseOrder(before, after),
        sourceType: "PurchaseOrder",
        sourceId: after.id ?? before.id ?? null,
        payload: { before, after },
        ...scopeFromPurchaseOrder(before, after),
      });
    if (event) events.push(event);
  }

  if (before.status !== "cancelled" && after.status === "cancelled") {
    const event = await safeCreateReplanEventWithJob({
      eventType: "po_cancelled",
      targetMonth: targetMonthFromPurchaseOrder(before, after),
      sourceType: "PurchaseOrder",
      sourceId: after.id ?? before.id ?? null,
      payload: { before, after },
      ...scopeFromPurchaseOrder(before, after),
    });
    if (event) events.push(event);
  }

  if (before.status !== "received" && after.status === "received") {
    const event = await safeCreateReplanEventWithJob({
      eventType: "po_received",
      targetMonth: targetMonthFromPurchaseOrder(before, after),
      sourceType: "PurchaseOrder",
      sourceId: after.id ?? before.id ?? null,
      payload: { before, after },
      ...scopeFromPurchaseOrder(before, after),
    });
    if (event) events.push(event);
  }

  return events;
}

export async function enqueueStockAdjustedReplanEvent(input: {
  movement: {
    id?: string | null;
    itemType: string;
    itemId: string;
    quantity?: number | null;
    movementType?: string | null;
    effectiveDate: Date;
    sourceType?: string | null;
    sourceId?: string | null;
  };
  action: "create" | "delete" | "grid_save";
  payload?: unknown;
}) {
  const date = input.movement.effectiveDate;
  return safeCreateReplanEventWithJob({
    eventType: "stock_adjusted",
    targetMonth: targetMonthFromDate(date),
    sourceType: "StockMovement",
    sourceId: input.movement.id ?? input.movement.sourceId ?? null,
    payload: {
      action: input.action,
      movement: input.movement,
      detail: input.payload ?? null,
    },
    scopeDateFrom: startOfDay(date),
    scopeDateTo: endOfMonth(date),
  });
}

export async function enqueueDayAllocationReplanEvent(input: {
  date: string;
  payload: unknown;
}) {
  const date = new Date(`${input.date}T00:00:00.000Z`);
  return safeCreateReplanEventWithJob({
    eventType: "day_allocation_changed",
    targetMonth: targetMonthFromDate(date),
    sourceType: "DayAllocation",
    sourceId: input.date,
    payload: input.payload,
    scopeDateFrom: startOfDay(date),
    scopeDateTo: endOfMonth(date),
  });
}

export async function enqueueDailyReportApprovedReplanEvent(input: {
  entry: { id: string; reportDate: Date; productId?: string | null; productionPlanId?: string | null };
}) {
  const date = input.entry.reportDate;
  return safeCreateReplanEventWithJob({
    eventType: "daily_report_approved",
    targetMonth: targetMonthFromDate(date),
    sourceType: "ProductionDailyReportEntry",
    sourceId: input.entry.id,
    payload: input.entry,
    scopeDateFrom: startOfDay(date),
    scopeDateTo: endOfMonth(date),
  });
}

export type PurchaseOrderReplanSnapshot = {
  id?: string | null;
  status?: string | null;
  itemType?: string | null;
  itemId?: string | null;
  shortageDate: Date | null;
  expectedArrivalDate: Date | null;
  recommendedOrderDate: Date | null;
  receivedDate?: Date | null;
};

export function targetMonthFromDate(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function startOfDay(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function targetMonthFromPurchaseOrder(
  before: PurchaseOrderReplanSnapshot,
  after: PurchaseOrderReplanSnapshot,
) {
  const date =
    after.expectedArrivalDate ??
    before.expectedArrivalDate ??
    after.shortageDate ??
    before.shortageDate ??
    after.recommendedOrderDate ??
    before.recommendedOrderDate ??
    new Date();
  return targetMonthFromDate(date);
}

function scopeFromPurchaseOrder(
  before: PurchaseOrderReplanSnapshot,
  after: PurchaseOrderReplanSnapshot,
) {
  const dates = [
    before.expectedArrivalDate,
    after.expectedArrivalDate,
    before.shortageDate,
    after.shortageDate,
    before.recommendedOrderDate,
    after.recommendedOrderDate,
  ].filter((date): date is Date => !!date);
  const min = dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : new Date();
  const max = dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : min;
  return {
    scopeDateFrom: startOfDay(min),
    scopeDateTo: endOfMonth(max),
  };
}

function dateKey(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function stringifyJson(value: unknown) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function defaultPolicy(eventType: ReplanEventType) {
  return {
    version: 1,
    eventType,
    applyAutomatically: false,
    moveStockProductionOnly: true,
    keepMonthlyProductionQuantity: true,
    lockConfirmedAndCompletedPlans: true,
    note: "ReplanEvent/ReplanJobは再計画が必要な事実の記録であり、このSprintではProductionPlanへ差分適用しない。",
  };
}
