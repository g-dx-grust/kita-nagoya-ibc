import { audit } from "@/lib/audit";
import { created, handleError, parseJson } from "@/lib/http";
import { itemKey, loadMaterialForecast, type MaterialShortageType } from "@/lib/material-forecast";
import { roundOrderQuantity } from "@/lib/order-quantity";
import { prisma } from "@/lib/prisma";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { z } from "zod";

const GenerateSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  replaceExistingCandidates: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, GenerateSchema);
    const forecast = await loadMaterialForecast({
      dateFrom: new Date(body.dateFrom),
      dateTo: new Date(body.dateTo),
    });
    const itemMap = new Map(forecast.items.map((item) => [itemKey(item.itemType, item.itemId), item]));
    // 実際に作れなくなる hard_shortage に加え、安全在庫を割り込む below_safety の早期警告も
    // 発注候補にする(要件「一定数を下回る前に発注」)。実発注より前に発注期限・緊急度を出すため。
    const CANDIDATE_TYPES: MaterialShortageType[] = ["hard_shortage", "below_safety"];
    const SEVERITY: Record<MaterialShortageType, number> = {
      none: 0,
      below_safety: 1,
      unconfirmed_dependency: 1,
      hard_shortage: 2,
    };
    const shortages = new Map<
      string,
      {
        itemType: "raw_material" | "packaging";
        itemId: string;
        shortageDate: string;
        shortageQuantity: number;
        shortageType: MaterialShortageType;
      }
    >();

    for (const line of forecast.lines) {
      if (!CANDIDATE_TYPES.includes(line.shortageType)) continue;
      const key = itemKey(line.itemType, line.itemId);
      const current = shortages.get(key);
      if (!current) {
        shortages.set(key, {
          itemType: line.itemType,
          itemId: line.itemId,
          shortageDate: line.date,
          shortageQuantity: line.shortageQuantity,
          shortageType: line.shortageType,
        });
        continue;
      }
      current.shortageQuantity = Math.max(current.shortageQuantity, line.shortageQuantity);
      if (line.date < current.shortageDate) current.shortageDate = line.date;
      // より重大な区分(hard_shortage)を品目の代表区分にする。
      if (SEVERITY[line.shortageType] > SEVERITY[current.shortageType]) {
        current.shortageType = line.shortageType;
      }
    }

    const data = [...shortages.values()].map((shortage) => {
      const item = itemMap.get(itemKey(shortage.itemType, shortage.itemId));
      const shortageDate = new Date(shortage.shortageDate);
      const recommendedOrderDate = new Date(shortageDate);
      recommendedOrderDate.setDate(recommendedOrderDate.getDate() - (item?.leadTimeDays ?? 0));
      // 不足量を発注ロット/最小発注量に合わせて実発注量へ丸める。
      const orderedQuantity = roundOrderQuantity(shortage.shortageQuantity, {
        orderLotQty: item?.orderLotQty ?? null,
        minOrderQty: item?.minOrderQty ?? null,
      });
      const reason =
        shortage.shortageType === "below_safety"
          ? "安全在庫割れの早期警告から自動生成"
          : "累積不足から自動生成";
      return {
        itemType: shortage.itemType,
        itemId: shortage.itemId,
        supplierId: item?.supplierId ?? null,
        orderedQuantity,
        confirmedQuantity: null,
        expectedArrivalDate: shortageDate,
        shortageDate,
        recommendedOrderDate,
        urgency: computeUrgency({ requiredOrderDate: recommendedOrderDate, asOfDate: new Date() }),
        sourceType: "material_forecast",
        sourceId: itemKey(shortage.itemType, shortage.itemId),
        status: "candidate",
        note: `${item?.itemName ?? "品目"} の${reason}`,
      };
    });

    const rows = await prisma.$transaction(async (tx) => {
      if (body.replaceExistingCandidates) {
        await tx.purchaseOrder.deleteMany({
          where: { status: "candidate", sourceType: "material_forecast" },
        });
      }
      if (data.length > 0) await tx.purchaseOrder.createMany({ data });
      return tx.purchaseOrder.findMany({
        where: { status: "candidate", sourceType: "material_forecast" },
        orderBy: [{ shortageDate: "asc" }, { itemType: "asc" }],
      });
    });

    await audit({
      action: "generate_purchase_candidates",
      entityType: "PurchaseOrder",
      entityId: `${body.dateFrom}_${body.dateTo}`,
      after: rows,
    });

    return created({ rowCount: rows.length, candidates: rows });
  } catch (e) {
    return handleError(e);
  }
}
