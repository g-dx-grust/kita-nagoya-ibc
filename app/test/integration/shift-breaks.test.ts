import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, PUT } from "@/app/api/shift-breaks/[id]/route";
import { GET as LIST_BREAKS, POST } from "@/app/api/shift-breaks/route";
import { computeProductionDuration, DAILY_BREAK_WINDOWS } from "@/lib/calculations";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { cleanupAll } from "../helpers/cleanup";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Shift breaks (integration)", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("falls back to DAILY_BREAK_WINDOWS when no active DB rows exist", async () => {
    await expect(loadActiveBreakWindows(new Date("2026-05-28"))).resolves.toEqual(
      DAILY_BREAK_WINDOWS,
    );
  });

  it("loads active DB break windows and filters by validity period", async () => {
    await prisma.shiftBreak.createMany({
      data: [
        {
          startTime: "10:00",
          endTime: "10:30",
          validFrom: new Date("2026-01-01"),
          validTo: null,
        },
        {
          startTime: "11:00",
          endTime: "11:30",
          validFrom: new Date("2025-01-01"),
          validTo: new Date("2026-01-01"),
        },
      ],
    });

    const windows = await loadActiveBreakWindows(new Date("2026-05-28"));

    expect(windows).toEqual([{ startTime: "10:00", endTime: "10:30" }]);
  });

  it("uses DB-derived break windows in duration calculation", async () => {
    await prisma.shiftBreak.create({
      data: { startTime: "10:00", endTime: "10:30" },
    });

    const duration = computeProductionDuration({
      quantity: 150,
      unitsPerPersonHour: 100,
      peopleCount: 1,
      startTime: "09:00",
      breakWindows: await loadActiveBreakWindows(new Date("2026-05-28")),
    });

    expect(duration.endTime).toBe("11:00");
    expect(duration.blockedMinutes).toBe(30);
  });

  it("creates, lists, updates, and soft-deletes a shift break through the API", async () => {
    const postResponse = await POST(
      new Request("http://test.local/api/shift-breaks", {
        method: "POST",
        body: JSON.stringify({ startTime: "12:00", endTime: "13:00", label: "昼休憩" }),
      }),
    );
    const created = (await postResponse.json()) as { id: string; label: string };
    expect(created.label).toBe("昼休憩");

    const listResponse = await LIST_BREAKS(new Request("http://test.local/api/shift-breaks"));
    const rows = (await listResponse.json()) as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toContain(created.id);

    const putResponse = await PUT(
      new Request("http://test.local", {
        method: "PUT",
        body: JSON.stringify({ label: "更新休憩" }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect((await putResponse.json()) as { label: string }).toMatchObject({ label: "更新休憩" });

    const deleteResponse = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect((await deleteResponse.json()) as { active: boolean }).toMatchObject({ active: false });
  });
});
