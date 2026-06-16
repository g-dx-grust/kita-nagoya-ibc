import CollapsiblePanel from "@/components/ui/collapsible-panel";
import GeneratePurchaseCandidatesButton from "./generate-button";
import PurchaseOrderTable, {
  ShortageForecastTable,
  type PurchaseOrderTableRow,
  type ShortageForecastRow,
} from "./purchase-order-table";
import { loadMaterialForecast } from "@/lib/material-forecast";
import { prisma } from "@/lib/prisma";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { formatCases } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = sp.dateFrom ?? today;
  const dateTo = sp.dateTo ?? addDays(new Date(dateFrom), 30);
  const [purchaseOrders, materials, packaging, suppliers, forecast] = await Promise.all([
    prisma.purchaseOrder.findMany({
      orderBy: [{ status: "asc" }, { shortageDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.material.findMany({ include: { supplier: true } }),
    prisma.packagingMaterial.findMany({ include: { supplier: true } }),
    prisma.supplier.findMany(),
    loadMaterialForecast({ dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }),
  ]);

  const itemMap = new Map<
    string,
    { code: string; name: string; unit: string; supplier: string; casePackQty: number | null }
  >();
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  for (const material of materials) {
    itemMap.set(`raw_material:${material.id}`, {
      code: material.materialCode,
      name: material.name,
      unit: material.unit,
      supplier: material.supplier?.name ?? "—",
      casePackQty: null, // 原料(kg)はケース換算しない
    });
  }
  for (const material of packaging) {
    itemMap.set(`packaging:${material.id}`, {
      code: material.materialCode,
      name: material.name,
      unit: material.unit,
      supplier: material.supplier?.name ?? "—",
      casePackQty: material.casePackQty ?? null,
    });
  }
  const caseOfLine = (line: { itemType: string; itemId: string }) =>
    itemMap.get(`${line.itemType}:${line.itemId}`)?.casePackQty ?? null;
  const forecastShortages = forecast.lines.filter((line) => line.shortageType !== "none");
  const shortageForecastRows: ShortageForecastRow[] = forecastShortages.map((line) => {
    const cp = caseOfLine(line);
    const fmt = (v: number) => formatCases(v, { casePackQty: cp, baseUnit: line.unit });
    return {
      requirementId: line.requirementId,
      date: line.date,
      itemType: line.itemType,
      itemCode: itemMap.get(`${line.itemType}:${line.itemId}`)?.code ?? "",
      itemName: line.itemName,
      shortageType: line.shortageType,
      plannedQuantityLabel: fmt(line.plannedQuantity),
      onHandBeforeLabel: fmt(line.onHandBefore),
      shortageQuantityLabel: fmt(line.shortageQuantity),
    };
  });
  // 緊急度は時間相対なので保存値(po.urgency)は陳腐化する。表示時に「今日」を基準に再計算する。
  const now = new Date();
  const purchaseOrderRows: PurchaseOrderTableRow[] = purchaseOrders.map((po) => {
    const item = itemMap.get(`${po.itemType}:${po.itemId}`);
    return {
      id: po.id,
      status: po.status,
      urgency: computeUrgency({ requiredOrderDate: po.recommendedOrderDate, asOfDate: now }),
      itemType: po.itemType,
      itemCode: item?.code ?? "—",
      itemName: item?.name ?? po.itemId,
      supplierName: po.supplierId ? (supplierMap.get(po.supplierId) ?? "—") : (item?.supplier ?? "—"),
      unit: item?.unit ?? "",
      casePackQty: item?.casePackQty ?? null,
      orderedQuantity: po.orderedQuantity,
      confirmedQuantity: po.confirmedQuantity,
      receivedQuantity: po.receivedQuantity,
      recommendedOrderDate: po.recommendedOrderDate?.toISOString().slice(0, 10) ?? "",
      shortageDate: po.shortageDate?.toISOString().slice(0, 10) ?? "",
      expectedArrivalDate: po.expectedArrivalDate?.toISOString().slice(0, 10) ?? "",
      receivedDate: po.receivedDate?.toISOString().slice(0, 10) ?? "",
      note: po.note ?? "",
    };
  });

  return (
    <>
      <div className="page-title-row">
        <h1>発注候補</h1>
        <div className="page-title-actions">
          <GeneratePurchaseCandidatesButton dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      </div>
      <CollapsiblePanel title="表示・再計算条件" summary={`${dateFrom} 〜 ${dateTo}`}>
        <form className="toolbar compact-controls" method="GET">
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
      </CollapsiblePanel>

      <h2>累積不足見込み</h2>
      {forecastShortages.length === 0 ? (
        <div className="empty-state">対象期間で原料/資材不足はありません。</div>
      ) : (
        <ShortageForecastTable rows={shortageForecastRows} />
      )}

      <h2>発注候補・発注状況</h2>
      <PurchaseOrderTable rows={purchaseOrderRows} />
    </>
  );
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
