export type ShiftChangeDay = {
  day: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

export type ShiftChangeDiff = {
  addedDays: number[];
  removedDays: number[];
  changedDays: number[];
  hasChanges: boolean;
};

export function normalizeShiftChangeDays(days: ShiftChangeDay[]): ShiftChangeDay[] {
  const byDay = new Map<number, ShiftChangeDay>();
  for (const day of days) {
    byDay.set(day.day, {
      day: day.day,
      startTime: day.startTime,
      endTime: day.endTime,
      breakMinutes: Math.max(0, Math.round(day.breakMinutes)),
    });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function diffShiftChangeDays(
  currentDays: ShiftChangeDay[],
  requestedDays: ShiftChangeDay[],
): ShiftChangeDiff {
  const current = new Map(normalizeShiftChangeDays(currentDays).map((day) => [day.day, day]));
  const requested = new Map(normalizeShiftChangeDays(requestedDays).map((day) => [day.day, day]));
  const addedDays: number[] = [];
  const removedDays: number[] = [];
  const changedDays: number[] = [];

  for (const [day, requestedDay] of requested) {
    const currentDay = current.get(day);
    if (!currentDay) {
      addedDays.push(day);
      continue;
    }
    if (!sameShiftChangeDay(currentDay, requestedDay)) changedDays.push(day);
  }

  for (const day of current.keys()) {
    if (!requested.has(day)) removedDays.push(day);
  }

  return {
    addedDays,
    removedDays,
    changedDays,
    hasChanges: addedDays.length + removedDays.length + changedDays.length > 0,
  };
}

export function serializeShiftChangeDays(days: ShiftChangeDay[]): string {
  return JSON.stringify(normalizeShiftChangeDays(days));
}

function sameShiftChangeDay(a: ShiftChangeDay, b: ShiftChangeDay) {
  return (
    a.day === b.day &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.breakMinutes === b.breakMinutes
  );
}
