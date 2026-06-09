import { audit } from "@/lib/audit";
import { created, handleError, HttpError } from "@/lib/http";
import {
  INVENTORY_LEDGER_STATUS,
  MANUAL_INVENTORY_SOURCE_TYPE,
  MOVEMENT_TYPE,
} from "@/lib/inventory-types";
import { resolveManualMovement } from "@/lib/inventory-manual-entry";
import { refreshCumulativeMaterialRequirements } from "@/lib/material-forecast";
import { prisma } from "@/lib/prisma";
import { InventoryLedgerStatusEnum, ManualInventoryEntrySchema } from "@/lib/schemas";
import { z } from "zod";

// 旧シンプル調整(製品在庫計画画面などからの呼び出し)。`kind` を持たない body はこちら。
const AdjustmentSchema = z.object({
  itemType: z.enum(["raw_material", "packaging", "product"]),
  itemId: z.string().min(1),
  quantity: z.number(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  movementType: z.nativeEnum(MOVEMENT_TYPE).default(MOVEMENT_TYPE.ADJUSTMENT),
  status: InventoryLedgerStatusEnum.default("CONFIRMED"),
  note: z.string().nullish(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) throw new HttpError(400, "invalid_json");
    // 在庫の手入力(管理者): `kind` を持つ body は区分付きの台帳登録として処理する。
    if (raw && typeof raw === "object" && "kind" in raw) {
      return await createManualEntry(raw);
    }
    return await createLegacyAdjustment(raw);
  } catch (e) {
    return handleError(e);
  }
}

// 区分(入庫/出庫/棚卸調整/期首)付きの手入力を、符号付き台帳行として登録する。
async function createManualEntry(raw: unknown) {
  const body = ManualInventoryEntrySchema.parse(raw);

  // 期首/初期在庫は「目標在庫」入力なので、指定日時点の確定在庫との差分を計上する。
  let currentConfirmed = 0;
  if (body.kind === "opening") {
    const agg = await prisma.stockMovement.aggregate({
      _sum: { quantity: true },
      where: {
        itemType: body.itemType,
        itemId: body.itemId,
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(body.effectiveDate) },
      },
    });
    currentConfirmed = agg._sum.quantity ?? 0;
  }

  const resolved = resolveManualMovement({
    kind: body.kind,
    quantity: body.quantity,
    direction: body.direction,
    currentConfirmed,
  });

  // 台帳行と監査ログを同一トランザクションで確定する(片方だけ残らないように)。
  const row = await prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({
      data: {
        itemType: body.itemType,
        itemId: body.itemId,
        quantity: resolved.quantity,
        movementType: resolved.movementType,
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        sourceType: MANUAL_INVENTORY_SOURCE_TYPE,
        note: body.note ?? null,
        effectiveDate: new Date(body.effectiveDate),
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        shippingDeadline: body.shippingDeadline ? new Date(body.shippingDeadline) : null,
      },
    });
    await audit(
      { action: `manual_${body.kind}`, entityType: "StockMovement", entityId: movement.id, after: movement },
      tx,
    );
    return movement;
  });

  await refreshMaterialForecastIfNeeded(body.itemType, body.effectiveDate);
  return created(row);
}

async function createLegacyAdjustment(raw: unknown) {
  const body = AdjustmentSchema.parse(raw);
  const movementType = body.movementType ?? MOVEMENT_TYPE.ADJUSTMENT;
  const status = body.status ?? "CONFIRMED";
  const row = await prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({
      data: {
        itemType: body.itemType,
        itemId: body.itemId,
        quantity: body.quantity,
        movementType,
        status,
        note: body.note ?? null,
        effectiveDate: new Date(body.effectiveDate),
      },
    });
    await audit(
      { action: movementType, entityType: "StockMovement", entityId: movement.id, after: movement },
      tx,
    );
    return movement;
  });
  await refreshMaterialForecastIfNeeded(body.itemType, body.effectiveDate);
  return created(row);
}

// 原料/資材の在庫が動いたら、以降90日の累積所要量(発注候補の基礎)を引き直す。
async function refreshMaterialForecastIfNeeded(itemType: string, effectiveDate: string) {
  if (itemType !== "raw_material" && itemType !== "packaging") return;
  const dateFrom = new Date(`${effectiveDate}T00:00:00.000Z`);
  const horizonEnd = new Date(`${effectiveDate}T00:00:00.000Z`);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 90);
  await refreshCumulativeMaterialRequirements({ dateFrom, dateTo: horizonEnd });
}
