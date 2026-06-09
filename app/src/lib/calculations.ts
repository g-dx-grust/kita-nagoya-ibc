// Phase 1 calculation library. Pure functions only — keep DB and HTTP out.
// Acceptance tests live in calculations.test.ts.

import { diffMinutes, formatHM, parseHM } from "./time";

export type Warning =
  | "exceeds_baseline_end"
  | "exceeds_desired_end"
  | "non_positive_capacity"
  | "non_positive_people";

export interface DurationInput {
  quantity: number;
  unitsPerPersonHour: number;
  peopleCount: number;
  startTime: string; // HH:MM
  /** Deprecated: production breaks are fixed daily time windows, not per item. */
  breakMinutes?: number;
  breakWindows?: BreakWindow[];
  baselineEndTime?: string; // default 17:00
}

export interface DurationResult {
  requiredMinutes: number;
  workingMinutes: number; // excluding break
  blockedMinutes: number;
  endTime: string;
  overtimeMinutes: number;
  warnings: Warning[];
}

export type BreakWindow = {
  startTime: string;
  endTime: string;
};

const MINUTES_PER_DAY = 24 * 60;

export const DAILY_BREAK_WINDOWS: BreakWindow[] = [
  { startTime: "12:00", endTime: "13:00" },
  { startTime: "15:00", endTime: "15:15" },
];

export const DAILY_BREAK_LABEL = "12:00-13:00 / 15:00-15:15";
export const DEFAULT_HOURLY_LABOR_RATE = 1500;

export function computeUnitsPerPersonHourFromLaborUnitPrice(input: {
  laborUnitPrice: number;
  hourlyLaborRate?: number;
}): number {
  const hourlyLaborRate = input.hourlyLaborRate ?? DEFAULT_HOURLY_LABOR_RATE;
  if (input.laborUnitPrice <= 0 || hourlyLaborRate <= 0) return 0;
  return round4(hourlyLaborRate / input.laborUnitPrice);
}

export function computeProductionDuration(input: DurationInput): DurationResult {
  const baseline = input.baselineEndTime ?? "17:00";
  const warnings: Warning[] = [];

  if (input.unitsPerPersonHour <= 0) warnings.push("non_positive_capacity");
  if (input.peopleCount <= 0) warnings.push("non_positive_people");

  if (warnings.length > 0) {
    return {
      requiredMinutes: 0,
      workingMinutes: 0,
      blockedMinutes: 0,
      endTime: input.startTime,
      overtimeMinutes: 0,
      warnings,
    };
  }

  const hoursNeeded = input.quantity / (input.unitsPerPersonHour * input.peopleCount);
  const workingMinutes = Math.ceil(hoursNeeded * 60);
  const endTime = addWorkingMinutesSkippingBreaks(
    input.startTime,
    workingMinutes,
    input.breakWindows,
  );
  const requiredMinutes = diffMinutes(input.startTime, endTime);
  const blockedMinutes = Math.max(0, requiredMinutes - workingMinutes);

  const overtimeMinutes = Math.max(0, parseHM(endTime) - parseHM(baseline));
  if (overtimeMinutes > 0) warnings.push("exceeds_baseline_end");

  return { requiredMinutes, workingMinutes, blockedMinutes, endTime, overtimeMinutes, warnings };
}

export interface MaxQuantityInput {
  unitsPerPersonHour: number;
  peopleCount: number;
  startTime: string;
  endTime: string; // desired/window end
  /** Deprecated: production breaks are fixed daily time windows, not per item. */
  breakMinutes?: number;
  breakWindows?: BreakWindow[];
  requestedQuantity?: number;
}

export interface MaxQuantityResult {
  workingHours: number;
  blockedMinutes: number;
  maxQuantity: number;
  overflowQuantity: number;
  warnings: Warning[];
}

export function computeMaxQuantityInTimeWindow(input: MaxQuantityInput): MaxQuantityResult {
  const warnings: Warning[] = [];
  if (input.unitsPerPersonHour <= 0) warnings.push("non_positive_capacity");
  if (input.peopleCount <= 0) warnings.push("non_positive_people");

  const totalWindowMinutes = Math.max(0, diffMinutes(input.startTime, input.endTime));
  const blockedMinutes = computeBreakMinutesInTimeWindow({
    startTime: input.startTime,
    endTime: input.endTime,
    breakWindows: input.breakWindows,
  });
  const windowMinutes = Math.max(0, totalWindowMinutes - blockedMinutes);
  const workingHours = windowMinutes / 60;
  const maxQuantity =
    warnings.length > 0 ? 0 : input.unitsPerPersonHour * input.peopleCount * workingHours;
  const overflowQuantity =
    input.requestedQuantity == null ? 0 : Math.max(0, input.requestedQuantity - maxQuantity);

  return { workingHours, blockedMinutes, maxQuantity, overflowQuantity, warnings };
}

