import { HelpTooltip } from "@/components/ui/help-tooltip";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath } from "@/lib/paths";
import MasterForm, { type MasterField } from "../master-form";
import SuppliersMasterTable from "./suppliers-master-table";

export const dynamic = "force-dynamic";

const supplierFields: MasterField[] = [
  { key: "name", label: "正式名称", required: true },
  { key: "contact", label: "連絡先", nullable: true },
  { key: "orderingUnit", label: "発注単位", nullable: true },
  { key: "closingInfo", label: "締め情報", nullable: true },
  { key: "validFrom", label: "有効開始", type: "date", nullable: true },
  { key: "validTo", label: "有効終了", type: "date", nullable: true },
];

function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export default async function SuppliersPage() {
  const [rows, materialGroups, packagingGroups] = await Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.groupBy({
      by: ["supplierId"],
      where: { active: true, supplierId: { not: null } },
      _count: { _all: true },
    }),
    prisma.packagingMaterial.groupBy({
      by: ["supplierId"],
      where: { active: true, supplierId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const materialCountBySupplier = new Map(
    materialGroups.map((group) => [group.supplierId ?? "", group._count._all]),
  );
  const packagingCountBySupplier = new Map(
    packagingGroups.map((group) => [group.supplierId ?? "", group._count._all]),
  );
  const linkedSupplierCount = rows.filter(
    (supplier) =>
      (materialCountBySupplier.get(supplier.id) ?? 0) + (packagingCountBySupplier.get(supplier.id) ?? 0) > 0,
  ).length;
  const contactConfiguredCount = rows.filter((supplier) => hasValue(supplier.contact)).length;
  const orderingUnitConfiguredCount = rows.filter((supplier) => hasValue(supplier.orderingUnit)).length;
  const closingInfoConfiguredCount = rows.filter((supplier) => hasValue(supplier.closingInfo)).length;
  const validityConfiguredCount = rows.filter(
    (supplier) => supplier.validFrom != null || supplier.validTo != null,
  ).length;
  const linkedMaterialCount = materialGroups.reduce((sum, group) => sum + group._count._all, 0);
  const linkedPackagingCount = packagingGroups.reduce((sum, group) => sum + group._count._all, 0);

  const tableRows = rows.map((r) => ({
    id: r.id,
    name: r.name,
    contact: r.contact,
    orderingUnit: r.orderingUnit,
    closingInfo: r.closingInfo,
    validFrom: toDateInput(r.validFrom),
    validTo: toDateInput(r.validTo),
    materialCount: materialCountBySupplier.get(r.id) ?? 0,
    packagingCount: packagingCountBySupplier.get(r.id) ?? 0,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>仕入先マスター</h1>
        <div className="page-title-actions">
          <HelpTooltip text="発注書に表示される仕入先を管理します。原料・資材マスターから仕入先を選んで紐付けます。" />
        </div>
      </div>
      <div className="supplier-summary-grid">
        <div className="metric">
          <div className="metric-label">登録仕入先</div>
          <div className="metric-value">{rows.length}件</div>
          <div className="metric-note">有効な仕入先マスター</div>
        </div>
        <div className="metric">
          <div className="metric-label">マスター紐付け</div>
          <div className="metric-value">{linkedSupplierCount}件</div>
          <div className="metric-note">
            原料 {linkedMaterialCount}件 / 資材 {linkedPackagingCount}件
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">連絡先</div>
          <div className={`metric-value ${contactConfiguredCount === 0 ? "warn-value" : ""}`}>
            {contactConfiguredCount}件
          </div>
          <div className="metric-note">発注書・確認連絡に利用</div>
        </div>
        <div className="metric">
          <div className="metric-label">発注条件</div>
          <div className="metric-value supplier-summary-breakdown">
            <span>発注単位 {orderingUnitConfiguredCount}件</span>
            <span>締め {closingInfoConfiguredCount}件</span>
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">有効期間</div>
          <div className="metric-value">{validityConfiguredCount}件</div>
          <div className="metric-note">期間指定あり</div>
        </div>
      </div>
      <MasterForm
        endpoint={kitagoyaApiPath("/suppliers")}
        kind="仕入先"
        fields={supplierFields}
      />
      <SuppliersMasterTable rows={tableRows} fields={supplierFields} />
    </>
  );
}

function hasValue(value: string | null): boolean {
  return Boolean(value && value.trim());
}
