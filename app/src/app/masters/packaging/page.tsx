import { prisma } from "@/lib/prisma";
import { packagingKindLabel } from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";
import MasterForm, { type MasterField } from "../master-form";
import PackagingMasterTable, { type PackagingRow } from "./packaging-master-table";

export const dynamic = "force-dynamic";

function buildPackagingFields(
  supplierOptions: { value: string; label: string }[],
): MasterField[] {
  return [
    { key: "materialCode", label: "資材番号", required: true },
    { key: "name", label: "正式名称", required: true },
    {
      key: "kind",
      label: "種類",
      type: "select",
      nullable: true,
      options: [
        { value: "", label: "未設定" },
        { value: "bag", label: "袋" },
        { value: "desiccant", label: "乾燥剤" },
        { value: "carton", label: "段ボール" },
        { value: "other", label: "その他" },
      ],
    },
    { key: "unit", label: "単位", default: "枚" },
    { key: "casePackQty", label: "ケース入数", type: "number", nullable: true, default: "" },
    { key: "standardUnitPrice", label: "標準単価", type: "number", default: 0 },
    {
      key: "supplierId",
      label: "仕入先",
      type: "select",
      nullable: true,
      searchable: true,
      searchPlaceholder: "仕入先名で検索",
      options: [{ value: "", label: "未設定" }, ...supplierOptions],
    },
    { key: "leadTimeDays", label: "リードタイム(日)", type: "number", default: 0 },
    { key: "safetyStockQuantity", label: "安全在庫", type: "number", default: 0 },
    { key: "orderLotQty", label: "発注ロット", type: "number", nullable: true },
    { key: "minOrderQty", label: "最小発注数", type: "number", nullable: true },
    { key: "validFrom", label: "有効開始", type: "date", nullable: true },
    { key: "validTo", label: "有効終了", type: "date", nullable: true },
    { key: "note", label: "備考", type: "textarea", nullable: true },
  ];
}

function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export default async function PackagingPage() {
  const [packaging, suppliers] = await Promise.all([
    prisma.packagingMaterial.findMany({
      where: { active: true },
      orderBy: { materialCode: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
  const packagingFields = buildPackagingFields(supplierOptions);
  const supplierConfiguredCount = packaging.filter((material) => material.supplierId).length;
  const supplierMissingCount = packaging.length - supplierConfiguredCount;
  const priceMissingCount = packaging.filter((material) => material.standardUnitPrice <= 0).length;
  const casePackConfiguredCount = packaging.filter((material) => material.casePackQty != null).length;
  const orderRuleConfiguredCount = packaging.filter(
    (material) => material.orderLotQty != null || material.minOrderQty != null,
  ).length;
  const kindSummary = ["bag", "carton", "desiccant", "other", ""].map((kind) => ({
    label: packagingKindLabel(kind),
    count: packaging.filter((material) => (material.kind ?? "") === kind).length,
  }));

  const rows: PackagingRow[] = packaging.map((r) => ({
    id: r.id,
    materialCode: r.materialCode,
    name: r.name,
    kind: r.kind,
    unit: r.unit,
    casePackQty: r.casePackQty,
    standardUnitPrice: r.standardUnitPrice,
    supplierId: r.supplierId,
    supplierName: (r.supplierId && supplierNameById.get(r.supplierId)) || null,
    leadTimeDays: r.leadTimeDays,
    safetyStockQuantity: r.safetyStockQuantity,
    orderLotQty: r.orderLotQty,
    minOrderQty: r.minOrderQty,
    validFrom: toDateInput(r.validFrom),
    validTo: toDateInput(r.validTo),
    note: r.note,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>資材マスター</h1>
      </div>
      <div className="packaging-summary-grid">
        <div className="metric">
          <div className="metric-label">登録資材</div>
          <div className="metric-value">{packaging.length}件</div>
          <div className="metric-note">有効な資材マスター</div>
        </div>
        <div className="metric">
          <div className="metric-label">種類</div>
          <div className="metric-value packaging-summary-breakdown">
            {kindSummary.map((item) => (
              <span key={item.label}>
                {item.label} {item.count}件
              </span>
            ))}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">仕入先設定</div>
          <div className="metric-value">{supplierConfiguredCount}件</div>
          <div className={`metric-note ${supplierMissingCount > 0 ? "warn-note" : ""}`}>
            未設定 {supplierMissingCount}件
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">単価未設定</div>
          <div className={`metric-value ${priceMissingCount > 0 ? "warn-value" : ""}`}>
            {priceMissingCount}件
          </div>
          <div className="metric-note">原価計算に影響</div>
        </div>
        <div className="metric">
          <div className="metric-label">発注基準</div>
          <div className="metric-value packaging-summary-breakdown">
            <span>ケース入数 {casePackConfiguredCount}件</span>
            <span>ロット {orderRuleConfiguredCount}件</span>
          </div>
        </div>
      </div>
      <MasterForm
        endpoint={kitagoyaApiPath("/packaging-materials")}
        kind="資材"
        fields={packagingFields}
      />
      <PackagingMasterTable rows={rows} packagingFields={packagingFields} />
    </>
  );
}