export interface QuantityWithinTimeWindowInput {
  quantity: number;
  unitsPerPersonHour: number;
  peopleCount: number;
  startTime: string;
  endTime: string;
  breakWindows?: BreakWindow[];
  baselineEndTime?: string;
}

export interface QuantityWithinTimeWindowResult {
  plannedQuantity: number;
  maxQuantity: number;
  overflowQuantity: number;
  workingMinutes: number;
  requiredMinutes: number;
  blockedMinutes: number;
  endTime: string;
  usedFullWindow: boolean;
  warnings: Warning[];
}

export function computeQuantityWithinTimeWindow(
  input: QuantityWithinTimeWindowInput,
): QuantityWithinTimeWindowResult {
  const max = computeMaxQuantityInTimeWindow({
    unitsPerPersonHour: input.unitsPerPersonHour,
    peopleCount: input.peopleCount,
    startTime: input.startTime,
    endTime: input.endTime,
    breakWindows: input.breakWindows,
    requestedQuantity: input.quantity,
  });
  const flooredMaxQuantity = Math.max(0, Math.floor(max.maxQuantity));

  if (max.warnings.length > 0 || flooredMaxQuantity <= 0) {
    return {
      plannedQuantity: 0,
      maxQuantity: flooredMaxQuantity,
      overflowQuantity: input.quantity,
      workingMinutes: 0,
      requiredMinutes: 0,
      blockedMinutes: max.blockedMinutes,
      endTime: input.startTime,
      usedFullWindow: false,
      warnings: max.warnings,
    };
  }

  if (input.quantity <= max.maxQuantity) {
    const duration = computeProductionDuration({
      quantity: input.quantity,
      unitsPerPersonHour: input.unitsPerPersonHour,
      peopleCount: input.peopleCount,
      startTime: input.startTime,
      breakWindows: input.breakWindows,
      baselineEndTime: input.baselineEndTime ?? input.endTime,
    });
    return {
      plannedQuantity: input.quantity,
      maxQuantity: flooredMaxQuantity,
      overflowQuantity: 0,
      workingMinutes: duration.workingMinutes,
      requiredMinutes: duration.requiredMinutes,
      blockedMinutes: duration.blockedMinutes,
      endTime: duration.endTime,
      usedFullWindow: false,
      warnings: duration.warnings,
    };
  }

  return {
    plannedQuantity: flooredMaxQuantity,
    maxQuantity: flooredMaxQuantity,
    overflowQuantity: input.quantity - flooredMaxQuantity,
    workingMinutes: Math.round(max.workingHours * 60),
    requiredMinutes: diffMinutes(input.startTime, input.endTime),
    blockedMinutes: max.blockedMinutes,
    endTime: input.endTime,
    usedFullWindow: true,
    warnings: max.warnings,
  };
}

export interface RequiredPeopleInput {
  quantity: number;
  unitsPerPersonHour: number;
  startTime: string;
  endTime: string;
  /** Deprecated: production breaks are fixed daily time windows, not per item. */
  breakMinutes?: number;
  breakWindows?: BreakWindow[];
  availablePeople?: number;
}

export interface RequiredPeopleResult {
  workingHours: number;
  blockedMinutes: number;
  requiredPeople: number;
  shortagePeople: number; // vs availablePeople
  /** End-time per candidate people-count [1..max] */
  candidates: { people: number; endTime: string; overtimeMinutes: number }[];
  warnings: Warning[];
}

