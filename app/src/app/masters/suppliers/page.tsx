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
  const rows = await prisma.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const tableRows = rows.map((r) => ({
    id: r.id,
    name: r.name,
    contact: r.contact,
    orderingUnit: r.orderingUnit,
    closingInfo: r.closingInfo,
    validFrom: toDateInput(r.validFrom),
    validTo: toDateInput(r.validTo),
  }));

  return (
    <>
      <h1>仕入先マスター</h1>
      <p className="section-note">
        発注書に表示される仕入先はここで管理します。原料・資材マスターから仕入先を選んで紐付けてください。
      </p>
      <MasterForm
        endpoint={kitagoyaApiPath("/suppliers")}
        kind="仕入先"
        fields={supplierFields}
      />
      <SuppliersMasterTable rows={tableRows} fields={supplierFields} />
    </>
  );
}
