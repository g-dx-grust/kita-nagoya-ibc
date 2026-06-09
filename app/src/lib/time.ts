// HH:MM time helpers. Times are local wall-clock strings, not Date objects,
// because production plans are dispatch-on-the-day and we never need to cross
// timezones inside a single shift.

export function parseHM(hm: string): number {
  const m = /^(\d+):(\d{2})$/.exec(hm);
  if (!m) throw new Error(`invalid HH:MM: ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || min < 0 || min > 59) {
    throw new Error(`out-of-range HH:MM: ${hm}`);
  }
  return h * 60 + min;
}

export function formatHM(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function diffMinutes(startHM: string, endHM: string): number {
  return parseHM(endHM) - parseHM(startHM);
}

export function addMinutes(hm: string, minutes: number): string {
  return formatHM(parseHM(hm) + minutes);
}