export function computeRequiredPeople(input: RequiredPeopleInput): RequiredPeopleResult {
  const warnings: Warning[] = [];
  if (input.unitsPerPersonHour <= 0) warnings.push("non_positive_capacity");

  const totalWindowMinutes = Math.max(0, diffMinutes(input.startTime, input.endTime));
  const blockedMinutes = computeBreakMinutesInTimeWindow({
    startTime: input.startTime,
    endTime: input.endTime,
    breakWindows: input.breakWindows,
  });
  const windowMinutes = Math.max(0, totalWindowMinutes - blockedMinutes);
  const workingHours = windowMinutes / 60;

  let requiredPeople = 0;
  if (warnings.length === 0 && workingHours > 0) {
    requiredPeople = Math.ceil(input.quantity / (input.unitsPerPersonHour * workingHours));
  }

  const maxCandidate = Math.max(requiredPeople + 2, input.availablePeople ?? 0, 1);
  const candidates: RequiredPeopleResult["candidates"] = [];
  for (let p = 1; p <= maxCandidate; p++) {
    const d = computeProductionDuration({
      quantity: input.quantity,
      unitsPerPersonHour: input.unitsPerPersonHour,
      peopleCount: p,
      startTime: input.startTime,
      breakWindows: input.breakWindows,
      baselineEndTime: input.endTime,
    });
    candidates.push({ people: p, endTime: d.endTime, overtimeMinutes: d.overtimeMinutes });
  }

  const shortagePeople =
    input.availablePeople == null ? 0 : Math.max(0, requiredPeople - input.availablePeople);

  return { workingHours, blockedMinutes, requiredPeople, shortagePeople, candidates, warnings };
}

export function computeBreakMinutesInTimeWindow(input: {
  startTime: string;
  endTime: string;
  breakWindows?: BreakWindow[];
}): number {
  const start = parseHM(input.startTime);
  const end = parseHM(input.endTime);
  if (end <= start) return 0;
  return breakRangesForInterval(start, end, input.breakWindows).reduce(
    (total, range) => total + Math.max(0, Math.min(end, range.end) - Math.max(start, range.start)),
    0,
  );
}

export function computeWorkingMinutesInTimeWindow(input: {
  startTime: string;
  endTime: string;
  breakWindows?: BreakWindow[];
}): number {
  const totalWindowMinutes = Math.max(0, diffMinutes(input.startTime, input.endTime));
  return Math.max(0, totalWindowMinutes - computeBreakMinutesInTimeWindow(input));
}

export function addWorkingMinutesSkippingBreaks(
  startTime: string,
  workingMinutes: number,
  breakWindows: BreakWindow[] = DAILY_BREAK_WINDOWS,
): string {
  let cursor = parseHM(startTime);
  let remaining = Math.max(0, Math.ceil(workingMinutes));
  if (remaining === 0) return formatHM(cursor);

  let guard = 0;
  while (remaining > 0) {
    guard++;
    if (guard > 10000) throw new Error("break_window_calculation_loop");

    const breakEnd = currentBreakEnd(cursor, breakWindows);
    if (breakEnd != null) {
      cursor = breakEnd;
      continue;
    }

    const nextBreak = nextBreakStart(cursor, breakWindows);
    if (nextBreak == null) {
      cursor += remaining;
      break;
    }

    const workableBeforeBreak = Math.max(0, nextBreak - cursor);
    if (workableBeforeBreak === 0) {
      cursor = nextBreak;
      continue;
    }

    const used = Math.min(remaining, workableBeforeBreak);
    cursor += used;
    remaining -= used;
  }

  return formatHM(cursor);
}

export function nextWorkingMinute(
  minute: number,
  breakWindows: BreakWindow[] = DAILY_BREAK_WINDOWS,
): number {
  let cursor = minute;
  let guard = 0;
  while (true) {
    guard++;
    if (guard > 1000) throw new Error("break_window_calculation_loop");
    const breakEnd = currentBreakEnd(cursor, breakWindows);
    if (breakEnd == null) return cursor;
    cursor = breakEnd;
  }
}

export function isDailyBreakMinute(
  minute: number,
  breakWindows: BreakWindow[] = DAILY_BREAK_WINDOWS,
): boolean {
  return currentBreakEnd(minute, breakWindows) != null;
}

function currentBreakEnd(minute: number, breakWindows: BreakWindow[]): number | null {
  const day = Math.floor(minute / MINUTES_PER_DAY);
  for (const candidateDay of [day - 1, day]) {
    for (const window of breakWindows) {
      const range = concreteBreakRange(window, candidateDay);
      if (range.start <= minute && minute < range.end) return range.end;
    }
  }
  return null;
}

