import { audit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";
import { importProductMonthlyActualsCsv } from "@/lib/product-monthly-actuals-import";
import { prisma } from "@/lib/prisma";

// Columns: product_code,year_month,actual_quantity,source_type,note
export async function POST(req: Request) {
  try {
    const result = await importProductMonthlyActualsCsv(prisma, await req.text());

    await audit({
      action: "import_product_monthly_actuals",
      entityType: "ProductMonthlyActual",
      after: { imported: result.imported, skipped: result.skipped },
    });

    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
