import {
  confirmDailyReport,
  refreshMaterialForecastFromToday,
  upsertDailyReportDraft,
} from "@/lib/daily-report-service";
import { handleError, HttpError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// 当日一括入力: 各生産予定の日報(実数量・実使用量)をまとめて保存/確定する。
// confirm=false なら下書き保存のみ。confirm=true なら保存→確定し在庫へ反映する。
const Schema = z.object({
  confirm: z.boolean().default(false),
  entries: z
    .array(
      z.object({
        planId: z.string().min(1),
        actualQuantity: z.number().nonnegative().optional(),
        note: z.string().nullish(),
        consumptions: z
          .array(
            z.object({
              itemType: z.enum(["raw_material", "packaging"]),
              itemId: z.string().min(1),
              actualQuantity: z.number().nonnegative(),
              unitPriceSnapshot: z.number().nonnegative().default(0),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, Schema);
    const results: { planId: string; status: string; error?: string }[] = [];
    let latestDate: Date | null = null;

    for (const entry of body.entries) {
      try {
        // 確定済みの日報は下書きへ戻さない(誤った再確定を防ぐ)。
        const existing = await prisma.dailyReport.findUnique({
          where: { productionPlanId: entry.planId },
          select: { status: true },
        });
        if (existing?.status === "confirmed") {
          results.push({ planId: entry.planId, status: "already_confirmed" });
          continue;
        }

        const report = await upsertDailyReportDraft(entry.planId, {
          actualQuantity: entry.actualQuantity,
          note: entry.note,
          consumptions: entry.consumptions,
        });

        if (body.confirm) {
          const r = await confirmDailyReport(report.id, { skipForecastRefresh: true });
          if (!latestDate || r.planDate > latestDate) latestDate = r.planDate;
          results.push({ planId: entry.planId, status: "confirmed" });
        } else {
          results.push({ planId: entry.planId, status: "saved" });
        }
      } catch (err) {
        results.push({
          planId: entry.planId,
          status: "failed",
          error: err instanceof HttpError ? err.message : "error",
        });
      }
    }

    // 確定があった場合のみ、発注予測の引き直しを1回だけ行う。
    if (body.confirm && latestDate) await refreshMaterialForecastFromToday(latestDate);

    return ok({
      saved: results.filter((r) => r.status === "saved").length,
      confirmed: results.filter((r) => r.status === "confirmed").length,
      alreadyConfirmed: results.filter((r) => r.status === "already_confirmed").length,
      failed: results.filter((r) => r.status === "failed"),
      results,
    });
  } catch (e) {
    return handleError(e);
  }
}
