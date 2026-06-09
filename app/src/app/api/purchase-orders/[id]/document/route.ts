import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  renderPurchaseOrderPdf,
  renderPurchaseOrderXlsx,
  type PurchaseOrderDocumentFormat,
  type PurchaseOrderDocumentInput,
} from "@/lib/purchase-order-document";

// pdf-lib (フォント埋め込み/fs) は Node ランタイムが必須。
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "xlsx";
    if (format !== "xlsx" && format !== "pdf") return badRequest("invalid_format");

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) return notFound();
    if (purchaseOrder.status === "candidate" || purchaseOrder.status === "cancelled") {
      return badRequest("document_not_available_for_status", { status: purchaseOrder.status });
    }

    const item = await loadPurchaseOrderItem(purchaseOrder.itemType, purchaseOrder.itemId);
    if (!item) return notFound("item_not_found");
    if (!item.active) return badRequest("document_not_available_for_inactive_item");

    const supplier =
      purchaseOrder.supplierId != null
        ? await prisma.supplier.findUnique({ where: { id: purchaseOrder.supplierId } })
        : item.supplier;
    const generatedAt = new Date();
    const input: PurchaseOrderDocumentInput = {
      purchaseOrder: {
        id: purchaseOrder.id,
        code: purchaseOrderCode(purchaseOrder.id),
        status: purchaseOrder.status,
        urgency: purchaseOrder.urgency,
        orderedQuantity: purchaseOrder.orderedQuantity,
        receivedQuantity: purchaseOrder.receivedQuantity,
        unitPrice: item.standardUnitPrice,
        totalAmount: roundCurrency(purchaseOrder.orderedQuantity * item.standardUnitPrice),
        shortageDate: purchaseOrder.shortageDate,
        recommendedOrderDate: purchaseOrder.recommendedOrderDate,
        note: purchaseOrder.note,
        createdAt: purchaseOrder.createdAt,
      },
      item: {
        code: item.materialCode,
        name: item.name,
        unit: item.unit,
        // ケース入数は資材(PackagingMaterial)のみ持つ。原料(Material)は null。
        casePackQty:
          purchaseOrder.itemType === "packaging"
            ? ((item as { casePackQty?: number | null }).casePackQty ?? null)
            : null,
      },
      supplier: {
        name: supplier?.name ?? "未設定",
        contact: supplier?.contact ?? null,
        orderingUnit: supplier?.orderingUnit ?? null,
      },
      generatedAt,
      isProvisional: purchaseOrder.status === "draft",
    };

    const bytes =
      format === "xlsx"
        ? renderPurchaseOrderXlsx(input)
        : Buffer.from(await renderPurchaseOrderPdf(input));
    const fileName = `purchase-order-${purchaseOrder.id.slice(0, 8)}.${format}`;

    await audit({
      action: "generate_purchase_order_document",
      entityType: "PurchaseOrder",
      entityId: purchaseOrder.id,
      after: {
        format,
        isProvisional: input.isProvisional,
        fileName,
      },
    });

    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType(format),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

async function loadPurchaseOrderItem(itemType: string, itemId: string) {
  if (itemType === "raw_material") {
    return prisma.material.findUnique({ where: { id: itemId }, include: { supplier: true } });
  }
  if (itemType === "packaging") {
    return prisma.packagingMaterial.findUnique({ where: { id: itemId }, include: { supplier: true } });
  }
  return null;
}

function contentType(format: PurchaseOrderDocumentFormat) {
  return format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/pdf";
}

function purchaseOrderCode(id: string) {
  return `PO-${id.slice(0, 8).toUpperCase()}`;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
