import type { Prisma, PrismaClient } from "@prisma/client";
import { yearMonthFromDateInput } from "./monthly-production-forecast";

// 確定済み日報の実績数量を月次実績 (ProductMonthlyActual) へ自動集計する。
//
// 方針: 確定日報のみを実績として扱い、予定値 (ProductionPlan.plannedQuantity) とは混同しない。
// 手入力 / CSV取込で登録された月次実績 (sourceType=manual|import) は上書きしない。
// 日報由来 (sourceType=daily_report) の行、または行が未作成の場合のみ書き込む。

type AggregationClient = PrismaClient | Prisma.TransactionClient;

type ConfirmedActualReport = {
  actualQuantity: number | null;
};

/**
 * 確定日報の実績数量を合計する純関数。null/未入力は 0 として扱う。
 * 単体テスト対象。DBアクセスは行わない。
 */
export function sumConfirmedActuals(reports: ConfirmedActualReport[]): number {
  const total = reports.reduce((sum, report) => sum + (report.actualQuantity ?? 0), 0);
  return round4(total);
}

/**
 * 指定商品・年月の確定日報を集計し、ProductMonthlyActual を upsert する。
 * 対象は ProductionPlan.date がその年月に含まれる CONFIRMED な日報のみ。
 *
 * 既存行が manual / import の場合は上書きしない（手入力・取込実績を保護）。
 * 既存行が無い、または sourceType==='daily_report' の場合のみ書き込み、
 * 自分が所有する行は常に sourceType='daily_report' とする。
 *
 * @returns 書き込んだ場合は upsert 後の行、保護のためスキップした場合は null。
 */
export async function syncMonthlyActualFromDailyReports(
  client: AggregationClient,
  { productId, yearMonth }: { productId: string; yearMonth: string },
) {
  assertYearMonth(yearMonth);

  const reports = await client.dailyReport.findMany({
    where: {
      status: "confirmed",
      productionPlan: {
        productId,
        date: monthRange(yearMonth),
      },
    },
    select: { actualQuantity: true },
  });
  const actualQuantity = sumConfirmedActuals(reports);

  const existing = await client.productMonthlyActual.findUnique({
    where: { productId_yearMonth: { productId, yearMonth } },
    select: { sourceType: true },
  });

  // 手入力 / CSV取込で確定済みの実績は、日報集計で上書きしない。
  if (existing && existing.sourceType !== "daily_report") {
    return null;
  }

  return client.productMonthlyActual.upsert({
    where: { productId_yearMonth: { productId, yearMonth } },
    update: { actualQuantity, sourceType: "daily_report" },
    create: { productId, yearMonth, actualQuantity, sourceType: "daily_report" },
  });
}

/**
 * 日報蓄積(ProductionDailyReportEntry, active)の生産数量を月次実績へ集計する。
 * A系統(DailyReport)を引退させ B系統を正にしたため、当月実績はこちらから書く。
 * 既存行が manual / import の場合は上書きしない(手入力・取込実績を保護)。
 */
export async function syncMonthlyActualFromProductionDailyReports(
  client: AggregationClient,
  { productId, yearMonth }: { productId: string; yearMonth: string },
) {
  assertYearMonth(yearMonth);

  const entries = await client.productionDailyReportEntry.findMany({
    where: {
      active: true,
      approvalStatus: "approved",
      productId,
      reportDate: monthRange(yearMonth),
    },
    select: { productionQty: true },
  });
  const actualQuantity = round4(entries.reduce((sum, e) => sum + (e.productionQty ?? 0), 0));

  const existing = await client.productMonthlyActual.findUnique({
    where: { productId_yearMonth: { productId, yearMonth } },
    select: { sourceType: true },
  });
  if (existing && existing.sourceType !== "daily_report") {
    return null;
  }

  return client.productMonthlyActual.upsert({
    where: { productId_yearMonth: { productId, yearMonth } },
    update: { actualQuantity, sourceType: "daily_report" },
    create: { productId, yearMonth, actualQuantity, sourceType: "daily_report" },
  });
}

/** ProductionPlan.date を年月で絞り込むための [月初, 翌月初) 範囲を返す。 */
function monthRange(yearMonth: string): { gte: Date; lt: Date } {
  const [year, month] = parseYearMonth(yearMonth);
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

/** Date から YYYY-MM を導出する（UTC基準・confirm route から日付を渡す用途）。 */
export function yearMonthFromDate(date: Date): string {
  return yearMonthFromDateInput(date.toISOString().slice(0, 10));
}

function parseYearMonth(yearMonth: string): [number, number] {
  return [Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7))];
}

function assertYearMonth(yearMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error(`invalid_year_month:${yearMonth}`);
  }
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
