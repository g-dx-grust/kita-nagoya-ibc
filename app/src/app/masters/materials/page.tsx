import Link from "next/link";
import { ClipboardCheck, FileUp, ListChecks, PackagePlus, Truck } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import CsvImport from "../csv-import";
import MasterForm, { type MasterField } from "../master-form";
import MaterialsMasterTable, { type MaterialRow } from "./materials-master-table";

export const dynamic = "force-dynamic";

function buildMaterialFields(
  supplierOptions: { value: string; label: string }[],
): MasterField[] {
  return [
    { key: "materialCode", label: "原料番号", required: true },
    { key: "name", label: "正式名称", required: true },
    { key: "unit", label: "単位", default: "kg" },
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
    { key: "shelfLifeManaged", label: "賞味期限管理", type: "checkbox", default: false },
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

export default async function MaterialsPage() {
  const [materials, suppliers] = await Promise.all([
    prisma.material.findMany({
      where: { active: true },
      orderBy: { materialCode: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
  const materialFields = buildMaterialFields(supplierOptions);
  const supplierConfiguredCount = materials.filter((material) => material.supplierId).length;
  const supplierMissingCount = materials.length - supplierConfiguredCount;
  const priceMissingCount = materials.filter((material) => material.standardUnitPrice <= 0).length;
  const leadTimeMissingCount = materials.filter((material) => material.leadTimeDays <= 0).length;
  const safetyStockConfiguredCount = materials.filter((material) => material.safetyStockQuantity > 0).length;
  const orderRuleConfiguredCount = materials.filter(
    (material) => material.orderLotQty != null || material.minOrderQty != null,
  ).length;
  const orderRuleMissingCount = materials.length - orderRuleConfiguredCount;
  const needsActionCount = materials.filter(
    (material) =>
      !material.supplierId ||
      material.standardUnitPrice <= 0 ||
      material.leadTimeDays <= 0 ||
      (material.orderLotQty == null && material.minOrderQty == null),
  ).length;
  const readyCount = materials.length - needsActionCount;
  const nextAction =
    supplierMissingCount > 0
      ? { label: "仕入先未設定を確認", href: "#materials-master-list" }
      : priceMissingCount > 0
        ? { label: "単価未設定を確認", href: "#materials-master-list" }
        : leadTimeMissingCount > 0
          ? { label: "リードタイムを確認", href: "#materials-master-list" }
          : orderRuleMissingCount > 0
            ? { label: "発注基準を確認", href: "#materials-master-list" }
            : { label: "発注候補へ進む", href: kitagoyaPath("/purchases") };
  const flowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "原料を追加",
      href: "#material-create",
      tone: "info",
      Icon: PackagePlus,
    },
    {
      label: "整備対象",
      count: needsActionCount,
      detail: `${readyCount}/${materials.length} 完了`,
      href: "#materials-master-list",
      tone: needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "仕入先",
      count: supplierMissingCount,
      detail: "未設定",
      href: supplierMissingCount > 0 ? "#materials-master-list" : kitagoyaPath("/masters/suppliers"),
      tone: supplierMissingCount > 0 ? "warn" : "success",
      Icon: Truck,
    },
    {
      label: "発注基準",
      count: orderRuleMissingCount,
      detail: `安全在庫 ${safetyStockConfiguredCount}件`,
      href: "#materials-master-list",
      tone: orderRuleMissingCount > 0 ? "warn" : "success",
      Icon: ListChecks,
    },
    {
      label: "CSV取込",
      count: "取込",
      detail: "原料マスター",
      href: "#material-import",
      tone: "info",
      Icon: FileUp,
    },
  ];

  const rows: MaterialRow[] = materials.map((r) => ({
    id: r.id,
    materialCode: r.materialCode,
    name: r.name,
    unit: r.unit,
    standardUnitPrice: r.standardUnitPrice,
    supplierId: r.supplierId,
    supplierName: (r.supplierId && supplierNameById.get(r.supplierId)) || null,
    leadTimeDays: r.leadTimeDays,
    safetyStockQuantity: r.safetyStockQuantity,
    orderLotQty: r.orderLotQty,
    minOrderQty: r.minOrderQty,
    shelfLifeManaged: r.shelfLifeManaged,
    validFrom: toDateInput(r.validFrom),
    validTo: toDateInput(r.validTo),
    note: r.note,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>原料マスター</h1>
        <div className="page-title-actions">
          <a className="button-link secondary-link" href="#material-create">
            <PackagePlus size={16} aria-hidden="true" />
            新規原料
          </a>
          <a className="button-link secondary-link" href="#material-import">
            <FileUp size={16} aria-hidden="true" />
            CSV取り込み
          </a>
          <Link className="button-link" href={kitagoyaPath("/masters/suppliers")}>
            <Truck size={16} aria-hidden="true" />
            仕入先
          </Link>
        </div>
      </div>
      <CollapsiblePanel
        title="確認・操作"
        summary={`${needsActionCount > 0 ? `整備が必要 ${needsActionCount}件` : "整備済み"} / 有効原料 ${materials.length}件`}
        className="top-flow-accordion"
      >
        <div className="master-page-command">
          <div className="master-page-command-title">
            <span className={`badge ${needsActionCount > 0 ? "warn" : "success"}`}>
              {needsActionCount > 0 ? `整備が必要 ${needsActionCount}` : "整備済み"}
            </span>
            <strong>原料マスター整備フロー</strong>
            <span className="subtext">有効原料 {materials.length}件</span>
            <a className="master-page-next" href={nextAction.href}>
              次: {nextAction.label}
            </a>
          </div>
          <div className="master-page-checks">
            <span className={`badge ${supplierMissingCount > 0 ? "warn" : "success"}`}>
              仕入先 {supplierMissingCount}件
            </span>
            <span className={`badge ${priceMissingCount > 0 ? "warn" : "success"}`}>
              単価 {priceMissingCount}件
            </span>
            <span className={`badge ${leadTimeMissingCount > 0 ? "warn" : "success"}`}>
              LT {leadTimeMissingCount}件
            </span>
            <span className={`badge ${orderRuleMissingCount > 0 ? "warn" : "success"}`}>
              発注基準 {orderRuleMissingCount}件
            </span>
          </div>
        </div>
        <div className="master-flow-grid" aria-label="原料マスター整備フロー">
          {flowCards.map(({ label, count, detail, href, tone, Icon }) => (
            <Link key={label} className={`master-flow-card ${tone}`} href={href}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
        <div className="materials-summary-grid">
          <div className="metric">
            <div className="metric-label">登録原料</div>
            <div className="metric-value">{materials.length}件</div>
            <div className="metric-note">有効な原料マスター</div>
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
            <div className="metric-value materials-summary-breakdown">
              <span>安全在庫 {safetyStockConfiguredCount}件</span>
              <span>ロット {orderRuleConfiguredCount}件</span>
            </div>
          </div>
        </div>
      </CollapsiblePanel>
      <section id="material-create" className="anchor-offset">
        <MasterForm
          endpoint={kitagoyaApiPath("/materials")}
          kind="原料"
          fields={materialFields}
        />
      </section>
      <section id="materials-master-list" className="anchor-offset">
        <MaterialsMasterTable rows={rows} materialFields={materialFields} />
      </section>

      <div id="material-import" className="panel after-table anchor-offset">
        <strong>CSV取り込み</strong>
        <CsvImport endpoint={kitagoyaApiPath("/import/materials")} templateType="materials" />
      </div>
    </>
  );
}
