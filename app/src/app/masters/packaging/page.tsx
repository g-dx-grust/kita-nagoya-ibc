import { prisma } from "@/lib/prisma";
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
      <h1>資材マスター</h1>
      <MasterForm
        endpoint={kitagoyaApiPath("/packaging-materials")}
        kind="資材"
        fields={packagingFields}
      />
      <PackagingMasterTable rows={rows} packagingFields={packagingFields} />
    </>
  );
}
