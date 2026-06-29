import { audit } from "@/lib/audit";
import { created, handleError, parseJson } from "@/lib/http";
import {
  itemKey,
  loadMaterialForecast,
  loadMonthEndInventoryForecast,
  type MaterialForecastItem,
  type MaterialShortageType,
} from "@/lib/material-forecast";
import { roundOrderQuantity } from "@/lib/order-quantity";
import { prisma } from "@/lib/prisma";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { z } from "zod";

const GenerateSchema = z
  .object({
    mode: z.enum(["window", "month_end"]).default("window"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    targetMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    replaceExistingCandidates: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "window" && (!value.dateFrom || !value.dateTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "window mode requires dateFrom and dateTo",
        path: ["dateFrom"],
      });
    }
    if (value.mode === "month_end" && !value.targetMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "month_end mode requires targetMonth",
        path: ["targetMonth"],
      });
    }
  });

type CandidateShortage = {
  itemType: "raw_material" | "packaging";
  itemId: string;
  shortageDate: string;
  shortageQuantity: number;
  shortageType: MaterialShortageType;
  reason: string;
};

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, GenerateSchema);
    const forecastItems: MaterialForecastItem[] = [];
    let shortages: CandidateShortage[];
    if (body.mode === "month_end") {
      const forecast = await loadMonthEndInventoryForecast({ targetMonth: body.targetMonth! });
      forecastItems.push(...forecast.items);
      shortages = collectMonthEndShortages(forecast.lines);
    } else {
      const forecast = await loadMaterialForecast({
        dateFrom: new Date(body.dateFrom!),
        dateTo: new Date(body.dateTo!),
      });
      forecastItems.push(...forecast.items);
      shortages = collectWindowShortages(forecast.lines);
    }
    const itemMap = new Map(forecastItems.map((item) => [itemKey(item.itemType, item.itemId), item]));

    const data = shortages.map((shortage) => {
      const item = itemMap.get(itemKey(shortage.itemType, shortage.itemId));
      const shortageDate = new Date(shortage.shortageDate);
      const recommendedOrderDate = new Date(shortageDate);
      recommendedOrderDate.setDate(
        recommendedOrderDate.getDate() -
          (item?.leadTimeDays ?? 0) -
          orderProcessingBufferDays(item),
      );
      // 不足量を発注ロット/最小発注量に合わせて実発注量へ丸める。
      const orderedQuantity = roundOrderQuantity(shortage.shortageQuantity, {
        orderLotQty: item?.orderLotQty ?? null,
        minOrderQty: item?.minOrderQty ?? null,
      });
      const reason =
        shortage.shortageType === "below_safety"
          ? "安全在庫割れの早期警告から自動生成"
          : shortage.reason;
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
        note: `${item?.itemName ?? "品目"} の${body.mode === "month_end" ? shortage.reason : reason}`,
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
      entityId: body.mode === "month_end" ? body.targetMonth! : `${body.dateFrom}_${body.dateTo}`,
      after: { mode: body.mode, candidates: rows },
    });

    return created({ mode: body.mode, rowCount: rows.length, candidates: rows });
  } catch (e) {
    return handleError(e);
  }
}

function collectWindowShortages(
  lines: Array<{
    itemType: "raw_material" | "packaging";
    itemId: string;
    date: string;
    shortageQuantity: number;
    shortageType: MaterialShortageType;
  }>,
): CandidateShortage[] {
  const shortages = new Map<string, CandidateShortage>();
  for (const line of lines) {
    if (!isCandidateShortageType(line.shortageType)) continue;
    const key = itemKey(line.itemType, line.itemId);
    const current = shortages.get(key);
    if (!current) {
      shortages.set(key, {
        itemType: line.itemType,
        itemId: line.itemId,
        shortageDate: line.date,
        shortageQuantity: line.shortageQuantity,
        shortageType: line.shortageType,
        reason: line.shortageType === "below_safety" ? "安全在庫割れの早期警告から自動生成" : "累積不足から自動生成",
      });
      continue;
    }
    current.shortageQuantity = Math.max(current.shortageQuantity, line.shortageQuantity);
    if (line.date < current.shortageDate) current.shortageDate = line.date;
    if (shortageSeverity(line.shortageType) > shortageSeverity(current.shortageType)) {
      current.shortageType = line.shortageType;
    }
  }
  return [...shortages.values()];
}

function collectMonthEndShortages(
  lines: Array<{
    itemType: "raw_material" | "packaging";
    itemId: string;
    monthEndDate: string;
    shortageDate: string | null;
    shortageQuantity: number;
    shortageType: MaterialShortageType;
    monthEndShortageQuantity: number;
    monthEndShortageType: MaterialShortageType;
  }>,
): CandidateShortage[] {
  const shortages: Array<CandidateShortage | null> = lines.map((line) => {
      if (line.shortageDate && isCandidateShortageType(line.shortageType)) {
        return {
          itemType: line.itemType,
          itemId: line.itemId,
          shortageDate: line.shortageDate,
          shortageQuantity: line.shortageQuantity,
          shortageType: line.shortageType,
          reason: "月内所要の不足から自動生成",
        };
      }
      if (isCandidateShortageType(line.monthEndShortageType) && line.monthEndShortageQuantity > 0) {
        return {
          itemType: line.itemType,
          itemId: line.itemId,
          shortageDate: line.monthEndDate,
          shortageQuantity: line.monthEndShortageQuantity,
          shortageType: line.monthEndShortageType,
          reason: "月末安全在庫補充から自動生成",
        };
      }
      return null;
    });
  return shortages.filter((line): line is CandidateShortage => line !== null);
}

function isCandidateShortageType(shortageType: MaterialShortageType) {
  return shortageType === "hard_shortage" || shortageType === "below_safety";
}

function shortageSeverity(shortageType: MaterialShortageType) {
  switch (shortageType) {
    case "hard_shortage":
      return 2;
    case "below_safety":
    case "unconfirmed_dependency":
      return 1;
    default:
      return 0;
  }
}

function orderProcessingBufferDays(item: MaterialForecastItem | undefined) {
  return item?.orderProcessingBufferDays ?? 0;
}
