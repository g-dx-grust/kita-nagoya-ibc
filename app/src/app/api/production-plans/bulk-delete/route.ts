import { audit } from "@/lib/audit";
import { badRequest, handleError, ok, parseJson } from "@/lib/http";
import { cancelProductionPlanPlannedMovements } from "@/lib/inventory-ledger";
import { prisma } from "@/lib/prisma";
import { ProductionPlanBulkDeleteSchema } from "@/lib/schemas";

// POST /api/production-plans/bulk-delete
// 既存の DELETE /api/production-plans/{id} を補完。
//   body.ids[]               → ID群を直接削除
//   body.filter{dateFrom,dateTo,[status,workAreaId]} → 期間指定で削除
// 関連 (requirements / assignments / daily_report*) は schema の cascade と
// daily_report 紐付け解除で安全に削除する。
export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductionPlanBulkDeleteSchema);

    const where = body.ids && body.ids.length > 0
      ? { id: { in: body.ids } }
      : body.filter
        ? {
            date: {
              gte: new Date(body.filter.dateFrom),
              lte: new Date(body.filter.dateTo),
            },
            status: body.filter.status,
            workAreaId: body.filter.workAreaId,
          }
        : null;

    if (!where) return badRequest("missing_selector");

    const targets = await prisma.productionPlan.findMany({
      where,
      select: { id: true, date: true, productId: true, status: true },
    });
    if (targets.length === 0) return ok({ deleted: 0, ids: [] });

    const ids = targets.map((t) => t.id);

    const deleted = await prisma.$transaction(async (tx) => {
      // DailyReport は productionPlan に onDelete:Cascade が付いている。
      // ただし確定済み日報を消すと、確定済みの実績在庫(daily_report movement)が
      // 台帳に孤児として残るため、ここでは status=draft の日報のみ削除し、
      // 確定済み日報が残る予定は下の blocked 判定で削除対象から除外する。
      await tx.dailyReport.deleteMany({
        where: { productionPlanId: { in: ids }, status: "draft" },
      });
      const blockingReports = await tx.dailyReport.findMany({
        where: { productionPlanId: { in: ids } },
        select: { productionPlanId: true },
      });
      const blocked = new Set(blockingReports.map((r) => r.productionPlanId));
      const deletable = ids.filter((id) => !blocked.has(id));
      if (deletable.length === 0) return { deleted: 0, blocked: blocked.size };

      // requirements / assignments / (draft の)dailyReport は schema の onDelete: Cascade で連動削除される。
      for (const id of deletable) {
        await cancelProductionPlanPlannedMovements(tx, id);
      }
      await tx.productionPlan.deleteMany({ where: { id: { in: deletable } } });
      return { deleted: deletable.length, blocked: blocked.size };
    });

    await audit({
      action: "bulk_delete",
      entityType: "ProductionPlan",
      before: targets,
      after: { deleted: deleted.deleted, blocked: deleted.blocked },
    });

    return ok({
      deleted: deleted.deleted,
      blocked: deleted.blocked,
      message:
        deleted.blocked > 0
          ? `${deleted.deleted}件削除しました。${deleted.blocked}件は確定済み日報があるため削除されませんでした。`
          : `${deleted.deleted}件削除しました。`,
    });
  } catch (e) {
    return handleError(e);
  }
}
