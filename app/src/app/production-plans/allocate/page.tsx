import DayAllocationClient from "./day-allocation-client";
import { PLANNED_PRODUCTION_PLAN_STATUSES } from "@/lib/plan-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AllocateDayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const initialDate = sp.date ?? toDateInputValue(new Date());
  const [dayStart, dayEnd] = dayRange(initialDate);
  const [planCounts, shiftCount, activeEmployeeCount] = await Promise.all([
    prisma.productionPlan.groupBy({
      by: ["status"],
      where: {
        date: { gte: dayStart, lt: dayEnd },
        status: { in: [...PLANNED_PRODUCTION_PLAN_STATUSES] },
      },
      _count: { _all: true },
    }),
    prisma.shift.count({
      where: {
        date: { gte: dayStart, lt: dayEnd },
        status: { not: "off" },
        employee: { active: true },
      },
    }),
    prisma.employee.count({ where: { active: true } }),
  ]);
  const draftPlanCount = planCounts.find((row) => row.status === "draft")?._count._all ?? 0;
  const tentativeConfirmedPlanCount = planCounts.find((row) => row.status === "tentative_confirmed")?._count._all ?? 0;
  const confirmedPlanCount = planCounts.find((row) => row.status === "confirmed")?._count._all ?? 0;
  return (
    <DayAllocationClient
      initialDate={initialDate}
      initialReadiness={{
        planCount: draftPlanCount + tentativeConfirmedPlanCount + confirmedPlanCount,
        draftPlanCount: draftPlanCount + tentativeConfirmedPlanCount,
        confirmedPlanCount,
        shiftCount,
        activeEmployeeCount,
      }}
    />
  );
}

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end] as const;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
