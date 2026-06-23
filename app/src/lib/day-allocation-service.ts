// 当日の生産予定 + 出勤シフトから、遊休ゼロの人員割り当てを計算するサービス。
// 生産予定（前年同月/前月ベースで確定→月間スケジュールから生成されたもの）を起点に、
// 出勤者を作業場所へ割り当て、保存時は原料/資材所要量も再計算する。

import { computeMoveLinks } from "./assignment-move-link";
import { loadActiveBreakWindows } from "./break-windows";
import { recalculateProductionPlan } from "./plan-engine";
import { prisma } from "./prisma";
import {
  allocateDayStaff,
  type AllocationJob,
  type AllocationResult,
  type AllocationStaff,
  type PinnedAssignment,
} from "./staff-allocation";

export type PlanWorkAreaOverride = {
  planId: string;
  workAreaId: string;
};

export type DayAllocationWorkAreaOption = {
  workAreaId: string;
  workAreaName: string;
  maxPeopleCount: number;
};

export type DayAllocationOptions = {
  date: string; // YYYY-MM-DD
  dayStart: string;
  dayEnd: string;
  stepMinutes: number;
  planStatuses: string[];
  persist: boolean;
  /** 手動ピン留め（ドラッグ微調整）。 */
  pinnedAssignments?: PinnedAssignment[];
  /** 商品（生産予定）単位の作業場所変更。保存時は ProductionPlan.workAreaId に反映する。 */
  planWorkAreaOverrides?: PlanWorkAreaOverride[];
};

export type DayAllocationServiceResult = {
  date: string;
  persisted: boolean;
  allocation: AllocationResult;
  /** 生産能力が見つからずスキップした予定 */
  skippedPlans: { planId: string; productName: string; reason: string }[];
  /** 当日ジョブのある作業場所と同時人数上限（部屋ボックスの容量バッジ表示用） */
  workAreaCapacities: DayAllocationWorkAreaOption[];
};

