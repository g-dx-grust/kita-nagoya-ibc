import { DAILY_BREAK_WINDOWS, type BreakWindow } from "./calculations";
import { prisma } from "./prisma";

export async function loadActiveBreakWindows(
  effectiveDate: Date = new Date(),
  shiftPatternId?: string | null,
): Promise<BreakWindow[]> {
  const rows = await prisma.shiftBreak.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: effectiveDate } }] },
        { OR: [{ validTo: null }, { validTo: { gt: effectiveDate } }] },
        shiftPatternId === undefined
          ? {}
          : { OR: [{ shiftPatternId: null }, { shiftPatternId }] },
      ],
    },
    orderBy: [{ shiftPatternId: "asc" }, { startTime: "asc" }],
  });

  if (rows.length === 0) return DAILY_BREAK_WINDOWS;
  return rows.map((row) => ({ startTime: row.startTime, endTime: row.endTime }));
}
