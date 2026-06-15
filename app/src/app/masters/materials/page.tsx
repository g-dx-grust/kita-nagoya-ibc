import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath } from "@/lib/paths";
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
      <h1>原料マスター</h1>
      <MasterForm
        endpoint={kitagoyaApiPath("/materials")}
        kind="原料"
        fields={materialFields}
      />
      <MaterialsMasterTable rows={rows} materialFields={materialFields} />

      <div className="panel after-table">
        <strong>CSV取り込み</strong>
        <CsvImport endpoint={kitagoyaApiPath("/import/materials")} templateType="materials" />
      </div>
    </>
  );
}
