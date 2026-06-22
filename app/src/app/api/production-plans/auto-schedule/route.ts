import { computeMoveLinks } from "@/lib/assignment-move-link";
import { audit } from "@/lib/audit";
import { assignBalancedRooms } from "@/lib/auto-schedule-allocation";
import {
  compareAutoScheduleItems,
  productionTypeScheduleRank,
  sortCapacitiesForProductionType,
  sortUsableCapacitiesForProductionType,
} from "@/lib/auto-schedule-policy";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { filterSelectedSchedulePlans } from "@/lib/auto-schedule-selection";
import {
  computeMaxQuantityInTimeWindow,
  computeProductionDuration,
  computeQuantityWithinTimeWindow,
  computeRequiredPeople,
  nextWorkingMinute,
} from "@/lib/calculations";
import { badRequest, created, handleError, ok, parseJson } from "@/lib/http";
import { recalculateProductionPlan } from "@/lib/plan-engine";
import { prisma } from "@/lib/prisma";
import { computeAssignablePeople } from "@/lib/schedule";
import { allocateDayStaff, type AllocationJob, type AllocationStaff } from "@/lib/staff-allocation";
import { formatHM, parseHM } from "@/lib/time";
import { AutoScheduleCreateSchema } from "@/lib/schemas";
import { kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity } from "@/lib/units";

type LoadedProduct = Awaited<ReturnType<typeof loadProducts>>[number];
type LoadedCapacity = LoadedProduct["capacities"][number];
type LoadedWorkArea = Awaited<ReturnType<typeof loadInternalWorkAreas>>[number];
type CandidateCapacity = {
  id: string | null;
  productId: string;
  workAreaId: string;
  workArea: LoadedWorkArea;
  unitsPerPersonHour: number;
  standardPeople: number;
  standardBreakMinutes: number;
  candidatePriority: number | null;
  note: string | null;
  synthetic: boolean;
  sourceWorkAreaName: string | null;
};
type StaffState = {
  employeeId: string;
  name: string;
  shiftStart: number;
  shiftEnd: number;
  freeAt: number;
  lastPlanId: string | null;
  lastWorkAreaId: string | null;
  busyRanges: { start: number; end: number }[];
};
type ScheduledAssignment = {
  employeeId: string;
  employeeName: string;
  moveAfterPlanId: string | null;
};
type ScheduledPlan = {
  tempId: string;
  productId: string;
  productName: string;
  productionType: string;
  unit: string;
  workAreaId: string;
  workAreaName: string;
  capacity: CandidateCapacity;
  start: number;
  end: number;
  quantity: number;
  targetPeople: number;
  assignedStaff: ScheduledAssignment[];
  /** 遊休ゼロエンジン由来の従業員ごと実作業時間帯（保存時はこれを使う）。 */
  assignmentSegments?: { employeeId: string; startTime: string; endTime: string }[];
  warnings: string[];
};
type AutoScheduleOverride = {
  tempId: string;
  workAreaId?: string;
  employeeIds?: string[];
};

const modeLabels: Record<string, string> = {
  duration: "数量固定→終了時刻",
  max_quantity: "時間枠固定→最大数量",
  required_people: "数量+時間枠→必要人数",
};

