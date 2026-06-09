// 月間生産予定のシフト連動シミュレーション（遊休ゼロ志向）。
//
// 当日割り当て (`allocateDayStaff`) と同じ「出勤者全員を作業場所へ詰める」ロジックを
// 日単位で回す。標準人数しか割り当てず余剰出勤者が宙ぶらりんになる従来方式を、
// 部屋の同時人数上限まで詰める方式へ寄せている。
//
// 流れ:
//   1) 需要アイテムを商品マスター・社内部屋の生産能力で絞り込む。
//   2) 日付を時系列に走査し、その日に作れるアイテム（希望日以降）を集めて
//      `allocateDayStaff` を1回呼び、出勤者全員を部屋へ割り当てる。
//      作れた数量を需要から差し引き、あふれは翌日以降へ繰り越す。
//   3) 希望日までに収まらなかったアイテムは、希望日より前の日へフォールバック配置する。
//   4) それでも残った数量は未配置 (skipped) として返す。
//
// すべて純関数。DB/HTTP はここに持ち込まない。

import { DAILY_BREAK_WINDOWS, computeBreakMinutesInTimeWindow, type BreakWindow } from "./calculations";
import { allocateDayStaff, type AllocationJob, type AllocationStaff } from "./staff-allocation";
import { formatHM, parseHM } from "./time";

export type ShiftSimulationItem = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order" | "both";
  unit: string;
  preferredDate: string;
  dueDates: string[];
  quantity: number;
  /** 商品マスタの生産順(小さいほど先)。null/未指定は最後尾。 */
  schedulePriority?: number | null;
  reasons: string[];
};

export type ShiftSimulationCapacity = {
  productId: string;
  workAreaId: string;
  workAreaName: string;
  workAreaDefaultStartTime?: string | null;
  workAreaDefaultEndTime?: string | null;
  workAreaMaxPeopleCount: number;
  workAreaDisplayOrder: number;
  unitsPerPersonHour: number;
  standardPeople: number;
  standardBreakMinutes: number;
};

export type ShiftSimulationProduct = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order" | "both";
  unit: string;
  defaultWorkAreaId?: string | null;
  capacities: ShiftSimulationCapacity[];
};

export type ShiftSimulationShift = {
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type ShiftSimulationExistingPlan = {
  date: string;
  workAreaId: string;
  startTime: string;
  endTime: string;
};

export type ShiftSimulationExistingAssignment = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type SimulatedProductionPlan = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: "stock" | "make_to_order";
  unit: string;
  date: string;
  workAreaId: string;
  workAreaName: string;
  quantity: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  peopleCount: number;
  assignedEmployees: { employeeId: string; employeeName: string }[];
  dueDates: string[];
  reasons: string[];
  warnings: string[];
};

export type ShiftSimulationSkippedItem = {
  productId: string;
  productCode: string;
  productName: string;
  preferredDate: string;
  remainingQuantity: number;
  unit: string;
  reason: string;
};

export type ShiftSimulationResult = {
  plans: SimulatedProductionPlan[];
  skipped: ShiftSimulationSkippedItem[];
};

type ItemState = {
  item: ShiftSimulationItem;
  productionType: "stock" | "make_to_order";
  capacities: ShiftSimulationCapacity[];
  preferredDate: string;
  dueDate: string;
  remaining: number;
};