function nextBreakStart(minute: number, breakWindows: BreakWindow[]): number | null {
  if (breakWindows.length === 0) return null;
  const day = Math.floor(minute / MINUTES_PER_DAY);
  let next: number | null = null;
  for (const candidateDay of [day - 1, day, day + 1, day + 2]) {
    for (const window of breakWindows) {
      const range = concreteBreakRange(window, candidateDay);
      if (range.end <= minute) continue;
      if (range.start < minute) continue;
      next = next == null ? range.start : Math.min(next, range.start);
    }
  }
  return next;
}

function breakRangesForInterval(
  start: number,
  end: number,
  breakWindows: BreakWindow[] = DAILY_BREAK_WINDOWS,
) {
  const startDay = Math.floor(start / MINUTES_PER_DAY) - 1;
  const endDay = Math.floor(end / MINUTES_PER_DAY) + 1;
  const ranges: { start: number; end: number }[] = [];
  for (let day = startDay; day <= endDay; day++) {
    for (const window of breakWindows) {
      const range = concreteBreakRange(window, day);
      if (range.end > start && range.start < end) ranges.push(range);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function concreteBreakRange(window: BreakWindow, day: number) {
  const start = parseHM(window.startTime) + day * MINUTES_PER_DAY;
  let end = parseHM(window.endTime) + day * MINUTES_PER_DAY;
  if (end <= start) end += MINUTES_PER_DAY;
  return { start, end };
}

// --- BOM-based material requirements ---

export interface BomItem {
  itemType: "raw_material" | "packaging";
  itemId: string;
  itemName: string;
  unit: string;
  quantityPerUnit: number;
  lossRate: number; // 0.05 = 5%
  unitPrice: number;
}

export interface RequirementInput {
  quantity: number;
  bom: BomItem[];
  inventory: Record<
    string,
    { onHand: number; confirmedInbound: number; unconfirmedInbound: number }
  >;
}

export interface RequirementLine {
  itemType: BomItem["itemType"];
  itemId: string;
  itemName: string;
  unit: string;
  plannedQuantity: number;
  onHand: number;
  confirmedInbound: number;
  unconfirmedInbound: number;
  shortageQuantity: number;
  shortageType: "none" | "hard_shortage" | "unconfirmed_dependency";
  cost: number;
  unitPrice: number;
}

export function computeMaterialRequirements(input: RequirementInput): RequirementLine[] {
  return input.bom.map((b) => {
    const planned = input.quantity * b.quantityPerUnit * (1 + (b.lossRate ?? 0));
    const inv = input.inventory[b.itemId] ?? {
      onHand: 0,
      confirmedInbound: 0,
      unconfirmedInbound: 0,
    };
    const confirmedAvail = inv.onHand + inv.confirmedInbound;
    const totalAvail = confirmedAvail + inv.unconfirmedInbound;

    let shortageQuantity = 0;
    let shortageType: RequirementLine["shortageType"] = "none";
    if (confirmedAvail < planned) {
      shortageQuantity = round4(planned - confirmedAvail);
      shortageType = totalAvail >= planned ? "unconfirmed_dependency" : "hard_shortage";
    }

    return {
      itemType: b.itemType,
      itemId: b.itemId,
      itemName: b.itemName,
      unit: b.unit,
      plannedQuantity: round4(planned),
      onHand: inv.onHand,
      confirmedInbound: inv.confirmedInbound,
      unconfirmedInbound: inv.unconfirmedInbound,
      shortageQuantity,
      shortageType,
      cost: round2(planned * b.unitPrice),
      unitPrice: b.unitPrice,
    };
  });
}

// --- Cost estimate ---

export interface CostInput {
  quantity: number;
  billingUnitPrice: number; // 手間賃単価
  materialCost: number;
  packagingCost: number;
  /** Optional: hourly wage * person-hours when billing per piece is not applicable */
  laborCostOverride?: number;
}

export interface CostResult {
  laborCost: number;
  materialCost: number;
  packagingCost: number;
  totalCost: number;
  revenueEstimate: number;
}

export function computeCostEstimate(input: CostInput): CostResult {
  const laborCost = input.laborCostOverride ?? input.quantity * input.billingUnitPrice;
  return {
    laborCost: round2(laborCost),
    materialCost: round2(input.materialCost),
    packagingCost: round2(input.packagingCost),
    totalCost: round2(laborCost + input.materialCost + input.packagingCost),
    revenueEstimate: round2(input.quantity * input.billingUnitPrice),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