export async function POST(req: Request) {
  try {
    const parsed = await parseJson(req, AutoScheduleCreateSchema);
    const body = {
      mode: "max_quantity",
      startTime: "09:00",
      desiredEndTime: "17:00",
      baselineEndTime: "17:00",
      status: "draft",
      replaceExistingDrafts: false,
      persist: false,
      ...parsed,
      items: parsed.items.map((item) => ({
        productionType: "stock",
        ...item,
      })),
    };
    const targetDate = new Date(body.date);
    const [dayStart, dayEnd] = dayRange(body.date);
    const scheduleStart = parseHM(body.startTime);
    const desiredEnd = parseHM(body.desiredEndTime);

    const productIds = [...new Set(body.items.map((item) => item.productId))];
    const [products, internalWorkAreas, shifts, existingPlans, existingAssignments, breakWindows] = await Promise.all([
      loadProducts(productIds),
      loadInternalWorkAreas(),
      prisma.shift.findMany({
        where: {
          date: { gte: dayStart, lt: dayEnd },
          status: { not: "off" },
          employee: { active: true },
        },
        include: { employee: true },
        orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
      }),
      prisma.productionPlan.findMany({
        where: {
          date: { gte: dayStart, lt: dayEnd },
          status: { in: ["confirmed", "completed"] },
        },
        select: { workAreaId: true, plannedStartTime: true, plannedEndTime: true },
      }),
      prisma.productionPlanAssignment.findMany({
        where: {
          productionPlan: {
            date: { gte: dayStart, lt: dayEnd },
            status: { in: ["confirmed", "completed"] },
          },
        },
      }),
      loadActiveBreakWindows(targetDate),
    ]);

    if (internalWorkAreas.length === 0) {
      return badRequest("no_internal_work_area", {
        message: "外注以外の有効な作業場所がありません。作業場所マスターを確認してください。",
      });
    }

    if (shifts.length === 0) {
      return badRequest("no_shift_staff", {
        message: "対象日の出勤シフトがありません。先にシフトを登録してください。",
      });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of body.items) {
      if (!productMap.has(item.productId)) return badRequest("product_not_found", item);
    }

    const busyByEmployee = new Map<string, { start: number; end: number }[]>();
    for (const assignment of existingAssignments) {
      const ranges = busyByEmployee.get(assignment.employeeId) ?? [];
      ranges.push({ start: parseHM(assignment.startTime), end: parseHM(assignment.endTime) });
      busyByEmployee.set(assignment.employeeId, ranges);
    }

    const staffStates: StaffState[] = shifts
      .filter((shift) => parseHM(shift.startTime) < parseHM(shift.endTime))
      .map((shift) => ({
        employeeId: shift.employeeId,
        name: shift.employee.name,
        shiftStart: parseHM(shift.startTime),
        shiftEnd: parseHM(shift.endTime),
        freeAt: parseHM(shift.startTime),
        lastPlanId: null,
        lastWorkAreaId: null,
        busyRanges: busyByEmployee.get(shift.employeeId) ?? [],
      }));

    if (staffStates.length === 0) {
      return badRequest("no_valid_shift_staff");
    }

    const areaCursor = new Map<string, number>();
    for (const plan of existingPlans) {
      if (!plan.plannedEndTime) continue;
      const start = parseHM(plan.plannedStartTime);
      const end = parseHM(plan.plannedEndTime);
      if (end <= scheduleStart || end <= start) continue;
      areaCursor.set(plan.workAreaId, Math.max(areaCursor.get(plan.workAreaId) ?? scheduleStart, end));
    }

    let scheduledPlans: ScheduledPlan[];

    if (body.mode === "max_quantity") {
      // 遊休ゼロ: 全出勤者を複数部屋へ並行配置し、空いた人を別部屋へ合流させる。
      scheduledPlans = buildMaxQuantityScheduledPlans({
        items: body.items,
        productMap,
        internalWorkAreas,
        staffStates,
        areaCursor,
        scheduleStart,
        windowEnd: desiredEnd,
        breakWindows,
        overrides: body.overrides ?? [],
      });
    } else {
      scheduledPlans = [];
      for (const [index, item] of body.items.entries()) {
        const product = productMap.get(item.productId)!;
        const capacities = getSchedulableCapacities(product, internalWorkAreas, item.productionType);
        const currentlyAvailableStaff = countAvailableStaffAt(staffStates, scheduleStart);
        const peopleLimit = estimatePeopleLimitForRemainingRooms(
          body.items.slice(index),
          productMap,
          internalWorkAreas,
          currentlyAvailableStaff,
        );
        const choice = chooseBestSlot({
          capacities,
          mode: body.mode,
          quantity: item.quantity,
          staffStates,
          areaCursor,
          scheduleStart,
          desiredEnd,
          baselineEndTime: body.baselineEndTime,
          peopleLimit,
        });
        if (!choice) {
          throw new AutoScheduleError("capacity_not_found", {
            productId: product.id,
            productName: product.officialName,
            message: "外注以外の有効な作業場所別生産能力がありません。",
          });
        }

        const { capacity, slot } = choice;
        const tempId = `preview-${index + 1}`;
        const assignedStaff = slot.assignedStaff.map((staff) => ({
          employeeId: staff.employeeId,
          employeeName: staff.name,
          moveAfterPlanId: staff.lastPlanId,
        }));

        for (const staff of slot.assignedStaff) {
          staff.freeAt = slot.end;
          staff.lastPlanId = tempId;
          staff.lastWorkAreaId = capacity.workAreaId;
          staff.busyRanges.push({ start: slot.start, end: slot.end });
        }
        areaCursor.set(capacity.workAreaId, slot.end);

        scheduledPlans.push({
          tempId,
          productId: product.id,
          productName: product.officialName,
          productionType: item.productionType,
          unit: product.unit,
          workAreaId: capacity.workAreaId,
          workAreaName: capacity.workArea.name,
          capacity,
          start: slot.start,
          end: slot.end,
          quantity: slot.quantity,
          targetPeople: slot.targetPeople,
          assignedStaff,
          warnings: slot.warnings,
        });
      }
      applyOverrides({
        scheduledPlans,
        overrides: body.overrides ?? [],
        productMap,
        internalWorkAreas,
        staffStates,
        existingBusyByEmployee: busyByEmployee,
      });
    }

    if (!body.persist) {
      return ok({
        date: body.date,
        mode: body.mode,
        persisted: false,
        plans: scheduledPlans.map((plan) => toResponsePlan(plan)),
        availableStaff: availableStaffResponse(staffStates),
      });
    }

    scheduledPlans = filterSelectedSchedulePlans(scheduledPlans, body.selectedTempIds);
    if (scheduledPlans.length === 0) {
      return badRequest("no_selected_schedule_plan", {
        message: "当日実施に選択された予定がありません。",
      });
    }

    // 印刷用「前の部屋 → 次の部屋」表示のため、従業員ごとの時系列から各割当の直前 planId を引く。
    // 遊休ゼロエンジン由来の従業員ごとセグメント(assignmentSegments)を tempId 単位で連結する。
    // ここでの planId は tempId なので、保存時に persistedIdByTemp で実 planId へ解決する。
    const moveLinks = computeMoveLinks(
      scheduledPlans.flatMap((plan) =>
        (plan.assignmentSegments ?? []).map((segment) => ({
          employeeId: segment.employeeId,
          planId: plan.tempId,
          startTime: segment.startTime,
        })),
      ),
    );

    const persistedPlans: ReturnType<typeof toResponsePlan>[] = [];
    await prisma.$transaction(async (tx) => {
      if (body.replaceExistingDrafts) {
        await tx.productionPlan.deleteMany({
          where: { date: { gte: dayStart, lt: dayEnd }, status: "draft" },
        });
      }

      // tempId を含む moveAfterPlanId は、全予定を作り終えてから実 planId へ解決する
      // （従業員の直前の部屋が配列上で後ろにある場合でも取りこぼさない）。
      type PendingAssignment = {
        productionPlanId: string;
        employeeId: string;
        startTime: string;
        endTime: string;
        /** 従業員の直前の予定の tempId（先頭は null）。解決後に moveAfterPlanId へ。 */
        moveAfterTempId: string | null;
      };
      const persistedIdByTemp = new Map<string, string>();
      const pendingAssignments: PendingAssignment[] = [];
      for (const [index, scheduled] of scheduledPlans.entries()) {
        if (scheduled.quantity <= 0) {
          // 遊休ゼロ配置では作りきれず0になる商品があり得る。確定対象から外し、他の予定は作る。
          if (body.mode === "max_quantity") continue;
          throw new AutoScheduleError("no_schedulable_quantity", {
            productName: scheduled.productName,
            message: "シフト時間内に作成できる数量がありません。",
          });
        }

        if (scheduled.capacity.synthetic) {
          await tx.productionCapacity.upsert({
            where: {
              productId_workAreaId: {
                productId: scheduled.productId,
                workAreaId: scheduled.workAreaId,
              },
            },
            create: {
              productId: scheduled.productId,
              workAreaId: scheduled.workAreaId,
              unitsPerPersonHour: scheduled.capacity.unitsPerPersonHour,
              standardPeople: scheduled.capacity.standardPeople,
              standardBreakMinutes: scheduled.capacity.standardBreakMinutes,
              note: buildGeneratedCapacityNote(scheduled.capacity),
            },
            update: {},
          });
        }

        const plan = await tx.productionPlan.create({
          data: {
            date: targetDate,
            productId: scheduled.productId,
            productionType: scheduled.productionType,
            plannedQuantity: ceilDisplayQuantity(scheduled.quantity) ?? 0,
            unit: scheduled.unit,
            workAreaId: scheduled.workAreaId,
            plannedStartTime: formatHM(scheduled.start),
            plannedEndTime: formatHM(scheduled.end),
            desiredEndTime: body.desiredEndTime,
            breakMinutes: 0,
            plannedPeopleCount: scheduled.targetPeople,
            status: body.status,
            baselineEndTime: body.baselineEndTime,
            overtimeMinutes: Math.max(0, scheduled.end - parseHM(body.baselineEndTime)),
            note: buildNote(body.mode, index + 1, scheduled.warnings),
          },
        });
        persistedIdByTemp.set(scheduled.tempId, plan.id);

        if (scheduled.assignmentSegments && scheduled.assignmentSegments.length > 0) {
          // 遊休ゼロエンジン由来: 従業員ごとの実作業時間帯で保存（合流・移動を反映）。
          // moveAfterPlanId は従業員の直前の予定（別部屋を含む）。tempId を保持し後で解決する。
          for (const segment of scheduled.assignmentSegments) {
            pendingAssignments.push({
              productionPlanId: plan.id,
              employeeId: segment.employeeId,
              startTime: segment.startTime,
              endTime: segment.endTime,
              moveAfterTempId: moveLinks.get(segment.employeeId, scheduled.tempId),
            });
          }
        } else if (scheduled.assignedStaff.length > 0) {
          for (const staff of scheduled.assignedStaff) {
            pendingAssignments.push({
              productionPlanId: plan.id,
              employeeId: staff.employeeId,
              startTime: formatHM(scheduled.start),
              endTime: formatHM(scheduled.end),
              moveAfterTempId: staff.moveAfterPlanId,
            });
          }
        }

        persistedPlans.push(toResponsePlan(scheduled, plan.id));
      }

      if (pendingAssignments.length > 0) {
        await tx.productionPlanAssignment.createMany({
          data: pendingAssignments.map((pending) => ({
            productionPlanId: pending.productionPlanId,
            employeeId: pending.employeeId,
            startTime: pending.startTime,
            endTime: pending.endTime,
            moveAfterPlanId: pending.moveAfterTempId
              ? persistedIdByTemp.get(pending.moveAfterTempId) ?? null
              : null,
          })),
        });
      }
    });

    for (const plan of persistedPlans) {
      if (!plan.id) continue;
      await recalculateProductionPlan(plan.id);
      if (body.mode !== "duration") {
        await prisma.productionPlan.update({
          where: { id: plan.id },
          data: {
            plannedEndTime: plan.endTime,
            overtimeMinutes: Math.max(0, parseHM(plan.endTime) - parseHM(body.baselineEndTime)),
          },
        });
      }
    }

    await audit({
      action: "auto_schedule_confirm",
      entityType: "ProductionPlan",
      entityId: body.date,
      after: persistedPlans,
    });

    return created({
      date: body.date,
      mode: body.mode,
      persisted: true,
      plans: persistedPlans,
      availableStaff: availableStaffResponse(staffStates),
      printUrls: {
        schedule: kitagoyaPath(`/prints/production-schedule?date=${body.date}`),
        staff: kitagoyaPath(`/prints/staff-assignments?date=${body.date}`),
      },
    });
  } catch (e) {
    if (e instanceof AutoScheduleError) return badRequest(e.message, e.details);
    return handleError(e);
  }
}

