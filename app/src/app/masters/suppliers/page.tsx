import Link from "next/link";
import { ClipboardCheck, Database, PackageCheck, Truck } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
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
  const unusedSupplierCount = rows.length - linkedSupplierCount;
  const contactMissingCount = rows.length - contactConfiguredCount;
  const orderingUnitMissingCount = rows.length - orderingUnitConfiguredCount;
  const closingInfoMissingCount = rows.length - closingInfoConfiguredCount;
  const needsActionCount = rows.filter(
    (supplier) =>
      (materialCountBySupplier.get(supplier.id) ?? 0) + (packagingCountBySupplier.get(supplier.id) ?? 0) === 0 ||
      !hasValue(supplier.contact) ||
      !hasValue(supplier.orderingUnit) ||
      !hasValue(supplier.closingInfo),
  ).length;
  const readyCount = rows.length - needsActionCount;
  const nextAction =
    unusedSupplierCount > 0
      ? { label: "未使用仕入先を確認", href: "#supplier-master-list" }
      : contactMissingCount > 0
        ? { label: "連絡先を確認", href: "#supplier-master-list" }
        : orderingUnitMissingCount > 0
          ? { label: "発注単位を確認", href: "#supplier-master-list" }
          : closingInfoMissingCount > 0
            ? { label: "締め情報を確認", href: "#supplier-master-list" }
            : { label: "発注候補へ進む", href: kitagoyaPath("/purchases") };
  const flowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "仕入先を追加",
      href: "#supplier-create",
      tone: "info",
      Icon: Truck,
    },
    {
      label: "整備対象",
      count: needsActionCount,
      detail: `${readyCount}/${rows.length} 完了`,
      href: "#supplier-master-list",
      tone: needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "マスター紐付け",
      count: unusedSupplierCount,
      detail: "未使用",
      href: "#supplier-master-list",
      tone: unusedSupplierCount > 0 ? "warn" : "success",
      Icon: Database,
    },
    {
      label: "発注条件",
      count: orderingUnitMissingCount + closingInfoMissingCount,
      detail: `単位 ${orderingUnitMissingCount} / 締め ${closingInfoMissingCount}`,
      href: "#supplier-master-list",
      tone: orderingUnitMissingCount + closingInfoMissingCount > 0 ? "warn" : "success",
      Icon: PackageCheck,
    },
    {
      label: "原料・資材",
      count: linkedMaterialCount + linkedPackagingCount,
      detail: `原料 ${linkedMaterialCount} / 資材 ${linkedPackagingCount}`,
      href: kitagoyaPath("/masters/materials"),
      tone: "info",
      Icon: Database,
    },
  ];

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
          <a className="button-link secondary-link" href="#supplier-create">
            <Truck size={16} aria-hidden="true" />
            新規仕入先
          </a>
          <Link className="button-link secondary-link" href={kitagoyaPath("/masters/materials")}>
            <Database size={16} aria-hidden="true" />
            原料
          </Link>
          <Link className="button-link" href={kitagoyaPath("/masters/packaging")}>
            <PackageCheck size={16} aria-hidden="true" />
            資材
          </Link>
          <HelpTooltip text="発注書に表示される仕入先を管理します。原料・資材マスターから仕入先を選んで紐付けます。" />
        </div>
      </div>
      <div className="master-page-command">
        <div className="master-page-command-title">
          <span className={`badge ${needsActionCount > 0 ? "warn" : "success"}`}>
            {needsActionCount > 0 ? `整備が必要 ${needsActionCount}` : "整備済み"}
          </span>
          <strong>仕入先マスター整備フロー</strong>
          <span className="subtext">登録仕入先 {rows.length}件</span>
          <a className="master-page-next" href={nextAction.href}>
            次: {nextAction.label}
          </a>
        </div>
        <div className="master-page-checks">
          <span className={`badge ${unusedSupplierCount > 0 ? "warn" : "success"}`}>
            未使用 {unusedSupplierCount}件
          </span>
          <span className={`badge ${contactMissingCount > 0 ? "warn" : "success"}`}>
            連絡先 {contactMissingCount}件
          </span>
          <span className={`badge ${orderingUnitMissingCount > 0 ? "warn" : "success"}`}>
            発注単位 {orderingUnitMissingCount}件
          </span>
          <span className={`badge ${closingInfoMissingCount > 0 ? "warn" : "success"}`}>
            締め {closingInfoMissingCount}件
          </span>
        </div>
      </div>
      <div className="master-flow-grid" aria-label="仕入先マスター整備フロー">
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
      <section id="supplier-create" className="anchor-offset">
        <MasterForm
          endpoint={kitagoyaApiPath("/suppliers")}
          kind="仕入先"
          fields={supplierFields}
        />
      </section>
      <section id="supplier-master-list" className="anchor-offset">
        <SuppliersMasterTable rows={tableRows} fields={supplierFields} />
      </section>
    </>
  );
}

function hasValue(value: string | null): boolean {
  return Boolean(value && value.trim());
}
