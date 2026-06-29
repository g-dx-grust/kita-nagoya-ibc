import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { computeDailyReportActualCost } from "./daily-report-cost";
import { HttpError } from "./http";
import { replaceDailyReportActualMovements } from "./inventory-ledger";
import { refreshCumulativeMaterialRequirements } from "./material-forecast";
import { getCurrentBillingUnitPrice } from "./plan-engine";
import { prisma } from "./prisma";

// 日報(実績)の下書き保存・確定の中核ロジック。
// 生産予定詳細フォーム / 当日一括入力の両方からここを呼び、挙動を一本化する。

type DailyReportWithConsumptions = Prisma.DailyReportGetPayload<{ include: { consumptions: true } }>;

export type DailyReportDraftInput = {
  actualStartTime?: string;
  actualEndTime?: string;
  actualBreakMinutes?: number;
  actualPeopleCount?: number;
  actualQuantity?: number;
  note?: string | null;
  consumptions?: {
    itemType: "raw_material" | "packaging";
    itemId: string;
    actualQuantity: number;
    unitPriceSnapshot?: number;
  }[];
};

// 生産予定に紐づく日報の下書きを作成/更新する。未指定の実績値は予定値で埋める。
// 確定済みの日報は下書きへ戻さない(チェックと更新を同一トランザクション内で原子化し、
// 個別フォーム/一括入力の同時実行による確定の巻き戻しを防ぐ)。
export async function upsertDailyReportDraft(
  planId: string,
  input: DailyReportDraftInput,
): Promise<DailyReportWithConsumptions> {
  const plan = await prisma.productionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "not_found");

  const data = {
    productionPlanId: planId,
    actualStartTime: input.actualStartTime ?? plan.plannedStartTime,
    actualEndTime: input.actualEndTime ?? plan.plannedEndTime ?? null,
    actualBreakMinutes: input.actualBreakMinutes ?? 0,
    actualPeopleCount: input.actualPeopleCount ?? plan.plannedPeopleCount,
    actualQuantity: input.actualQuantity ?? plan.plannedQuantity,
    status: "draft",
    note: input.note ?? null,
  };

  const { report, isNew } = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyReport.findUnique({ where: { productionPlanId: planId } });
    if (existing?.status === "confirmed") {
      throw new HttpError(409, "already_confirmed", "確定済みの日報は変更できません。");
    }
    const saved = existing
      ? await tx.dailyReport.update({ where: { id: existing.id }, data })
      : await tx.dailyReport.create({ data });
    await tx.dailyReportConsumption.deleteMany({ where: { dailyReportId: saved.id } });
    const consumptions = input.consumptions ?? [];
    if (consumptions.length > 0) {
      await tx.dailyReportConsumption.createMany({
        data: consumptions.map((c) => ({
          itemType: c.itemType,
          itemId: c.itemId,
          actualQuantity: c.actualQuantity,
          unitPriceSnapshot: c.unitPriceSnapshot ?? 0,
          dailyReportId: saved.id,
        })),
      });
    }
    const full = await tx.dailyReport.findUnique({
      where: { id: saved.id },
      include: { consumptions: true },
    });
    return { report: full!, isNew: !existing };
  });

  await audit({
    action: isNew ? "create" : "update",
    entityType: "DailyReport",
    entityId: report.id,
    after: report,
  });
  return report;
}

export type ConfirmResult = {
  report: DailyReportWithConsumptions;
  planDate: Date;
  alreadyConfirmed: boolean;
};

// 日報を確定する: 実績を在庫台帳へ反映し、生産予定を完了にする。
// skipForecastRefresh=true のときは発注予測の引き直しを呼び元(一括確定)へ委ねる。
export async function confirmDailyReport(
  reportId: string,
  opts?: { skipForecastRefresh?: boolean },
): Promise<ConfirmResult> {
  const before = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { consumptions: true },
  });
  if (!before) throw new HttpError(404, "not_found");

  const plan = await prisma.productionPlan.findUnique({ where: { id: before.productionPlanId } });
  if (!plan) throw new HttpError(404, "plan_not_found");

  if (before.status === "confirmed") {
    return { report: before, planDate: plan.date, alreadyConfirmed: true };
  }
  if (plan.status === "cancelled") {
    throw new HttpError(400, "plan_cancelled", "中止済みの生産予定の日報は確定できません。");
  }
  const reflectedProductDailyReport = await prisma.productionDailyReportEntry.findFirst({
    where: {
      productionPlanId: plan.id,
      active: true,
      approvalStatus: "approved",
      inventoryReflected: true,
    },
    select: { id: true },
  });

  // 確定日の手間賃単価をスナップショットし、実績数量×単価で実績原価を再計算する。
  const billingUnitPrice = await getCurrentBillingUnitPrice(plan.productId, plan.date);
  const actualCost = computeDailyReportActualCost({
    actualQuantity: before.actualQuantity,
    billingUnitPrice,
    consumptions: before.consumptions,
  });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyReport.update({
      where: { id: reportId },
      include: { consumptions: true },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        actualLaborCost: actualCost.actualLaborCost,
        actualMaterialCost: actualCost.actualMaterialCost,
        actualPackagingCost: actualCost.actualPackagingCost,
        actualTotalCost: actualCost.actualTotalCost,
      },
    });
    if (!reflectedProductDailyReport) {
      await replaceDailyReportActualMovements(tx, updated, plan);
    }
    await tx.productionPlan.update({ where: { id: plan.id }, data: { status: "completed" } });
    return updated;
  });

  await audit({ action: "confirm", entityType: "DailyReport", entityId: reportId, before, after });

  // 月次実績(ProductMonthlyActual)の集計は日報蓄積(B)側へ一本化したため、A確定では行わない。

  if (!opts?.skipForecastRefresh) {
    await refreshMaterialForecastFromToday(plan.date);
  }

  return { report: after, planDate: plan.date, alreadyConfirmed: false };
}

// 今日〜(対象生産日+90日)の範囲で累積所要量(発注候補の基礎)を引き直す。
export async function refreshMaterialForecastFromToday(latestPlanDate: Date) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const horizonEnd = new Date(latestPlanDate.toISOString().slice(0, 10) + "T00:00:00.000Z");
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 90);
  await refreshCumulativeMaterialRequirements({ dateFrom: today, dateTo: horizonEnd });
}