async function loadProducts(productIds: string[]) {
  return prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: { capacities: { include: { workArea: true } } },
  });
}

function toResponsePlan(plan: ScheduledPlan, id?: string) {
  return {
    id,
    tempId: plan.tempId,
    productId: plan.productId,
    productName: plan.productName,
    productionType: plan.productionType,
    workAreaId: plan.workAreaId,
    workAreaName: plan.workAreaName,
    startTime: formatHM(plan.start),
    endTime: formatHM(plan.end),
    quantity: plan.quantity,
    assignedCount: plan.assignedStaff.length,
    assignedStaff: plan.assignedStaff.map((staff) => ({
      employeeId: staff.employeeId,
      employeeName: staff.employeeName,
    })),
    warnings: plan.warnings,
  };
}

function availableStaffResponse(staffStates: StaffState[]) {
  return staffStates.map((staff) => ({
    employeeId: staff.employeeId,
    employeeName: staff.name,
    startTime: formatHM(staff.shiftStart),
    endTime: formatHM(staff.shiftEnd),
  }));
}

async function loadInternalWorkAreas() {
  return prisma.workArea.findMany({
    where: { active: true, areaType: "internal", externalFlag: false },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
}

function getSchedulableCapacities(
  product: LoadedProduct,
  internalWorkAreas: LoadedWorkArea[],
  productionType = product.productionType,
  roleFiltered = true,
): CandidateCapacity[] {
  const registered = product.capacities.filter(
    (capacity) =>
      capacity.workArea.active &&
      capacity.workArea.areaType === "internal" &&
      !capacity.workArea.externalFlag,
  );
  if (registered.length === 0) return [];

  const byWorkAreaId = new Map(registered.map((capacity) => [capacity.workAreaId, capacity]));
  const template =
    registered.find((capacity) => capacity.workAreaId === product.defaultWorkAreaId) ??
    [...registered].sort((a, b) => b.unitsPerPersonHour - a.unitsPerPersonHour)[0];

  const registeredCandidates = registered.map((capacity) => toCandidateCapacity(capacity));
  const generatedCandidates = internalWorkAreas
    .filter((workArea) => !byWorkAreaId.has(workArea.id))
    .map((workArea) => ({
      id: null,
      productId: product.id,
      workAreaId: workArea.id,
      workArea,
      unitsPerPersonHour: template.unitsPerPersonHour,
      standardPeople: template.standardPeople,
      standardBreakMinutes: template.standardBreakMinutes,
      candidatePriority: workArea.displayOrder,
      note: template.note,
      synthetic: true,
      sourceWorkAreaName: template.workArea.name,
    }));

  const sorted = [...registeredCandidates, ...generatedCandidates].sort((a, b) => {
    const priorityDiff = priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority);
    const defaultScore =
      Number(b.workAreaId === product.defaultWorkAreaId) - Number(a.workAreaId === product.defaultWorkAreaId);
    return (
      priorityDiff ||
      defaultScore ||
      a.workArea.displayOrder - b.workArea.displayOrder ||
      a.workArea.name.localeCompare(b.workArea.name, "ja")
    );
  });
  return roleFiltered
    ? sortCapacitiesForProductionType(sorted, productionType)
    : sortUsableCapacitiesForProductionType(sorted, productionType);
}

function toCandidateCapacity(capacity: LoadedCapacity): CandidateCapacity {
  return {
    id: capacity.id,
    productId: capacity.productId,
    workAreaId: capacity.workAreaId,
    workArea: capacity.workArea,
    unitsPerPersonHour: capacity.unitsPerPersonHour,
    standardPeople: capacity.standardPeople,
    standardBreakMinutes: capacity.standardBreakMinutes,
    candidatePriority: capacity.candidatePriority,
    note: capacity.note,
    synthetic: false,
    sourceWorkAreaName: null,
  };
}

function priorityKey(priority: number | null | undefined) {
  return priority == null ? Number.MAX_SAFE_INTEGER : priority;
}

function chooseBestSlot({
  capacities,
  mode,
  quantity,
  staffStates,
  areaCursor,
  scheduleStart,
  desiredEnd,
  baselineEndTime,
  peopleLimit,
}: {
  capacities: CandidateCapacity[];
  mode: string;
  quantity: number;
  staffStates: StaffState[];
  areaCursor: Map<string, number>;
  scheduleStart: number;
  desiredEnd: number;
  baselineEndTime: string;
  peopleLimit: number;
}) {
  const choices = capacities.map((capacity) => {
    const baseStart = nextWorkingMinute(
      Math.max(scheduleStart, areaCursor.get(capacity.workAreaId) ?? scheduleStart),
    );
    const slot = buildSlot({
      mode,
      quantity,
      capacity,
      staffStates,
      baseStart,
      desiredEnd,
      baselineEndTime,
      peopleLimit,
    });
    return { capacity, slot };
  });

  return (
    choices.sort((a, b) => compareSlotChoices(a, b, { mode, requestedQuantity: quantity }))[0] ?? null
  );
}

function compareSlotChoices(
  a: { capacity: CandidateCapacity; slot: ReturnType<typeof buildSlot> },
  b: { capacity: CandidateCapacity; slot: ReturnType<typeof buildSlot> },
  context: { mode: string; requestedQuantity: number },
) {
  const aHasStaff = Number(a.slot.assignedStaff.length > 0);
  const bHasStaff = Number(b.slot.assignedStaff.length > 0);
  if (aHasStaff !== bHasStaff) return bHasStaff - aHasStaff;

  const aFull = Number(a.slot.quantity >= context.requestedQuantity);
  const bFull = Number(b.slot.quantity >= context.requestedQuantity);
  if (aFull !== bFull) return bFull - aFull;

  if (context.mode === "max_quantity" || !aFull) {
    const quantityDiff = b.slot.quantity - a.slot.quantity;
    if (quantityDiff !== 0) return quantityDiff;
  }

  return (
    a.slot.end - b.slot.end ||
    a.slot.start - b.slot.start ||
    b.slot.assignedStaff.length - a.slot.assignedStaff.length ||
    Number(a.capacity.synthetic) - Number(b.capacity.synthetic) ||
    a.capacity.workArea.displayOrder - b.capacity.workArea.displayOrder ||
    a.capacity.workArea.name.localeCompare(b.capacity.workArea.name, "ja")
  );
}

function estimatePeopleLimitForRemainingRooms(
  items: { productId: string; productionType: string }[],
  productMap: Map<string, LoadedProduct>,
  internalWorkAreas: LoadedWorkArea[],
  staffCount: number,
) {
  const workAreaIds = new Set<string>();
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    for (const capacity of getSchedulableCapacities(product, internalWorkAreas, item.productionType)) {
      workAreaIds.add(capacity.workAreaId);
    }
  }
  const parallelRoomCount = Math.max(1, Math.min(items.length, workAreaIds.size || 1));
  return Math.max(1, Math.ceil(staffCount / parallelRoomCount));
}