export function simulateMonthlyShiftSchedule(input: {
  dateFrom: string;
  dateTo: string;
  defaultStartTime: string;
  baselineEndTime: string;
  items: ShiftSimulationItem[];
  products: ShiftSimulationProduct[];
  shifts: ShiftSimulationShift[];
  existingPlans: ShiftSimulationExistingPlan[];
  existingAssignments: ShiftSimulationExistingAssignment[];
  /** 休憩時間帯。未指定なら標準の日次休憩 (12:00-13:00 / 15:00-15:15)。 */
  breakWindows?: BreakWindow[];
}): ShiftSimulationResult {
  const days = eachDay(input.dateFrom, input.dateTo);
  const breakWindows = input.breakWindows ?? DAILY_BREAK_WINDOWS;
  const productMap = new Map(input.products.map((product) => [product.productId, product]));

  const plans: SimulatedProductionPlan[] = [];
  const skipped: ShiftSimulationSkippedItem[] = [];
  const states: ItemState[] = [];

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      skipped.push(skip(item, item.quantity, "商品マスターが見つかりません。"));
      continue;
    }
    const capacities = chooseSchedulableCapacities(product);
    if (capacities.length === 0) {
      skipped.push(skip(item, item.quantity, "社内部屋で使える生産能力が未登録です。"));
      continue;
    }
    states.push({
      item,
      productionType: item.productionType === "make_to_order" ? "make_to_order" : "stock",
      capacities,
      preferredDate: item.preferredDate,
      dueDate: minDate(item.dueDates),
      remaining: item.quantity,
    });
  }

  // 当日に出勤するスタッフ
  const shiftsByDate = new Map<string, ShiftSimulationShift[]>();
  for (const shift of input.shifts) {
    if (parseHM(shift.endTime) <= parseHM(shift.startTime)) continue;
    const arr = shiftsByDate.get(shift.date) ?? [];
    arr.push(shift);
    shiftsByDate.set(shift.date, arr);
  }

  // 既存予定による部屋占有（部屋が空く時刻）と、既存割当によるスタッフ不在時間帯。
  // 自分が作った仮予定の消費分も同じ Map に積み増し、同一日の後続パスで二重割当を防ぐ。
  const roomFreeAt = new Map<string, number>(); // `${date}__${workAreaId}` -> minute
  for (const plan of input.existingPlans) {
    const key = roomKey(plan.date, plan.workAreaId);
    roomFreeAt.set(key, Math.max(roomFreeAt.get(key) ?? 0, parseHM(plan.endTime)));
  }
  const staffBusy = new Map<string, { start: number; end: number }[]>(); // `${date}__${employeeId}`
  for (const assignment of input.existingAssignments) {
    const key = staffKey(assignment.date, assignment.employeeId);
    const arr = staffBusy.get(key) ?? [];
    arr.push({ start: parseHM(assignment.startTime), end: parseHM(assignment.endTime) });
    staffBusy.set(key, arr);
  }

  const stateById = new Map(states.map((s) => [s.item.productId, s]));

  const runDay = (date: string, eligible: ItemState[]) => {
    const dayShifts = shiftsByDate.get(date) ?? [];
    if (dayShifts.length === 0 || eligible.length === 0) return;

    const jobs: AllocationJob[] = eligible.map((state) => {
      const capacity = state.capacities[0];
      const freeAt = roomFreeAt.get(roomKey(date, capacity.workAreaId));
      return {
        jobId: state.item.productId,
        productId: state.item.productId,
        productName: state.item.productName,
        workAreaId: capacity.workAreaId,
        workAreaName: capacity.workAreaName,
        workAreaDisplayOrder: capacity.workAreaDisplayOrder,
        quantity: state.remaining,
        unit: state.item.unit,
        unitsPerPersonHour: capacity.unitsPerPersonHour,
        roomMaxPeople: Math.max(
          1,
          Math.floor(capacity.workAreaMaxPeopleCount || capacity.standardPeople || 1),
        ),
        earliestStart: freeAt != null ? formatHM(freeAt) : undefined,
      } satisfies AllocationJob;
    });

    const staff: AllocationStaff[] = dayShifts.map((shift) => ({
      employeeId: shift.employeeId,
      employeeName: shift.employeeName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      unavailableWindows: (staffBusy.get(staffKey(date, shift.employeeId)) ?? []).map((w) => ({
        startTime: formatHM(w.start),
        endTime: formatHM(w.end),
      })),
    }));

    const allocation = allocateDayStaff({
      dayStart: input.defaultStartTime,
      dayEnd: input.baselineEndTime,
      breakWindows,
      staff,
      jobs,
    });

    for (const job of allocation.jobs) {
      if (job.scheduledQuantity <= 0 || !job.startTime || !job.endTime) continue;
      const state = stateById.get(job.jobId);
      if (!state) continue;

      const quantity = round4(Math.min(state.remaining, job.scheduledQuantity));
      if (quantity <= 0) continue;
      const peopleCount = job.peopleSegments.reduce((max, seg) => Math.max(max, seg.peopleCount), 0);
      const assignedEmployees = dedupeAssignments(job.assignments);

      plans.push({
        productId: state.item.productId,
        productCode: state.item.productCode,
        productName: state.item.productName,
        productionType: state.productionType,
        unit: state.item.unit,
        date,
        workAreaId: job.workAreaId,
        workAreaName: job.workAreaName,
        quantity,
        startTime: job.startTime,
        endTime: job.endTime,
        breakMinutes: computeBreakMinutesInTimeWindow({
          startTime: job.startTime,
          endTime: job.endTime,
          breakWindows,
        }),
        peopleCount,
        assignedEmployees,
        dueDates: state.item.dueDates,
        reasons: state.item.reasons,
        warnings: job.warnings,
      });

      state.remaining = round4(state.remaining - quantity);

      // 後続パス（同一日の希望日前フォールバック）のために消費分を反映
      const rk = roomKey(date, job.workAreaId);
      roomFreeAt.set(rk, Math.max(roomFreeAt.get(rk) ?? 0, parseHM(job.endTime)));
      for (const a of job.assignments) {
        const sk = staffKey(date, a.employeeId);
        const arr = staffBusy.get(sk) ?? [];
        arr.push({ start: parseHM(a.startTime), end: parseHM(a.endTime) });
        staffBusy.set(sk, arr);
      }
    }
  };

  // パス1: 時系列。各日に「希望日以降」のアイテムを納期優先で詰める（納期超過日も含む）。
  for (const date of days) {
    const eligible = states
      .filter((s) => s.remaining > EPS && date >= s.preferredDate)
      .sort(byPriority);
    runDay(date, eligible);
  }

  // パス2: 希望日までに収まらなかったアイテムを、希望日より前の日へ（希望日に近い日から）。
  for (const date of [...days].reverse()) {
    const eligible = states
      .filter((s) => s.remaining > EPS && date < s.preferredDate)
      .sort(byPriority);
    runDay(date, eligible);
  }

  for (const state of states) {
    if (state.remaining > EPS) {
      skipped.push(
        skip(
          state.item,
          round4(state.remaining),
          "対象期間のシフト・部屋・生産能力では配置しきれませんでした。",
        ),
      );
    }
  }

  return { plans, skipped };
}

