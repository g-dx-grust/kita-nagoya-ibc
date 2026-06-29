import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";
    const targetMonth = url.searchParams.get("targetMonth") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

    const rows = await prisma.replanEvent.findMany({
      where: {
        ...(status === "all" ? {} : { status }),
        ...(targetMonth ? { targetMonth } : {}),
      },
      include: {
        jobs: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });

    return ok({ rowCount: rows.length, events: rows });
  } catch (e) {
    return handleError(e);
  }
}
