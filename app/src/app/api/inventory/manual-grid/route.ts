import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";
import {
  INVENTORY_LEDGER_STATUS,
  MANUAL_INVENTORY_SOURCE_TYPE,
  MOVEMENT_TYPE,
} from "@/lib/inventory-types";
import { openingEffectiveDate } from "@/lib/inventory-editable-grid";
import { refreshCumulativeMaterialRequirements } from "@/lib/material-forecast";
import { prisma } from "@/lib/prisma";
import { ManualGridSaveSchema } from "@/lib/schemas";

// 在庫表のExcelライク・セル編集をまとめて確定する。
// 手入力分(grid)を決定的な sourceId で upsert/削除し、台帳行と監査ログを同一トランザクションで確定する。
export async function PUT(req: Request) {
  try {
    const raw = await req.json().catch(() => undefined);
    const body = ManualGridSaveSchema.parse(raw);
    const itemType = body.itemType;

    const touchedDates: string[] = [];

    await prisma.$transaction(async (tx) => {
      // 期首(前月繰越)の手入力。対象月の前日付で計上し、繰越に算入させる。
      const openingDate = openingEffectiveDate(body.month);
      for (const o of body.openings) {
        const sourceId = `grid:${itemType}:${o.itemId}:opening:${body.month}`;
        if (o.value !== 0) {
          await upsertGrid(tx, {
            itemType,
            itemId: o.itemId,
            movementType: MOVEMENT_TYPE.OPENING,
            sourceId,
            quantity: o.value,
            effectiveDate: openingDate,
            expiryDate: null,
            shippingDeadline: null,
          });
        } else {
          await deleteGrid(tx, { sourceId, movementType: MOVEMENT_TYPE.OPENING });
        }
        touchedDates.push(openingDate);
      }

      // 日次セル: 入荷(＋)と使用量(−)を別movementとして upsert。期限は入荷movementに載せる。
      for (const c of body.cells) {
        const inbound = c.inbound ?? 0;
        const usage = c.usage ?? 0;
        const expiry = c.expiry ?? null;
        const shipping = c.shipping ?? null;

        const inboundSourceId = `grid:${itemType}:${c.itemId}:${c.date}:inbound`;
        if (inbound !== 0 || expiry || shipping) {
          await upsertGrid(tx, {
            itemType,
            itemId: c.itemId,
            movementType: MOVEMENT_TYPE.INBOUND,
            sourceId: inboundSourceId,
            quantity: inbound,
            effectiveDate: c.date,
            expiryDate: expiry ? new Date(expiry) : null,
            shippingDeadline: shipping ? new Date(shipping) : null,
          });
        } else {
          await deleteGrid(tx, { sourceId: inboundSourceId, movementType: MOVEMENT_TYPE.INBOUND });
        }

        const usageSourceId = `grid:${itemType}:${c.itemId}:${c.date}:usage`;
        if (usage !== 0) {
          await upsertGrid(tx, {
            itemType,
            itemId: c.itemId,
            movementType: MOVEMENT_TYPE.SHIPMENT_OUT,
            sourceId: usageSourceId,
            quantity: -Math.abs(usage),
            effectiveDate: c.date,
            expiryDate: null,
            shippingDeadline: null,
          });
        } else {
          await deleteGrid(tx, { sourceId: usageSourceId, movementType: MOVEMENT_TYPE.SHIPMENT_OUT });
        }
        touchedDates.push(c.date);
      }

      await audit(
        {
          action: "manual_grid_save",
          entityType: "StockMovement",
          after: {
            itemType,
            month: body.month,
            openings: body.openings.length,
            cells: body.cells.length,
          },
        },
        tx,
      );
    });

    // 原料/資材は在庫が動いたので、触れた範囲以降の累積所要量(発注候補の基礎)を引き直す。
    if ((itemType === "raw_material" || itemType === "packaging") && touchedDates.length > 0) {
      const sorted = [...touchedDates].sort();
      const dateFrom = new Date(`${sorted[0]}T00:00:00.000Z`);
      const horizonEnd = new Date(`${sorted[sorted.length - 1]}T00:00:00.000Z`);
      horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 90);
      await refreshCumulativeMaterialRequirements({ dateFrom, dateTo: horizonEnd });
    }

    return ok({ ok: true, openings: body.openings.length, cells: body.cells.length });
  } catch (e) {
    return handleError(e);
  }
}

async function upsertGrid(
  tx: Prisma.TransactionClient,
  args: {
    itemType: string;
    itemId: string;
    movementType: string;
    sourceId: string;
    quantity: number;
    effectiveDate: string;
    expiryDate: Date | null;
    shippingDeadline: Date | null;
  },
) {
  await tx.stockMovement.upsert({
    where: {
      stock_movement_source_unique: {
        sourceType: MANUAL_INVENTORY_SOURCE_TYPE,
        sourceId: args.sourceId,
        movementType: args.movementType,
      },
    },
    create: {
      itemType: args.itemType,
      itemId: args.itemId,
      movementType: args.movementType,
      quantity: args.quantity,
      status: INVENTORY_LEDGER_STATUS.CONFIRMED,
      sourceType: MANUAL_INVENTORY_SOURCE_TYPE,
      sourceId: args.sourceId,
      effectiveDate: new Date(args.effectiveDate),
      expiryDate: args.expiryDate,
      shippingDeadline: args.shippingDeadline,
    },
    update: {
      quantity: args.quantity,
      effectiveDate: new Date(args.effectiveDate),
      expiryDate: args.expiryDate,
      shippingDeadline: args.shippingDeadline,
    },
  });
}

async function deleteGrid(
  tx: Prisma.TransactionClient,
  args: { sourceId: string; movementType: string },
) {
  await tx.stockMovement.deleteMany({
    where: {
      sourceType: MANUAL_INVENTORY_SOURCE_TYPE,
      sourceId: args.sourceId,
      movementType: args.movementType,
    },
  });
}
