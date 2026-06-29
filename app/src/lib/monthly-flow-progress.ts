import type { Prisma } from "@prisma/client";

import { kitagoyaPath } from "./paths";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "./plan-status";
import { prisma } from "./prisma";

type MonthlyFlowClient = typeof prisma | Prisma.TransactionClient;

export type MonthlyLoopStepKey =
  | "shifts"
  | "demand"
  | "candidates"
  | "adopt"
  | "purchase"
  | "arrival"
  | "tentative"
  | "confirm"
  | "demand_reflect"
  | "allocation"
  | "daily_report"
  | "inventory";

export type MonthlyLoopStep = {
  key: MonthlyLoopStepKey;
  order: number;
  label: string;
  completed: boolean;
  count: number;
  detail: string;
  href: string;
  anchor: string;
};

export type MonthlyLoopProgress = {
  yearMonth: string;
  dateFrom: string;
  dateTo: string;
  completedCount: number;
  totalCount: number;
  monthlyNextAction: {
    label: string;
    href: string;
    stepKey: MonthlyLoopStepKey;
  };
  steps: MonthlyLoopStep[];
  metrics: {
    shiftCount: number;
    demandSourceCount: number;
    runCount: number;
    candidateCount: number;
    adoptedRunCount: number;
    adoptedPlanCount: number;
    purchaseCandidateCount: number;
    arrivalScheduleCount: number;
    tentativePlanCount: number;
    confirmedPlanCount: number;
    linkedDemandCount: number;
    openDemandCount: number;
    assignmentCount: number;
    approvedDailyReportCount: number;
    inventoryMovementCount: number;
    pendingReplanEventCount: number;
    pendingReplanJobCount: number;
  };
};

