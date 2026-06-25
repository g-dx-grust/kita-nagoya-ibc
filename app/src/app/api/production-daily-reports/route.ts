import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductDailyReportEntrySchema } from "@/lib/schemas";
import { matchesQuery } from "@/lib/search";
import { createProductDailyReportEntry } from "@/lib/product-daily-report-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const yearMonth = url.searchParams.get("yearMonth") ?? undefined;
    const productId = url.searchParams.get("productId") ?? undefined;
    const q = url.searchParams.get("q") ?? "";
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;
    const range = buildDateRange(yearMonth, dateFrom, dateTo);

    const rows = await prisma.productionDailyReportEntry.findMany({
      where: {
        active: true,
        ...(productId ? { productId } : {}),
        ...(range ? { reportDate: range } : {}),
      },
      include: { product: true, workArea: true, laborFeeRate: true },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    });
    const filtered = q
      ? rows.filter((row) =>
          matchesQuery(q, [
            row.productName,
            row.product?.productCode,
            row.product?.officialName,
            row.product?.displayName,
          ]),
        )
      : rows;
    return ok(filtered);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductDailyReportEntrySchema);
    const row = await createProductDailyReportEntry(body);
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}

function buildDateRange(yearMonth?: string, dateFrom?: string, dateTo?: string) {
  if (yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    const start = new Date(`${yearMonth}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { gte: start, lt: end };
  }
  if (!dateFrom && !dateTo) return null;
  return {
    ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
    ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
  };
}