function buildMaxQuantityScheduledPlans({
  items,
  productMap,
  internalWorkAreas,
  staffStates,
  areaCursor,
  scheduleStart,
  windowEnd,
  breakWindows,
  overrides,
}: {
  items: { productId: string; quantity: number; productionType: string }[];
  productMap: Map<string, LoadedProduct>;
  internalWorkAreas: LoadedWorkArea[];
  staffStates: StaffState[];
  areaCursor: Map<string, number>;
  scheduleStart: number;
  windowEnd: number;
  breakWindows: { startTime: string; endTime: string }[];
  overrides: AutoScheduleOverride[];
}): ScheduledPlan[] {
  const tempIds = items.map((_, index) => `preview-${index + 1}`);
  const forcedRoomByTempId = new Map<string, string>();
  for (const override of overrides) {
    if (override.workAreaId) forcedRoomByTempId.set(override.tempId, override.workAreaId);
  }

  const itemRefs = items.map((item, index) => {
    const product = productMap.get(item.productId)!;
    const tempId = tempIds[index];
    const forced = forcedRoomByTempId.get(tempId);
    const capacities = getSchedulableCapacities(
      product,
      internalWorkAreas,
      item.productionType,
      !forced,
    );
    if (capacities.length === 0) {
      throw new AutoScheduleError("capacity_not_found", {
        productId: product.id,
        productName: product.officialName,
        message: "外注以外の有効な作業場所別生産能力がありません。",
      });
    }
    // 部屋の強制指定が候補外なら従来同様エラー
    if (forced && !capacities.some((c) => c.workAreaId === forced)) {
      throw new AutoScheduleError("work_area_not_schedulable", {
        productName: product.officialName,
        workAreaId: forced,
      });
    }
    return { item, index, tempId, product, capacities };
  });

  const orderedRefs = [...itemRefs].sort((a, b) =>
    compareAutoScheduleItems(
      {
        productionType: a.item.productionType,
        productCode: a.product.productCode,
        schedulePriority: a.product.schedulePriority,
        originalIndex: a.index,
      },
      {
        productionType: b.item.productionType,
        productCode: b.product.productCode,
        schedulePriority: b.product.schedulePriority,
        originalIndex: b.index,
      },
    ),
  );

  const groupedRefs: (typeof orderedRefs)[] = [];
  for (const ref of orderedRefs) {
    const rank = productionTypeScheduleRank(ref.item.productionType);
    const last = groupedRefs[groupedRefs.length - 1];
    if (
      last &&
      productionTypeScheduleRank(last[0].item.productionType) === rank
    ) {
      last.push(ref);
    } else {
      groupedRefs.push([ref]);
    }
  }

  const staff: AllocationStaff[] = staffStates.map((s) => ({
    employeeId: s.employeeId,
    employeeName: s.name,
    startTime: formatHM(s.shiftStart),
    endTime: formatHM(s.shiftEnd),
    unavailableWindows: s.busyRanges.map((r) => ({ startTime: formatHM(r.start), endTime: formatHM(r.end) })),
  }));

  const plansByTempId = new Map<string, ScheduledPlan>();
  let phaseStart = scheduleStart;

  for (const refs of groupedRefs) {
    const capacitiesByTempId = new Map(refs.map((ref) => [ref.tempId, ref.capacities]));
    const chosen = assignBalancedRooms(
      refs.map((ref) => ({ tempId: ref.tempId })),
      capacitiesByTempId,
      forcedRoomByTempId,
    );

    if (phaseStart >= windowEnd) {
      for (const ref of refs) {
        const capacity = chosen.get(ref.tempId) ?? pickFallbackCapacity(ref.capacities, forcedRoomByTempId.get(ref.tempId));
        plansByTempId.set(ref.tempId, buildUnscheduledPlan(ref, capacity, phaseStart));
      }
      continue;
    }

    const jobs: AllocationJob[] = refs.map((ref) => {
      const capacity = chosen.get(ref.tempId)!;
      const cursor = areaCursor.get(capacity.workAreaId);
      const roomMaxPeople = Math.max(1, Math.floor(capacity.workArea.maxPeopleCount ?? capacity.standardPeople ?? 1));
      return {
        jobId: ref.tempId,
        productId: ref.product.id,
        productName: ref.product.officialName,
        workAreaId: capacity.workAreaId,
        workAreaName: capacity.workArea.name,
        workAreaDisplayOrder: capacity.workArea.displayOrder,
        quantity: ref.item.quantity,
        unit: ref.product.unit,
        unitsPerPersonHour: capacity.unitsPerPersonHour,
        roomMaxPeople,
        earliestStart: cursor != null && cursor > phaseStart ? formatHM(cursor) : undefined,
      } satisfies AllocationJob;
    });

    const allocation = allocateDayStaff({
      dayStart: formatHM(phaseStart),
      dayEnd: formatHM(Math.max(phaseStart, windowEnd)),
      breakWindows,
      staff,
      jobs,
    });
    const jobById = new Map(allocation.jobs.map((job) => [job.jobId, job]));
    const scheduledEnds: number[] = [];

    for (const ref of refs) {
      const capacity = chosen.get(ref.tempId)!;
      const job = jobById.get(ref.tempId);
      const plan = buildScheduledPlanFromJob({
        ref,
        capacity,
        job,
        fallbackStart: phaseStart,
      });
      plansByTempId.set(ref.tempId, plan);
      areaCursor.set(capacity.workAreaId, Math.max(areaCursor.get(capacity.workAreaId) ?? phaseStart, plan.end));
      if (plan.quantity > 0 && plan.end > phaseStart) scheduledEnds.push(plan.end);
    }

    if (scheduledEnds.length > 0) {
      phaseStart = Math.max(phaseStart, ...scheduledEnds);
    } else {
      phaseStart = windowEnd;
    }
  }

  return orderedRefs.map((ref) => plansByTempId.get(ref.tempId)!);
}

