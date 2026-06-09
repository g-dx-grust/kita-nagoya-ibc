import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { cancelProductionPlanPlannedMovements } from "@/lib/inventory-ledger";
import { recalculateProductionPlan } from "@/lib/plan-engine";
import { prisma } from "@/lib/prisma";
import { ProductionPlanUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.productionPlan.findUnique({
    where: { id },
    include: { product: true, workArea: true, requirements: true, assignments: true },
  });
  return row ? ok(row) : notFound();
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionPlan.findUnique({ where: { id } });
    if (!before) return notFound();
    const body = await parseJson(req, ProductionPlanUpdateSchema);
    const updated = await prisma.productionPlan.update({
      where: { id },
      data: {
        ...body,
        date: body.date ? new Date(body.date) : undefined,
      },
    });
    const calc = await recalculateProductionPlan(id);
    const fresh = await prisma.productionPlan.findUnique({
      where: { id },
      include: { product: true, workArea: true, requirements: true },
    });
    await audit({
      action: "update",
      entityType: "ProductionPlan",
      entityId: id,
      before,
      after: updated,
    });
    return ok({ plan: fresh, ...calc });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await prisma.productionPlan.findUnique({ where: { id } });
  if (!before) return notFound();
  // 確定済み日報がある予定は削除させない。DailyReport は onDelete:Cascade なので、
  // ここでガードしないと確定日報が消え、確定済みの実績在庫(daily_report movement)が
  // 台帳に孤児として残ってしまう（draft 日報は実績在庫を持たないので Cascade 削除でよい）。
  const report = await prisma.dailyReport.findUnique({ where: { productionPlanId: id } });
  if (report && report.status !== "draft") {
    return badRequest(
      "confirmed_daily_report_exists",
      "確定済みの日報があるため削除できません。先に日報を取り消してください。",
    );
  }
  await prisma.$transaction(async (tx) => {
    await cancelProductionPlanPlannedMovements(tx, id);
    await tx.productionPlan.delete({ where: { id } });
  });
  await audit({ action: "delete", entityType: "ProductionPlan", entityId: id, before });
  return ok({ deleted: id });
}
