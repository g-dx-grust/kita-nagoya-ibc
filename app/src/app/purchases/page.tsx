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
  const hardShortageCount = forecastShortages.filter((line) => line.shortageType === "hard_shortage").length;
  const safetyShortageCount = forecastShortages.filter((line) => line.shortageType === "below_safety").length;
  const pendingOrderCount = purchaseOrderRows.filter((row) => row.status === "candidate" || row.status === "draft").length;
  const waitingArrivalCount = purchaseOrderRows.filter(
    (row) => row.status === "ordered_unconfirmed" || row.status === "confirmed",
  ).length;
  const criticalOrderCount = purchaseOrderRows.filter((row) => row.urgency === "CRITICAL").length;

  return (
    <>
      <div className="page-title-row">
        <h1>発注候補</h1>
      </div>
      <div className="purchase-command">
        <div className="purchase-command-title">
          <span className={`badge ${hardShortageCount > 0 || criticalOrderCount > 0 ? "warn" : "success"}`}>
            {hardShortageCount > 0 || criticalOrderCount > 0 ? "確認が必要" : "不足なし"}
          </span>
          <strong>発注判断</strong>
          <span className="subtext">
            {dateFrom} 〜 {dateTo}
          </span>
        </div>
        <div className="purchase-command-checks">
          <span className={`badge ${hardShortageCount > 0 ? "danger" : "success"}`}>実不足 {hardShortageCount}</span>
          <span className={`badge ${safetyShortageCount > 0 ? "warn" : "success"}`}>安全在庫割れ {safetyShortageCount}</span>
          <span className={`badge ${pendingOrderCount > 0 ? "warn" : "success"}`}>未発注 {pendingOrderCount}</span>
          <span className={`badge ${criticalOrderCount > 0 ? "danger" : "success"}`}>緊急 {criticalOrderCount}</span>
          <span className="badge info">入荷待ち {waitingArrivalCount}</span>
        </div>
        <div className="purchase-command-actions">
          <GeneratePurchaseCandidatesButton dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      </div>
      <div className="purchase-summary-grid">
        <div className="metric">
          <div className="metric-label">確認期間</div>
          <div className="metric-value purchase-summary-period">
            {dateFrom} 〜 {dateTo}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">不足見込み</div>
          <div className={`metric-value${hardShortageCount > 0 ? " danger-value" : ""}`}>
            {forecastShortages.length} 件
          </div>
          <div className="metric-note">実不足 {hardShortageCount} / 安全在庫割れ {safetyShortageCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">未発注</div>
          <div className={`metric-value${pendingOrderCount > 0 ? " warn-value" : ""}`}>{pendingOrderCount} 件</div>
          <div className="metric-note">候補・下書き</div>
        </div>
        <div className="metric">
          <div className="metric-label">入荷待ち</div>
          <div className="metric-value">{waitingArrivalCount} 件</div>
          <div className="metric-note">未確定・確定発注</div>
        </div>
        <div className="metric">
          <div className="metric-label">緊急</div>
          <div className={`metric-value${criticalOrderCount > 0 ? " danger-value" : ""}`}>{criticalOrderCount} 件</div>
          <div className="metric-note">推奨発注日ベース</div>
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
      <PurchaseOrderTable rows={purchaseOrderRows} today={today} />
    </>
  );
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
