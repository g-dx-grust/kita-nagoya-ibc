import { audit } from "@/lib/audit";
import { handleError, notFound, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.productionPlan.findUnique({ where: { id } });
    if (!before) return notFound();
    const after = await prisma.productionPlan.update({
      where: { id },
      data: { status: "confirmed" },
    });
    // 確定しても実在庫は減らさない: 予定引当として扱う (docs/03 受け入れ条件)
    await audit({ action: "confirm", entityType: "ProductionPlan", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
