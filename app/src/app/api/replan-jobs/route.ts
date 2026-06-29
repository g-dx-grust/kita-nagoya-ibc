import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const scopeMonth = url.searchParams.get("scopeMonth") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

    const rows = await prisma.replanJob.findMany({
      where: {
        ...(status
          ? status === "all"
            ? {}
            : { status }
          : { status: { in: ["pending", "planned"] } }),
        ...(scopeMonth ? { scopeMonth } : {}),
      },
      include: { event: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });

    return ok({ rowCount: rows.length, jobs: rows });
  } catch (e) {
    return handleError(e);
  }
}
