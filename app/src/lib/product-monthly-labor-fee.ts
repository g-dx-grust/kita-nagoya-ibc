import type { Prisma, PrismaClient } from "@prisma/client";

import { audit } from "./audit";
import { HttpError } from "./http";
import { prisma } from "./prisma";

// 蓄積日報(ProductionDailyReportEntry)から、商品別・月次の「1袋手間賃」を算出し、
// ProductMonthlyLaborFee に保存する。手動 apply で BillingPrice(売値=手間賃単価)へ反映する。

type Client = PrismaClient | Prisma.TransactionClient;

export type MonthlyLaborFeeSampleInput = {
  productId: string | null;
  laborFeePerUnit: number;
  perHourQty: number;
};

export type MonthlyLaborFeeRow = {
  productId: string;
  perBagLaborFee: number;
  avgPerHourQty: number;
  sampleCount: number;
};

/** 数値配列の中央値。外れ値に強い。空配列は 0。 */
export function median(values: number[]): number {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (usable.length === 0) return 0;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 === 0 ? (usable[mid - 1] + usable[mid]) / 2 : usable[mid];
}

/**
 * 日報サンプルを商品別に集計し、laborFeePerUnit の中央値を 1袋手間賃 とする純関数。
 * laborFeePerUnit <= 0 のサンプル(時間不正等)は中央値の母集団から除外する。
 */
export function computeMonthlyLaborFees(samples: MonthlyLaborFeeSampleInput[]): MonthlyLaborFeeRow[] {
  const groups = new Map<string, { fees: number[]; perHour: number[] }>();
  for (const s of samples) {
    if (!s.productId || !(s.laborFeePerUnit > 0)) continue;
    const g = groups.get(s.productId) ?? { fees: [], perHour: [] };
    g.fees.push(s.laborFeePerUnit);
    if (s.perHourQty > 0) g.perHour.push(s.perHourQty);
    groups.set(s.productId, g);
  }

  return Array.from(groups, ([productId, g]) => ({
    productId,
    perBagLaborFee: round2(median(g.fees)),
    avgPerHourQty: round4(g.perHour.length ? g.perHour.reduce((a, b) => a + b, 0) / g.perHour.length : 0),
    sampleCount: g.fees.length,
  })).sort((a, b) => b.sampleCount - a.sampleCount);
}

/** 対象月の active 日報を読み、商品別 1袋手間賃を draft で upsert する。 */
export async function recomputeMonthlyLaborFees(yearMonth: string, client: Client = prisma) {
  assertYearMonth(yearMonth);
  const { gte, lt } = monthRange(yearMonth);
  const entries = await client.productionDailyReportEntry.findMany({
    where: { active: true, approvalStatus: "approved", productId: { not: null }, reportDate: { gte, lt } },
    select: { productId: true, laborFeePerUnit: true, perHourQty: true },
  });

  const rows = computeMonthlyLaborFees(
    entries.map((e) => ({ productId: e.productId, laborFeePerUnit: e.laborFeePerUnit, perHourQty: e.perHourQty })),
  );

  const now = new Date();
  const productIdsWithSamples = new Set(rows.map((row) => row.productId));
  for (const row of rows) {
    await client.productMonthlyLaborFee.upsert({
      where: { productId_yearMonth: { productId: row.productId, yearMonth } },
      // 再計算したら draft に戻し、レビュー→再反映できるようにする。
      update: {
        perBagLaborFee: row.perBagLaborFee,
        avgPerHourQty: row.avgPerHourQty,
        sampleCount: row.sampleCount,
        status: "draft",
        appliedAt: null,
        appliedBillingPriceId: null,
        computedAt: now,
      },
      create: {
        productId: row.productId,
        yearMonth,
        perBagLaborFee: row.perBagLaborFee,
        avgPerHourQty: row.avgPerHourQty,
        sampleCount: row.sampleCount,
        status: "draft",
        computedAt: now,
      },
    });
  }
  const staleWhere: Prisma.ProductMonthlyLaborFeeWhereInput = { yearMonth };
  if (productIdsWithSamples.size > 0) {
    staleWhere.productId = { notIn: Array.from(productIdsWithSamples) };
  }
  const stale = await client.productMonthlyLaborFee.updateMany({
    where: staleWhere,
    data: {
      perBagLaborFee: 0,
      avgPerHourQty: 0,
      sampleCount: 0,
      status: "draft",
      appliedAt: null,
      appliedBillingPriceId: null,
      computedAt: now,
    },
  });

  await audit({
    action: "recompute_monthly_labor_fee",
    entityType: "ProductMonthlyLaborFee",
    entityId: yearMonth,
    after: { yearMonth, productCount: rows.length, staleCount: stale.count },
  });

  return client.productMonthlyLaborFee.findMany({
    where: { yearMonth },
    include: { product: true },
    orderBy: [{ sampleCount: "desc" }],
  });
}

/** draft の月次手間賃を BillingPrice(売値) へ反映する。既定の適用開始日は対象月の翌月1日。 */
export async function applyMonthlyLaborFee(id: string, effectiveFrom?: string) {
  const row = await prisma.productMonthlyLaborFee.findUnique({ where: { id }, include: { product: true } });
  if (!row) throw new HttpError(404, "not_found");
  if (!(row.perBagLaborFee > 0)) throw new HttpError(400, "no_labor_fee", "手間賃が算出されていません。");

  const effectiveDate = effectiveFrom
    ? new Date(`${effectiveFrom}T00:00:00.000Z`)
    : nextMonthStart(row.yearMonth);

  const updated = await prisma.$transaction(async (tx) => {
    const price = await tx.billingPrice.create({
      data: {
        productId: row.productId,
        unitPrice: row.perBagLaborFee,
        unit: row.product.unit,
        effectiveFrom: effectiveDate,
        billingTarget: true,
        note: `月次手間賃(${row.yearMonth}) 中央値 n=${row.sampleCount} を反映`,
      },
    });
    return tx.productMonthlyLaborFee.update({
      where: { id },
      data: { status: "applied", appliedAt: new Date(), appliedBillingPriceId: price.id },
      include: { product: true },
    });
  });

  await audit({
    action: "apply_monthly_labor_fee",
    entityType: "ProductMonthlyLaborFee",
    entityId: id,
    before: row,
    after: updated,
  });
  return updated;
}

function monthRange(yearMonth: string): { gte: Date; lt: Date } {
  const [year, month] = parseYearMonth(yearMonth);
  return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
}

function nextMonthStart(yearMonth: string): Date {
  const [year, month] = parseYearMonth(yearMonth);
  return new Date(Date.UTC(year, month, 1)); // month は1始まり -> Date.UTC(y, month, 1) は翌月1日
}

function parseYearMonth(yearMonth: string): [number, number] {
  return [Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7))];
}

function assertYearMonth(yearMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new HttpError(400, "invalid_year_month", `年月が不正です: ${yearMonth}`);
  }
}

function round2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function round4(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;
}
