import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, PUT } from "@/app/api/special-demand-events/[id]/route";
import { GET as LIST_EVENTS } from "@/app/api/special-demand-events/route";
import { filterNormalForecastEvents, isExcludedFromNormalForecast } from "@/lib/special-demand-events";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Special demand events (integration)", () => {
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

  it("creates, retrieves, updates, and soft-deletes a special demand event", async () => {
    const product = await createTestProduct(prisma);
    const event = await prisma.specialDemandEvent.create({
      data: {
        productId: product.id,
        targetYearMonth: "2026-05",
        qty: 120,
        eventType: "OTHER",
      },
    });

    const getResponse = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ id: event.id }),
    });
    expect((await getResponse.json()) as { id: string }).toMatchObject({ id: event.id });

    const putResponse = await PUT(
      new Request("http://test.local", {
        method: "PUT",
        body: JSON.stringify({ qty: 150, status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    const updated = (await putResponse.json()) as { qty: number; status: string };
    expect(updated).toMatchObject({ qty: 150, status: "CONFIRMED" });

    const deleteResponse = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({ id: event.id }),
    });
    const deleted = (await deleteResponse.json()) as { active: boolean; status: string };
    expect(deleted).toMatchObject({ active: false, status: "CANCELLED" });
  });

  it("filters the list API by targetYearMonth", async () => {
    const product = await createTestProduct(prisma);
    await prisma.specialDemandEvent.createMany({
      data: [
        {
          productId: product.id,
          targetYearMonth: "2026-05",
          qty: 100,
          eventType: "OTHER",
        },
        {
          productId: product.id,
          targetYearMonth: "2026-06",
          qty: 200,
          eventType: "OTHER",
        },
      ],
    });

    const response = await LIST_EVENTS(
      new Request("http://test.local/api/special-demand-events?targetYearMonth=2026-05"),
    );
    const rows = (await response.json()) as Array<{ targetYearMonth: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetYearMonth).toBe("2026-05");
  });

  it("marks includeInNormalForecast=false active events as excluded from normal forecasts", () => {
    expect(
      isExcludedFromNormalForecast({
        active: true,
        status: "CONFIRMED",
        includeInNormalForecast: false,
      }),
    ).toBe(true);

    const kept = filterNormalForecastEvents([
      { id: "exclude", active: true, status: "CONFIRMED", includeInNormalForecast: false },
      { id: "include", active: true, status: "CONFIRMED", includeInNormalForecast: true },
      { id: "cancelled", active: true, status: "CANCELLED", includeInNormalForecast: false },
    ]);
    expect(kept.map((event) => event.id)).toEqual(["include", "cancelled"]);
  });
});