function buildScheduledPlanFromJob({
  ref,
  capacity,
  job,
  fallbackStart,
}: {
  ref: {
    item: { productId: string; quantity: number; productionType: string };
    tempId: string;
    product: LoadedProduct;
  };
  capacity: CandidateCapacity;
  job: ReturnType<typeof allocateDayStaff>["jobs"][number] | undefined;
  fallbackStart: number;
}): ScheduledPlan {
  const start = job?.startTime ? parseHM(job.startTime) : fallbackStart;
  const end = job?.endTime ? parseHM(job.endTime) : fallbackStart;
  const quantity = job?.scheduledQuantity ?? 0;
  const targetPeople = job ? job.peopleSegments.reduce((max, seg) => Math.max(max, seg.peopleCount), 0) : 0;

  // 表示用: 重複を除いた従業員一覧（初出順）
  const seen = new Set<string>();
  const assignedStaff: ScheduledAssignment[] = [];
  const assignmentSegments: NonNullable<ScheduledPlan["assignmentSegments"]> = [];
  for (const a of job?.assignments ?? []) {
    assignmentSegments.push({ employeeId: a.employeeId, startTime: a.startTime, endTime: a.endTime });
    if (!seen.has(a.employeeId)) {
      seen.add(a.employeeId);
      assignedStaff.push({ employeeId: a.employeeId, employeeName: a.employeeName, moveAfterPlanId: null });
    }
  }

  const warnings: string[] = [];
  if (capacity.synthetic) {
    warnings.push(`${capacity.workArea.name}は${capacity.sourceWorkAreaName ?? "登録済み作業場所"}の生産能力を仮適用`);
  }
  if (capacity.unitsPerPersonHour <= 0) warnings.push("生産能力未登録");
  const overflow = job?.overflowQuantity ?? ref.item.quantity;
  if (overflow > 0) warnings.push(`指定数量から ${round1(overflow)} 不足`);
  if (job && job.scheduledQuantity > 0 && assignedStaff.length === 0) {
    warnings.push("出勤シフト内で配置できるスタッフがいません");
  }

  return {
    tempId: ref.tempId,
    productId: ref.product.id,
    productName: ref.product.officialName,
    productionType: ref.item.productionType,
    unit: ref.product.unit,
    workAreaId: capacity.workAreaId,
    workAreaName: capacity.workArea.name,
    capacity,
    start,
    end,
    quantity,
    targetPeople,
    assignedStaff,
    assignmentSegments: assignmentSegments.length > 0 ? assignmentSegments : undefined,
    warnings,
  } satisfies ScheduledPlan;
}

