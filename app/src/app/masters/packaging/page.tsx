import Link from "next/link";
import { ClipboardCheck, FileUp, ListChecks, PackagePlus, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { packagingKindLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import CsvImport from "../csv-import";
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
  const kindMissingCount = packaging.filter((material) => !material.kind).length;
  const leadTimeMissingCount = packaging.filter((material) => material.leadTimeDays <= 0).length;
  const casePackConfiguredCount = packaging.filter((material) => material.casePackQty != null).length;
  const casePackMissingCount = packaging.length - casePackConfiguredCount;
  const orderRuleConfiguredCount = packaging.filter(
    (material) => material.orderLotQty != null || material.minOrderQty != null,
  ).length;
  const orderRuleMissingCount = packaging.length - orderRuleConfiguredCount;
  const kindSummary = ["bag", "carton", "desiccant", "other", ""].map((kind) => ({
    label: packagingKindLabel(kind),
    count: packaging.filter((material) => (material.kind ?? "") === kind).length,
  }));
  const needsActionCount = packaging.filter(
    (material) =>
      !material.kind ||
      !material.supplierId ||
      material.standardUnitPrice <= 0 ||
      material.leadTimeDays <= 0 ||
      material.casePackQty == null ||
      material.casePackQty <= 0 ||
      (material.orderLotQty == null && material.minOrderQty == null),
  ).length;
  const readyCount = packaging.length - needsActionCount;
  const nextAction =
    kindMissingCount > 0
      ? { label: "種類未設定を確認", href: "#packaging-master-list" }
      : supplierMissingCount > 0
        ? { label: "仕入先未設定を確認", href: "#packaging-master-list" }
        : priceMissingCount > 0
          ? { label: "単価未設定を確認", href: "#packaging-master-list" }
          : casePackMissingCount > 0
            ? { label: "ケース入数を確認", href: "#packaging-master-list" }
            : orderRuleMissingCount > 0
              ? { label: "発注基準を確認", href: "#packaging-master-list" }
              : { label: "発注候補へ進む", href: kitagoyaPath("/purchases") };
  const flowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "資材を追加",
      href: "#packaging-create",
      tone: "info",
      Icon: PackagePlus,
    },
    {
      label: "整備対象",
      count: needsActionCount,
      detail: `${readyCount}/${packaging.length} 完了`,
      href: "#packaging-master-list",
      tone: needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "種類・入数",
      count: kindMissingCount + casePackMissingCount,
      detail: `種類 ${kindMissingCount} / 入数 ${casePackMissingCount}`,
      href: "#packaging-master-list",
      tone: kindMissingCount + casePackMissingCount > 0 ? "warn" : "success",
      Icon: ListChecks,
    },
    {
      label: "仕入先",
      count: supplierMissingCount,
      detail: "未設定",
      href: supplierMissingCount > 0 ? "#packaging-master-list" : kitagoyaPath("/masters/suppliers"),
      tone: supplierMissingCount > 0 ? "warn" : "success",
      Icon: Truck,
    },
    {
      label: "CSV取込",
      count: "取込",
      detail: "資材マスター",
      href: "#packaging-import",
      tone: "info",
      Icon: FileUp,
    },
  ];

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
        <div className="page-title-actions">
          <a className="button-link secondary-link" href="#packaging-create">
            <PackagePlus size={16} aria-hidden="true" />
            新規資材
          </a>
          <a className="button-link secondary-link" href="#packaging-import">
            <FileUp size={16} aria-hidden="true" />
            CSV取り込み
          </a>
          <Link className="button-link" href={kitagoyaPath("/masters/suppliers")}>
            <Truck size={16} aria-hidden="true" />
            仕入先
          </Link>
        </div>
      </div>
      <div className="master-page-command">
        <div className="master-page-command-title">
          <span className={`badge ${needsActionCount > 0 ? "warn" : "success"}`}>
            {needsActionCount > 0 ? `整備が必要 ${needsActionCount}` : "整備済み"}
          </span>
          <strong>資材マスター整備フロー</strong>
          <span className="subtext">有効資材 {packaging.length}件</span>
          <a className="master-page-next" href={nextAction.href}>
            次: {nextAction.label}
          </a>
        </div>
        <div className="master-page-checks">
          <span className={`badge ${kindMissingCount > 0 ? "warn" : "success"}`}>
            種類 {kindMissingCount}件
          </span>
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
      <div className="master-flow-grid" aria-label="資材マスター整備フロー">
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
      <section id="packaging-create" className="anchor-offset">
        <MasterForm
          endpoint={kitagoyaApiPath("/packaging-materials")}
          kind="資材"
          fields={packagingFields}
        />
      </section>
      <section id="packaging-master-list" className="anchor-offset">
        <PackagingMasterTable rows={rows} packagingFields={packagingFields} />
      </section>

      <div id="packaging-import" className="panel after-table anchor-offset">
        <strong>CSV取り込み</strong>
        <CsvImport endpoint={kitagoyaApiPath("/import/packaging-materials")} templateType="packaging" />
      </div>
    </>
  );
}
