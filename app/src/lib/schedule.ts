import { parseHM } from "./time";

export type TimeRange = {
  startTime: string;
  endTime: string;
};

export function timeRangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = parseHM(a.startTime);
  const aEnd = parseHM(a.endTime);
  const bStart = parseHM(b.startTime);
  const bEnd = parseHM(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

export function isValidTimeRange(range: TimeRange): boolean {
  return parseHM(range.startTime) < parseHM(range.endTime);
}

export function computeAssignablePeople(input: {
  roomMaxPeople?: number | null;
  standardPeople?: number | null;
  availablePeople: number;
}): number {
  const roomMax = Math.max(1, Math.floor(input.roomMaxPeople ?? input.standardPeople ?? 1));
  const available = Math.max(0, Math.floor(input.availablePeople));
  return Math.max(1, Math.min(roomMax, available || roomMax));
}