function buildUnscheduledPlan(
  ref: {
    item: { productId: string; quantity: number; productionType: string };
    tempId: string;
    product: LoadedProduct;
  },
  capacity: CandidateCapacity,
  phaseStart: number,
): ScheduledPlan {
  return {
    tempId: ref.tempId,
    productId: ref.product.id,
    productName: ref.product.officialName,
    productionType: ref.item.productionType,
    unit: ref.product.unit,
    workAreaId: capacity.workAreaId,
    workAreaName: capacity.workArea.name,
    capacity,
    start: phaseStart,
    end: phaseStart,
    quantity: 0,
    targetPeople: 0,
    assignedStaff: [],
    warnings: [`指定数量から ${round1(ref.item.quantity)} 不足`, "優先度の高い生産で時間枠を使い切りました"],
  };
}

function pickFallbackCapacity(capacities: CandidateCapacity[], forcedRoomId?: string): CandidateCapacity {
  return capacities.find((capacity) => capacity.workAreaId === forcedRoomId) ?? capacities[0];
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function applyOverrides({
  scheduledPlans,
  overrides,
  productMap,
  internalWorkAreas,
  staffStates,
  existingBusyByEmployee,
}: {
  scheduledPlans: ScheduledPlan[];
  overrides: AutoScheduleOverride[];
  productMap: Map<string, LoadedProduct>;
  internalWorkAreas: LoadedWorkArea[];
  staffStates: StaffState[];
  existingBusyByEmployee: Map<string, { start: number; end: number }[]>;
}) {
  if (overrides.length === 0) return;
  const overrideByTempId = new Map(overrides.map((override) => [override.tempId, override]));
  const staffById = new Map(staffStates.map((staff) => [staff.employeeId, staff]));

  for (const plan of scheduledPlans) {
    const override = overrideByTempId.get(plan.tempId);
    if (!override) continue;

    if (override.workAreaId && override.workAreaId !== plan.workAreaId) {
      const product = productMap.get(plan.productId);
      const capacity = product
        ? getSchedulableCapacities(product, internalWorkAreas, plan.productionType, false).find(
            (candidate) => candidate.workAreaId === override.workAreaId,
          )
        : null;
      if (!capacity) {
        throw new AutoScheduleError("work_area_not_schedulable", {
          productName: plan.productName,
          workAreaId: override.workAreaId,
        });
      }
      plan.capacity = capacity;
      plan.workAreaId = capacity.workAreaId;
      plan.workAreaName = capacity.workArea.name;
    }

    if (override.employeeIds) {
      const uniqueEmployeeIds = [...new Set(override.employeeIds.filter(Boolean))];
      if (uniqueEmployeeIds.length !== override.employeeIds.filter(Boolean).length) {
        throw new AutoScheduleError("duplicate_preview_staff", { tempId: plan.tempId });
      }
      const assignedStaff = uniqueEmployeeIds.map((employeeId) => {
        const staff = staffById.get(employeeId);
        if (!staff) {
          throw new AutoScheduleError("staff_not_found_or_not_scheduled", { employeeId });
        }
        if (staff.shiftStart > plan.start || staff.shiftEnd < plan.end) {
          throw new AutoScheduleError("employee_assignment_outside_shift", {
            employee: staff.name,
            shift: { startTime: formatHM(staff.shiftStart), endTime: formatHM(staff.shiftEnd) },
          });
        }
        const existingBusy = existingBusyByEmployee.get(employeeId) ?? [];
        if (existingBusy.some((range) => plan.start < range.end && range.start < plan.end)) {
          throw new AutoScheduleError("employee_assignment_overlap", { employee: staff.name });
        }
        return {
          employeeId: staff.employeeId,
          employeeName: staff.name,
          moveAfterPlanId: null,
        };
      });
      if (assignedStaff.length > 0) {
        plan.assignedStaff = assignedStaff;
        plan.targetPeople = assignedStaff.length;
      }
    }
  }

  const rangesByEmployee = new Map<string, { start: number; end: number; tempId: string }[]>();
  for (const plan of scheduledPlans) {
    for (const staff of plan.assignedStaff) {
      const ranges = rangesByEmployee.get(staff.employeeId) ?? [];
      if (ranges.some((range) => plan.start < range.end && range.start < plan.end)) {
        throw new AutoScheduleError("employee_assignment_overlap", { employee: staff.employeeName });
      }
      ranges.push({ start: plan.start, end: plan.end, tempId: plan.tempId });
      rangesByEmployee.set(staff.employeeId, ranges);
    }
  }
}

function buildSlot({
  mode,
  quantity,
  capacity,
  staffStates,
  baseStart,
  desiredEnd,
  baselineEndTime,
  peopleLimit,
}: {
  mode: string;
  quantity: number;
  capacity: CandidateCapacity;
  staffStates: StaffState[];
  baseStart: number;
  desiredEnd: number;
  baselineEndTime: string;
  peopleLimit: number;
}) {
  const warnings: string[] = [];
  if (capacity.synthetic) {
    warnings.push(`${capacity.workArea.name}は${capacity.sourceWorkAreaName ?? "登録済み作業場所"}の生産能力を仮適用`);
  }
  const roomMaxPeople = Math.max(1, Math.floor(capacity.workArea.maxPeopleCount ?? capacity.standardPeople ?? 1));
  const effectiveMaxPeople = Math.max(1, Math.min(roomMaxPeople, Math.floor(peopleLimit)));
  const standardPeople = computeAssignablePeople({
    roomMaxPeople: effectiveMaxPeople,
    standardPeople: capacity.standardPeople,
    availablePeople: staffStates.length,
  });

  if (mode === "max_quantity") {
    const start = baseStart;
    const windowEnd = Math.max(start, desiredEnd);
    const candidates = pickStaff(staffStates, start, windowEnd, standardPeople);
    if (candidates.length === 0) warnings.push("出勤シフト内で配置できるスタッフがいません");
    const people = Math.max(1, candidates.length || standardPeople);
    const result = computeQuantityWithinTimeWindow({
      quantity,
      unitsPerPersonHour: capacity.unitsPerPersonHour,
      peopleCount: people,
      startTime: formatHM(start),
      endTime: formatHM(windowEnd),
      baselineEndTime,
    });
    if (result.overflowQuantity > 0) warnings.push(`指定数量から ${result.overflowQuantity} 不足`);
    const end = parseHM(result.endTime);
    const stableCandidates = pickStaff(staffStates, start, end, people);
    if (stableCandidates.length < people && result.plannedQuantity > 0) {
      warnings.push(`配置予定 ${people}人に対して実配置 ${stableCandidates.length}人`);
    }
    return {
      start,
      end,
      quantity: result.plannedQuantity,
      targetPeople: people,
      assignedStaff: stableCandidates.length > 0 ? stableCandidates : candidates,
      warnings: [...warnings, ...result.warnings.map(warningLabel)],
    };
  }

  if (mode === "required_people") {
    const start = baseStart;
    const end = Math.max(start, desiredEnd);
    const result = computeRequiredPeople({
      quantity,
      unitsPerPersonHour: capacity.unitsPerPersonHour,
      startTime: formatHM(start),
      endTime: formatHM(end),
      availablePeople: Math.min(staffStates.length, effectiveMaxPeople),
    });
    const targetPeople = Math.min(effectiveMaxPeople, Math.max(1, result.requiredPeople));
    if (result.requiredPeople > roomMaxPeople) {
      warnings.push(`必要人数 ${result.requiredPeople}人に対して部屋上限 ${roomMaxPeople}人`);
    } else if (result.requiredPeople > effectiveMaxPeople) {
      warnings.push(`必要人数 ${result.requiredPeople}人に対して並列配置上限 ${effectiveMaxPeople}人`);
    }
    const candidates = pickStaff(staffStates, start, end, targetPeople);
    if (candidates.length < targetPeople) {
      warnings.push(`必要人数 ${targetPeople}人に対して配置可能 ${candidates.length}人`);
    }
    return {
      start,
      end,
      quantity,
      targetPeople,
      assignedStaff: candidates,
      warnings,
    };
  }

  const durationSlot = findDurationSlot({
    quantity,
    capacity,
    staffStates,
    baseStart,
    baselineEndTime,
    standardPeople,
  });
  return { ...durationSlot, warnings: [...durationSlot.warnings, ...warnings] };
}

function findDurationSlot({
  quantity,
  capacity,
  staffStates,
  baseStart,
  baselineEndTime,
  standardPeople,
}: {
  quantity: number;
  capacity: CandidateCapacity;
  staffStates: StaffState[];
  baseStart: number;
  baselineEndTime: string;
  standardPeople: number;
}) {
  const baselineEnd = parseHM(baselineEndTime);
  const startCandidates = [
    baseStart,
    ...staffStates.flatMap((staff) => [staff.freeAt, staff.shiftStart]).filter((time) => time >= baseStart),
    ...staffStates
      .flatMap((staff) => staff.busyRanges.map((range) => range.end))
      .filter((time) => time >= baseStart),
  ]
    .map((time) => nextWorkingMinute(time))
    .filter((time, index, arr) => arr.indexOf(time) === index)
    .sort((a, b) => a - b);

  for (const start of startCandidates) {
    const availableAtStart = staffStates.filter(
      (staff) =>
        staff.freeAt <= start &&
        staff.shiftStart <= start &&
        staff.shiftEnd > start &&
        !hasBusyOverlap(staff, start, start + 1),
    );
    const targetPeople = Math.max(1, Math.min(standardPeople, availableAtStart.length || standardPeople));
    const duration = computeProductionDuration({
      quantity,
      unitsPerPersonHour: capacity.unitsPerPersonHour,
      peopleCount: targetPeople,
      startTime: formatHM(start),
      baselineEndTime,
    });
    const end = parseHM(duration.endTime);
    const candidates = pickStaff(staffStates, start, end, targetPeople);
    if (candidates.length >= targetPeople) {
      return {
        start,
        end,
        quantity,
        targetPeople,
        assignedStaff: candidates,
        warnings: duration.warnings.map(warningLabel),
      };
    }
    if (candidates.length > 0) {
      const recalculated = computeProductionDuration({
        quantity,
        unitsPerPersonHour: capacity.unitsPerPersonHour,
        peopleCount: candidates.length,
        startTime: formatHM(start),
        baselineEndTime,
      });
      const recalculatedEnd = parseHM(recalculated.endTime);
      const stableCandidates = pickStaff(staffStates, start, recalculatedEnd, candidates.length);
      if (stableCandidates.length === candidates.length) {
        return {
          start,
          end: recalculatedEnd,
          quantity,
          targetPeople: candidates.length,
          assignedStaff: stableCandidates,
          warnings: ["標準人数より少ない人数で配置", ...recalculated.warnings.map(warningLabel)],
        };
      }
    }
    const capped = buildCappedDurationSlot({
      quantity,
      capacity,
      staffStates,
      start,
      targetPeople,
      windowEnd: baselineEnd,
    });
    if (capped) return capped;
  }

  const fallbackStart = baseStart;
  const capped = buildCappedDurationSlot({
    quantity,
    capacity,
    staffStates,
    start: fallbackStart,
    targetPeople: standardPeople,
    windowEnd: parseHM(baselineEndTime),
  });
  if (capped) return capped;

  const fallback = computeProductionDuration({
    quantity,
    unitsPerPersonHour: capacity.unitsPerPersonHour,
    peopleCount: standardPeople,
    startTime: formatHM(fallbackStart),
    baselineEndTime,
  });
  return {
    start: fallbackStart,
    end: parseHM(fallback.endTime),
    quantity,
    targetPeople: standardPeople,
    assignedStaff: [] as StaffState[],
    warnings: ["出勤シフト内で配置できるスタッフがいません", ...fallback.warnings.map(warningLabel)],
  };
}

function buildCappedDurationSlot({
  quantity,
  capacity,
  staffStates,
  start,
  targetPeople,
  windowEnd,
}: {
  quantity: number;
  capacity: CandidateCapacity;
  staffStates: StaffState[];
  start: number;
  targetPeople: number;
  windowEnd: number;
}) {
  if (windowEnd <= start) return null;
  const candidates = pickStaff(staffStates, start, windowEnd, targetPeople);
  if (candidates.length === 0) return null;
  const max = computeMaxQuantityInTimeWindow({
    unitsPerPersonHour: capacity.unitsPerPersonHour,
    peopleCount: candidates.length,
    startTime: formatHM(start),
    endTime: formatHM(windowEnd),
    requestedQuantity: quantity,
  });
  const cappedQuantity = ceilDisplayQuantity(max.maxQuantity) ?? 0;
  if (cappedQuantity <= 0) return null;
  const overflow = ceilDisplayQuantity(Math.max(0, quantity - cappedQuantity)) ?? 0;
  return {
    start,
    end: windowEnd,
    quantity: Math.min(quantity, cappedQuantity),
    targetPeople: candidates.length,
    assignedStaff: candidates,
    warnings:
      overflow > 0
        ? [`指定数量から ${overflow} 不足`, "翌日繰越候補"]
        : ["シフト時間内に収まる数量へ調整"],
  };
}

function pickStaff(staffStates: StaffState[], start: number, end: number, count: number) {
  return staffStates
    .filter(
      (staff) =>
        staff.freeAt <= start &&
        staff.shiftStart <= start &&
        staff.shiftEnd >= end &&
        !hasBusyOverlap(staff, start, end),
    )
    .sort((a, b) => a.freeAt - b.freeAt || a.name.localeCompare(b.name, "ja"))
    .slice(0, count);
}

function countAvailableStaffAt(staffStates: StaffState[], time: number) {
  return staffStates.filter(
    (staff) =>
      staff.freeAt <= time &&
      staff.shiftStart <= time &&
      staff.shiftEnd > time &&
      !hasBusyOverlap(staff, time, time + 1),
  ).length;
}

function hasBusyOverlap(staff: StaffState, start: number, end: number) {
  return staff.busyRanges.some((range) => start < range.end && range.start < end);
}

function buildGeneratedCapacityNote(capacity: CandidateCapacity) {
  return `自動作成で${capacity.sourceWorkAreaName ?? "登録済み作業場所"}の生産能力を仮適用`;
}

function buildNote(mode: string, index: number, warnings: string[]) {
  const base = `自動作成 ${index}: ${modeLabels[mode] ?? mode}`;
  return warnings.length > 0 ? `${base} / 注意: ${warnings.join(", ")}` : base;
}

function warningLabel(warning: string) {
  switch (warning) {
    case "exceeds_baseline_end":
      return "基準終了を超過";
    case "exceeds_desired_end":
      return "終了希望を超過";
    case "non_positive_capacity":
      return "生産能力未登録";
    case "non_positive_people":
      return "人数未設定";
    default:
      return warning;
  }
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

class AutoScheduleError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}