function byPriority(a: ItemState, b: ItemState) {
  // 商品マスタの生産順(schedulePriority)を最優先。未設定(null)は最後尾扱いで従来順にフォールバック。
  const pa = a.item.schedulePriority ?? Number.MAX_SAFE_INTEGER;
  const pb = b.item.schedulePriority ?? Number.MAX_SAFE_INTEGER;
  return (
    pa - pb ||
    a.dueDate.localeCompare(b.dueDate) ||
    a.preferredDate.localeCompare(b.preferredDate) ||
    a.item.productCode.localeCompare(b.item.productCode, "ja")
  );
}

function dedupeAssignments(
  assignments: { employeeId: string; employeeName: string }[],
): { employeeId: string; employeeName: string }[] {
  const seen = new Map<string, string>();
  for (const a of assignments) {
    if (!seen.has(a.employeeId)) seen.set(a.employeeId, a.employeeName);
  }
  return [...seen].map(([employeeId, employeeName]) => ({ employeeId, employeeName }));
}

function chooseSchedulableCapacities(product: ShiftSimulationProduct) {
  return [...product.capacities].sort((a, b) => {
    const defaultScore =
      Number(b.workAreaId === product.defaultWorkAreaId) - Number(a.workAreaId === product.defaultWorkAreaId);
    return (
      defaultScore ||
      b.unitsPerPersonHour - a.unitsPerPersonHour ||
      a.workAreaDisplayOrder - b.workAreaDisplayOrder ||
      a.workAreaName.localeCompare(b.workAreaName, "ja")
    );
  });
}

function skip(
  item: ShiftSimulationItem,
  remainingQuantity: number,
  reason: string,
): ShiftSimulationSkippedItem {
  return {
    productId: item.productId,
    productCode: item.productCode,
    productName: item.productName,
    preferredDate: item.preferredDate,
    remainingQuantity,
    unit: item.unit,
    reason,
  };
}

function roomKey(date: string, workAreaId: string) {
  return `${date}__${workAreaId}`;
}

function staffKey(date: string, employeeId: string) {
  return `${date}__${employeeId}`;
}

function eachDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(dates: string[]) {
  return [...dates].sort()[0] ?? "9999-12-31";
}

const EPS = 1e-6;

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
