import type { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "./csv";

const SOURCE_TYPES = ["manual", "import", "daily_report"] as const;

export type ProductMonthlyActualImportError = {
  row: number;
  reason: string;
};

export type ProductMonthlyActualImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: ProductMonthlyActualImportError[];
};

export async function importProductMonthlyActualsCsv(
  prisma: PrismaClient,
  csvText: string,
): Promise<ProductMonthlyActualImportResult> {
  const { rows } = parseCsvWithHeader(csvText);
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, productCode: true },
  });
  const productByCode = new Map(products.map((product) => [product.productCode, product.id]));

  let imported = 0;
  const errors: ProductMonthlyActualImportError[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const productCode = csvValue(row.product_code);
    const yearMonth = csvValue(row.year_month);
    const quantity = csvNonnegative(row.actual_quantity);
    const sourceType = csvValue(row.source_type) ?? "manual";
    const note = csvValue(row.note);

    if (!productCode) {
      errors.push({ row: line, reason: "product_code is required" });
      continue;
    }
    const productId = productByCode.get(productCode);
    if (!productId) {
      errors.push({ row: line, reason: `product_code not found: ${productCode}` });
      continue;
    }
    if (!yearMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      errors.push({ row: line, reason: "year_month must be YYYY-MM" });
      continue;
    }
    if (quantity == null || quantity === false) {
      errors.push({ row: line, reason: "actual_quantity must be a nonnegative number" });
      continue;
    }
    if (!isSourceType(sourceType)) {
      errors.push({ row: line, reason: "source_type must be manual, import, or daily_report" });
      continue;
    }

    await prisma.productMonthlyActual.upsert({
      where: { productId_yearMonth: { productId, yearMonth } },
      update: { actualQuantity: quantity, sourceType, note },
      create: { productId, yearMonth, actualQuantity: quantity, sourceType, note },
    });
    imported++;
  }

  return {
    ok: errors.length === 0,
    imported,
    skipped: errors.length,
    errors,
  };
}

function csvValue(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function csvNonnegative(value: string | undefined): number | false | null {
  const s = csvValue(value);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : false;
}

function isSourceType(value: string): value is (typeof SOURCE_TYPES)[number] {
  return (SOURCE_TYPES as readonly string[]).includes(value);
}