export async function runDayAllocation(options: DayAllocationOptions): Promise<DayAllocationServiceResult> {
  const [dayStart, dayEnd] = dayRange(options.date);

  const [plans, shifts, breakWindows] = await Promise.all([
    prisma.productionPlan.findMany({
      where: { date: { gte: dayStart, lt: dayEnd }, status: { in: options.planStatuses } },
      include: { product: true, workArea: true },
      orderBy: [{ workAreaId: "asc" }, { plannedStartTime: "asc" }],
    }),
    prisma.shift.findMany({
      where: { date: { gte: dayStart, lt: dayEnd }, status: { not: "off" }, employee: { active: true } },
      include: { employee: true },
      orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
    }),
    loadActiveBreakWindows(dayStart),
  ]);

  // 生産能力(1人1時間あたり)を商品×作業場所で引く。
  // 商品の部屋変更をプレビューできるよう、対象商品の有効な内部作業場所も候補として取得する。
  const productIds = [...new Set(plans.map((plan) => plan.productId))];
  const internalWorkAreas = await prisma.workArea.findMany({
    where: { areaType: "internal", active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const candidateWorkAreaIds = [
    ...new Set([...internalWorkAreas.map((area) => area.id), ...plans.map((plan) => plan.workAreaId)]),
  ];
  const capacities =
    productIds.length > 0 && candidateWorkAreaIds.length > 0
      ? await prisma.productionCapacity.findMany({
          where: {
            productId: { in: productIds },
            workAreaId: { in: candidateWorkAreaIds },
            active: true,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: dayStart } }] },
              { OR: [{ validTo: null }, { validTo: { gt: dayStart } }] },
            ],
          },
          include: { workArea: true },
        })
      : [];
  const capacityMap = new Map(capacities.map((c) => [`${c.productId}:${c.workAreaId}`, c]));
  const optionByProduct = buildWorkAreaOptionsByProduct(capacities);
  const overrideByPlanId = new Map(
    (options.planWorkAreaOverrides ?? [])
      .filter((override) => plans.some((plan) => plan.id === override.planId))
      .map((override) => [override.planId, override.workAreaId]),
  );

  const skippedPlans: DayAllocationServiceResult["skippedPlans"] = [];
  const jobs: AllocationJob[] = [];
  for (const plan of plans) {
    const overrideWorkAreaId = overrideByPlanId.get(plan.id);
    const effectiveWorkAreaId =
      overrideWorkAreaId && capacityMap.has(`${plan.productId}:${overrideWorkAreaId}`)
        ? overrideWorkAreaId
        : plan.workAreaId;
    const capacity = capacityMap.get(`${plan.productId}:${effectiveWorkAreaId}`);
    const workArea = capacity?.workArea ?? plan.workArea;
    const unitsPerPersonHour = capacity?.unitsPerPersonHour ?? plan.estUnitsPerPersonHour ?? 0;
    if (unitsPerPersonHour <= 0) {
      skippedPlans.push({
        planId: plan.id,
        productName: plan.product.officialName,
        reason: "作業場所別の生産能力(1人1時間あたり)が未登録です。",
      });
      continue;
    }
    jobs.push({
      jobId: plan.id,
      productId: plan.productId,
      productName: plan.product.officialName,
      workAreaId: workArea.id,
      workAreaName: workArea.name,
      originalWorkAreaId: plan.workAreaId,
      originalWorkAreaName: plan.workArea.name,
      workAreaOptions: ensureCurrentWorkAreaOption(
        optionByProduct.get(plan.productId) ?? [],
        workArea.id,
        workArea.name,
      ),
      workAreaDisplayOrder: workArea.displayOrder,
      quantity: plan.plannedQuantity,
      unit: plan.unit,
      unitsPerPersonHour,
      roomMaxPeople: workArea.maxPeopleCount ?? 1,
      earliestStart: plan.plannedStartTime,
    });
  }

  const staff: AllocationStaff[] = shifts.map((shift) => ({
    employeeId: shift.employeeId,
    employeeName: shift.employee.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
  }));

  // 当日ジョブのある作業場所と同時人数上限（部屋ボックスの容量バッジ用。出現順を保持）
  const capByArea = new Map<string, { workAreaId: string; workAreaName: string; maxPeopleCount: number }>();
  for (const job of jobs) {
    if (!capByArea.has(job.workAreaId)) {
      capByArea.set(job.workAreaId, {
        workAreaId: job.workAreaId,
        workAreaName: job.workAreaName,
        maxPeopleCount: job.roomMaxPeople,
      });
    }
  }
  const workAreaCapacities = [...capByArea.values()];

  // ピン留めは当日のジョブが存在する作業場所のみ有効
  const jobWorkAreaIds = new Set(jobs.map((job) => job.workAreaId));
  const pinnedAssignments = (options.pinnedAssignments ?? []).filter((pin) =>
    jobWorkAreaIds.has(pin.workAreaId),
  );

  const allocation = allocateDayStaff({
    dayStart: options.dayStart,
    dayEnd: options.dayEnd,
    stepMinutes: options.stepMinutes,
    breakWindows,
    staff,
    jobs,
    pinnedAssignments,
  });

  if (!options.persist) {
    return { date: options.date, persisted: false, allocation, skippedPlans, workAreaCapacities };
  }

  const planIds = jobs.map((job) => job.jobId);
  // 印刷用「前の部屋 → 次の部屋」表示のため、従業員ごとの時系列から各割当の直前 planId を引く。
  // jobId は実 ProductionPlan.id なので、そのまま moveAfterPlanId に使える。
  const moveLinks = computeMoveLinks(
    allocation.jobs.flatMap((job) =>
      job.assignments.map((a) => ({ employeeId: a.employeeId, planId: job.jobId, startTime: a.startTime })),
    ),
  );
  await prisma.$transaction(async (tx) => {
    await tx.productionPlanAssignment.deleteMany({ where: { productionPlanId: { in: planIds } } });
    for (const job of allocation.jobs) {
      if (job.assignments.length > 0) {
        await tx.productionPlanAssignment.createMany({
          data: job.assignments.map((a) => ({
            productionPlanId: job.jobId,
            employeeId: a.employeeId,
            startTime: a.startTime,
            endTime: a.endTime,
            moveAfterPlanId: moveLinks.get(a.employeeId, job.jobId),
          })),
        });
      }
      const peakPeople = job.peopleSegments.reduce((max, seg) => Math.max(max, seg.peopleCount), 0);
      const workAreaUpdate =
        job.originalWorkAreaId && job.workAreaId !== job.originalWorkAreaId
          ? { workAreaId: job.workAreaId }
          : {};
      await tx.productionPlan.update({
        where: { id: job.jobId },
        data: {
          ...workAreaUpdate,
          plannedStartTime: job.startTime ?? undefined,
          plannedEndTime: job.endTime ?? undefined,
          plannedPeopleCount: peakPeople || undefined,
          overflowQuantity: job.overflowQuantity,
        },
      });
    }
  });

  // 原料/資材所要量・在庫連動を再計算（監査ログは plan-engine 側で残す）
  for (const planId of planIds) {
    await recalculateProductionPlan(planId);
  }

  return { date: options.date, persisted: true, allocation, skippedPlans, workAreaCapacities };
}

function buildWorkAreaOptionsByProduct(
  capacities: Array<{
    productId: string;
    workAreaId: string;
    workArea: { id: string; name: string; areaType: string; active: boolean; maxPeopleCount: number; displayOrder: number };
  }>,
) {
  const map = new Map<string, DayAllocationWorkAreaOption[]>();
  const seen = new Set<string>();
  for (const capacity of capacities) {
    if (!capacity.workArea.active || capacity.workArea.areaType !== "internal") continue;
    const key = `${capacity.productId}:${capacity.workAreaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = map.get(capacity.productId) ?? [];
    list.push({
      workAreaId: capacity.workArea.id,
      workAreaName: capacity.workArea.name,
      maxPeopleCount: capacity.workArea.maxPeopleCount ?? 1,
    });
    map.set(capacity.productId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.workAreaName.localeCompare(b.workAreaName, "ja"));
  }
  return map;
}

function ensureCurrentWorkAreaOption(
  options: DayAllocationWorkAreaOption[],
  workAreaId: string,
  workAreaName: string,
): DayAllocationWorkAreaOption[] {
  if (options.some((option) => option.workAreaId === workAreaId)) return options;
  return [{ workAreaId, workAreaName, maxPeopleCount: 1 }, ...options];
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}
