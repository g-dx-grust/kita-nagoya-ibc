import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok } from "@/lib/http";
import { MANUAL_INVENTORY_SOURCE_TYPE } from "@/lib/inventory-types";
import { refreshCumulativeMaterialRequirements } from "@/lib/material-forecast";
import { prisma } from "@/lib/prisma";

// 手入力した在庫(StockMovement)の取り消し。誤登録の訂正用。
// 自動生成(生産予定/日報/発注)の行は対象外。削除は監査ログに残す。
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await prisma.stockMovement.findUnique({ where: { id } });
    if (!row) return notFound();
    if (row.sourceType !== MANUAL_INVENTORY_SOURCE_TYPE) {
      return badRequest("手入力以外の在庫は削除できません");
    }
    // 削除と監査ログを同一トランザクションで確定する(削除だけ残らないように)。
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.delete({ where: { id } });
      await audit(
        { action: "manual_delete", entityType: "StockMovement", entityId: id, before: row },
        tx,
      );
    });
    if (row.itemType === "raw_material" || row.itemType === "packaging") {
      const horizonEnd = new Date(row.effectiveDate);
      horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 90);
      await refreshCumulativeMaterialRequirements({
        dateFrom: row.effectiveDate,
        dateTo: horizonEnd,
      });
    }
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
