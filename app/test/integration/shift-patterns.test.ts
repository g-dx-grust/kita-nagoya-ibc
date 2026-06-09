import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, PUT } from "@/app/api/shift-patterns/[id]/route";
import { GET as LIST_PATTERNS, POST } from "@/app/api/shift-patterns/route";
import { ShiftPatternCreateSchema } from "@/lib/schemas";
import { cleanupAll } from "../helpers/cleanup";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Shift patterns (integration)", () => {
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

  it("creates, lists, updates, and soft-deletes a shift pattern through the API", async () => {
    const postResponse = await POST(
      new Request("http://test.local/api/shift-patterns", {
        method: "POST",
        body: JSON.stringify({
          name: "標準テスト",
          startTime: "08:00",
          endTime: "17:00",
          overtimeAllowed: true,
        }),
      }),
    );
    const created = (await postResponse.json()) as { id: string; overtimeAllowed: boolean };
    expect(created.overtimeAllowed).toBe(true);

    const listResponse = await LIST_PATTERNS(new Request("http://test.local/api/shift-patterns"));
    const rows = (await listResponse.json()) as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toContain(created.id);

    const putResponse = await PUT(
      new Request("http://test.local", {
        method: "PUT",
        body: JSON.stringify({ note: "更新済み" }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect((await putResponse.json()) as { note: string }).toMatchObject({ note: "更新済み" });

    const deleteResponse = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect((await deleteResponse.json()) as { active: boolean }).toMatchObject({ active: false });
  });

  it("retrieves a single shift pattern with related breaks", async () => {
    const pattern = await prisma.shiftPattern.create({
      data: { name: "関連休憩テスト", startTime: "09:00", endTime: "18:00" },
    });
    await prisma.shiftBreak.create({
      data: { shiftPatternId: pattern.id, startTime: "12:00", endTime: "13:00" },
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ id: pattern.id }),
    });
    const row = (await response.json()) as { breaks: unknown[] };

    expect(row.breaks).toHaveLength(1);
  });

  it("rejects invalid HH:MM values", () => {
    const parsed = ShiftPatternCreateSchema.safeParse({
      name: "時刻不正",
      startTime: "24:00",
      endTime: "17:00",
    });

    expect(parsed.success).toBe(false);
  });
});
