import { z } from "zod";

import { handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { recomputeMonthlyLaborFees } from "@/lib/product-monthly-labor-fee";

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM 形式で指定してください");
const RecomputeSchema = z.object({ yearMonth });

// GET ?yearMonth=YYYY-MM : 対象月の月次手間賃一覧
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ym = url.searchParams.get("yearMonth") ?? new Date().toISOString().slice(0, 7);
    const parsed = yearMonth.safeParse(ym);
    const rows = parsed.success
        ? await prisma.productMonthlyLaborFee.findMany({
            where: { yearMonth: parsed.data },
            include: { product: true, workArea: true },
            orderBy: [{ sampleCount: "desc" }, { product: { productCode: "asc" } }],
          })
      : [];
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

// POST { yearMonth } : 対象月の日報蓄積から再計算(draft upsert)
export async function POST(req: Request) {
  try {
    const body = await parseJson(req, RecomputeSchema);
    const rows = await recomputeMonthlyLaborFees(body.yearMonth);
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}