export async function loadMonthlyLoopProgress(
  yearMonth: string,
  client: MonthlyFlowClient = prisma,
): Promise<MonthlyLoopProgress> {
  const { monthStart, monthEnd } = monthRange(yearMonth);
  const dateFrom = toDateInput(monthStart);
  const dateTo = toDateInput(monthEnd);
  const planningHub = (anchor: string) => kitagoyaPath(`/planning/monthly?ym=${yearMonth}#${anchor}`);

  const [
    shiftCount,
    monthlyActualCount,
    demandCount,
    specialDemandCount,
    runRows,
    adoptedRunCount,
    planStatusRows,
    adoptedPlanCount,
    purchaseCandidateCount,
    arrivalScheduleCount,
    linkedDemandCount,
    openDemandCount,
    assignmentCount,
    approvedDailyReportCount,
    inventoryMovementCount,
    pendingReplanEventCount,
    pendingReplanJobCount,
  ] = await Promise.all([
    client.shift.count({
      where: { date: { gte: monthStart, lte: monthEnd }, status: { not: "off" } },
    }),
    client.productMonthlyActual.count({ where: { yearMonth } }),
    client.productDemand.count({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { in: ["open", "tentative", "fulfilled"] },
      },
    }),
    client.specialDemandEvent.count({ where: { targetYearMonth: yearMonth, active: true } }),
    client.monthlyPlanningRun.findMany({
      where: { yearMonth },
      select: {
        id: true,
        status: true,
        _count: { select: { candidates: true, productionPlans: true } },
      },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    client.monthlyPlanningRun.count({ where: { yearMonth, status: "adopted" } }),
    client.productionPlan.groupBy({
      by: ["status"],
      where: { date: { gte: monthStart, lte: monthEnd }, status: { not: "cancelled" } },
      _count: { _all: true },
    }),
    client.productionPlan.count({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        status: { in: [...PLANNED_PRODUCTION_PLAN_STATUSES, "completed"] },
        planningRunId: { not: null },
      },
    }),
    client.purchaseOrder.count({
      where: {
        status: { in: ["candidate", "draft"] },
        OR: [
          { shortageDate: { gte: monthStart, lte: monthEnd } },
          { recommendedOrderDate: { gte: monthStart, lte: monthEnd } },
          { expectedArrivalDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
    }),
    client.purchaseOrder.count({
      where: {
        status: { in: ["ordered_unconfirmed", "confirmed", "received"] },
        expectedArrivalDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    client.productDemand.count({
      where: {
        productionPlanId: { not: null },
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          { productionDueDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
    }),
    client.productDemand.count({
      where: {
        status: { in: ["open", "tentative"] },
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          { productionDueDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
    }),
    client.productionPlanAssignment.count({
      where: { productionPlan: { date: { gte: monthStart, lte: monthEnd }, status: { not: "cancelled" } } },
    }),
    client.productionDailyReportEntry.count({
      where: {
        active: true,
        approvalStatus: "approved",
        reportDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    client.stockMovement.count({
      where: {
        status: "CONFIRMED",
        effectiveDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    client.replanEvent.count({
      where: { status: "pending", targetMonth: yearMonth },
    }),
    client.replanJob.count({
      where: { status: { in: ["pending", "planned"] }, scopeMonth: yearMonth },
    }),
  ]);

  const planCountByStatus = new Map(planStatusRows.map((row) => [row.status, row._count._all]));
  const candidateCount = runRows.reduce((sum, run) => sum + run._count.candidates, 0);
  const runCount = runRows.length;
  const demandSourceCount = monthlyActualCount + demandCount + specialDemandCount;
  const draftPlanCount = planCountByStatus.get("draft") ?? 0;
  const tentativePlanCount = planCountByStatus.get("tentative_confirmed") ?? 0;
  const confirmedPlanCount = (planCountByStatus.get("confirmed") ?? 0) + (planCountByStatus.get("completed") ?? 0);

  const steps: MonthlyLoopStep[] = [
    {
      key: "shifts",
      order: 1,
      label: "シフト登録",
      completed: shiftCount > 0,
      count: shiftCount,
      detail: `${shiftCount}件`,
      href: kitagoyaPath(`/shifts?month=${yearMonth}`),
      anchor: "shifts",
    },
    {
      key: "demand",
      order: 2,
      label: "需要算出",
      completed: demandSourceCount > 0 || runCount > 0,
      count: demandSourceCount,
      detail: `実績/受注 ${demandSourceCount}件`,
      href: planningHub("demand"),
      anchor: "demand",
    },
    {
      key: "candidates",
      order: 3,
      label: "候補生成",
      completed: candidateCount > 0,
      count: candidateCount,
      detail: `run ${runCount}件`,
      href: planningHub("candidates"),
      anchor: "candidates",
    },
    {
      key: "adopt",
      order: 4,
      label: "仮予定採用",
      completed: adoptedRunCount > 0 || adoptedPlanCount > 0 || draftPlanCount > 0,
      count: adoptedPlanCount || draftPlanCount,
      detail: `仮予定 ${draftPlanCount}件`,
      href: planningHub("confirm"),
      anchor: "confirm",
    },
    {
      key: "purchase",
      order: 5,
      label: "発注候補",
      completed: purchaseCandidateCount > 0 || arrivalScheduleCount > 0 || tentativePlanCount > 0 || confirmedPlanCount > 0,
      count: purchaseCandidateCount,
      detail: `候補 ${purchaseCandidateCount}件`,
      href: kitagoyaPath(`/purchases?targetMonth=${yearMonth}`),
      anchor: "purchase",
    },
    {
      key: "arrival",
      order: 6,
      label: "入荷予定",
      completed: arrivalScheduleCount > 0 || tentativePlanCount > 0 || confirmedPlanCount > 0,
      count: arrivalScheduleCount,
      detail: `入荷予定 ${arrivalScheduleCount}件`,
      href: kitagoyaPath(`/purchases?targetMonth=${yearMonth}#purchase-orders`),
      anchor: "purchase",
    },
    {
      key: "tentative",
      order: 7,
      label: "仮確定",
      completed: tentativePlanCount > 0 || confirmedPlanCount > 0,
      count: tentativePlanCount,
      detail: `仮確定 ${tentativePlanCount}件`,
      href: planningHub("promotable"),
      anchor: "promotable",
    },
    {
      key: "confirm",
      order: 8,
      label: "確定",
      completed: confirmedPlanCount > 0,
      count: confirmedPlanCount,
      detail: `確定/完了 ${confirmedPlanCount}件`,
      href: kitagoyaPath(`/production-plans?dateFrom=${dateFrom}&dateTo=${dateTo}`),
      anchor: "confirm",
    },
    {
      key: "demand_reflect",
      order: 9,
      label: "受注反映",
      completed: openDemandCount === 0 ? linkedDemandCount > 0 || demandCount === 0 : linkedDemandCount > 0,
      count: linkedDemandCount,
      detail: `紐づき ${linkedDemandCount}件 / 未処理 ${openDemandCount}件`,
      href: kitagoyaPath(`/product-planning?dateFrom=${dateFrom}&dateTo=${dateTo}#product-planning-demands`),
      anchor: "replan",
    },
    {
      key: "allocation",
      order: 10,
      label: "当日割当",
      completed: assignmentCount > 0,
      count: assignmentCount,
      detail: `配置 ${assignmentCount}件`,
      href: kitagoyaPath(`/production-plans/allocate?date=${dateFrom}`),
      anchor: "replan",
    },
    {
      key: "daily_report",
      order: 11,
      label: "日報承認",
      completed: approvedDailyReportCount > 0,
      count: approvedDailyReportCount,
      detail: `承認済み ${approvedDailyReportCount}件`,
      href: planningHub("daily-report"),
      anchor: "daily-report",
    },
    {
      key: "inventory",
      order: 12,
      label: "在庫更新",
      completed: inventoryMovementCount > 0,
      count: inventoryMovementCount,
      detail: `台帳 ${inventoryMovementCount}件`,
      href: planningHub("inventory"),
      anchor: "inventory",
    },
  ];

  const next = steps.find((step) => !step.completed) ?? steps[steps.length - 1];

  return {
    yearMonth,
    dateFrom,
    dateTo,
    completedCount: steps.filter((step) => step.completed).length,
    totalCount: steps.length,
    monthlyNextAction: {
      label: next.label,
      href: next.href,
      stepKey: next.key,
    },
    steps,
    metrics: {
      shiftCount,
      demandSourceCount,
      runCount,
      candidateCount,
      adoptedRunCount,
      adoptedPlanCount,
      purchaseCandidateCount,
      arrivalScheduleCount,
      tentativePlanCount,
      confirmedPlanCount,
      linkedDemandCount,
      openDemandCount,
      assignmentCount,
      approvedDailyReportCount,
      inventoryMovementCount,
      pendingReplanEventCount,
      pendingReplanJobCount,
    },
  };
}

export function normalizeYearMonth(value: string | undefined | null, fallback = new Date()) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return fallback.toISOString().slice(0, 7);
}

export function monthRange(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error("yearMonth must be YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    monthStart: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    monthEnd: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
  };
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
