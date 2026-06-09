import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billingTargetOnly: z.boolean().default(true),
});

// Phase 5: build a CSV from 日報蓄積(B=ProductionDailyReportEntry) in [dateFrom, dateTo].
// 請求金額 = 生産数量 × 保存時の請求単価スナップショット(entry.sales)。A系統(DailyReport)は引退。
export async function POST(req: Request) {
  try {
    const body = await parseJson(req, Schema);
    const from = new Date(body.dateFrom);
    const to = new Date(body.dateTo);

    const entries = await prisma.productionDailyReportEntry.findMany({
      where: { active: true, approvalStatus: "approved", productId: { not: null }, reportDate: { gte: from, lte: to } },
      include: { product: true },
      orderBy: [{ reportDate: "asc" }],
    });

    // 請求先表示用の externalCode は商品別の請求単価マスタ(最新)から引く(無ければ正式名称)。
    const productIds = Array.from(
      new Set(entries.map((e) => e.productId).filter((v): v is string => !!v)),
    );
    const prices = productIds.length
      ? await prisma.billingPrice.findMany({
          where: { productId: { in: productIds }, billingTarget: true },
          orderBy: { effectiveFrom: "desc" },
        })
      : [];
    const externalCodeByProduct = new Map<string, string | null>();
    for (const pr of prices) {
      if (!externalCodeByProduct.has(pr.productId)) externalCodeByProduct.set(pr.productId, pr.externalCode ?? null);
    }

    const header = ["生産日", "商品コード", "商品名", "実数量", "単位", "単価", "金額", "請求先"];
    const lines: (string | number)[][] = [];
    let totalAmount = 0;

    for (const e of entries) {
      if (!e.product) continue;
      if (body.billingTargetOnly && !e.product.billingEnabled) continue;
      if (e.unitPriceSnapshot <= 0) continue;
      const amount = e.sales; // = 生産数量 × unitPriceSnapshot (round2 済み)
      totalAmount += amount;
      lines.push([
        e.reportDate.toISOString().slice(0, 10),
        e.product.productCode,
        externalCodeByProduct.get(e.productId!) ?? e.product.officialName,
        e.productionQty,
        e.product.unit,
        e.unitPriceSnapshot,
        amount,
        "",
      ]);
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    const csv = "﻿" + toCsv(header, lines);
    const fileName = `invoice_${body.dateFrom}_${body.dateTo}.csv`;
    const record = await prisma.invoiceExport.create({
      data: {
        periodStart: from,
        periodEnd: to,
        fileName,
        rowCount: lines.length,
        totalAmount,
      },
    });
    await audit({
      action: "export_invoice",
      entityType: "InvoiceExport",
      entityId: record.id,
      after: record,
    });

    return ok({ id: record.id, fileName, rowCount: lines.length, totalAmount, csv });
  } catch (e) {
    return handleError(e);
  }
}

export async function GET() {
  const rows = await prisma.invoiceExport.findMany({ orderBy: { exportedAt: "desc" } });
  return ok(rows);
}
