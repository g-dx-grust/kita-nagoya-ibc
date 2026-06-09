import ProductPlanningClient from "./product-planning-client";
import { loadProductPlanningSuggestions } from "@/lib/product-planning-service";
import {
  getHistoricalForecastReferenceMonths,
  yearMonthFromDateInput,
} from "@/lib/monthly-production-forecast";
import { INVENTORY_LEDGER_STATUS } from "@/lib/inventory-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductPlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = sp.dateFrom ?? today;
  const dateTo = sp.dateTo ?? addDays(new Date(dateFrom), 30);
  const targetMonth = yearMonthFromDateInput(dateFrom);
  const referenceMonths = Object.values(getHistoricalForecastReferenceMonths(targetMonth));

  const [products, stockRows, demands, suggestions, monthlyActuals] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { productCode: "asc" } }),
    prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        itemType: "product",
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        effectiveDate: { lte: new Date(dateFrom) },
      },
      _sum: { quantity: true },
    }),
    prisma.productDemand.findMany({
      where: { status: "open", dueDate: { lte: new Date(dateTo) }, product: { active: true } },
      include: { product: true },
      orderBy: [{ dueDate: "asc" }, { product: { productCode: "asc" } }],
    }),
    loadProductPlanningSuggestions({ dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }),
    prisma.productMonthlyActual.findMany({
      where: { yearMonth: { in: referenceMonths }, product: { active: true } },
      include: { product: true },
      orderBy: [{ yearMonth: "desc" }, { product: { productCode: "asc" } }],
    }),
  ]);

  const stockByProductId: Record<string, number> = {};
  for (const row of stockRows) stockByProductId[row.itemId] = row._sum.quantity ?? 0;

  return (
    <>
      <h1>製品在庫・自動生産提案</h1>
      <form className="panel toolbar" method="GET">
        <label>
          <span>基準日</span>
          <input name="dateFrom" type="date" defaultValue={dateFrom} />
        </label>
        <label>
          <span>不足確認期限</span>
          <input name="dateTo" type="date" defaultValue={dateTo} />
        </label>
        <button type="submit" className="secondary">
          再計算
        </button>
      </form>
      <ProductPlanningClient
        products={products.map((product) => ({
          id: product.id,
          productCode: product.productCode,
          officialName: product.officialName,
          displayName: product.displayName,
          specification: product.specification,
          brandName: product.brandName,
          unit: product.unit,
          casePackQty: product.casePackQty,
        }))}
        demands={demands.map((demand) => ({
          id: demand.id,
          dueDate: demand.dueDate.toISOString().slice(0, 10),
          demandType: demand.demandType,
          quantity: demand.quantity,
          status: demand.status,
          customerName: demand.customerName,
          externalRef: demand.externalRef,
          note: demand.note,
          product: {
            id: demand.product.id,
            productCode: demand.product.productCode,
            officialName: demand.product.officialName,
            specification: demand.product.specification,
            brandName: demand.product.brandName,
            unit: demand.product.unit,
          },
        }))}
        suggestions={suggestions}
        monthlyActuals={monthlyActuals.map((actual) => ({
          id: actual.id,
          yearMonth: actual.yearMonth,
          actualQuantity: actual.actualQuantity,
          sourceType: actual.sourceType,
          note: actual.note,
          product: {
            id: actual.product.id,
            productCode: actual.product.productCode,
            officialName: actual.product.officialName,
            specification: actual.product.specification,
            brandName: actual.product.brandName,
            unit: actual.product.unit,
          },
        }))}
        stockByProductId={stockByProductId}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        initialTargetMonth={targetMonth}
      />
    </>
  );
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
