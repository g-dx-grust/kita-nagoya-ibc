import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath } from "@/lib/paths";
import MasterForm, { type MasterField } from "../master-form";
import EmployeesMasterTable from "./employees-master-table";

export const dynamic = "force-dynamic";

const employeeFields: MasterField[] = [
  { key: "name", label: "氏名", required: true },
  {
    key: "employmentType",
    label: "雇用区分",
    type: "select",
    default: "own",
    options: [
      { value: "own", label: "自社" },
      { value: "temp", label: "派遣" },
      { value: "other", label: "その他" },
    ],
  },
  { key: "affiliation", label: "所属", nullable: true },
  { key: "defaultStartTime", label: "基本開始", type: "time", default: "09:00" },
  { key: "defaultEndTime", label: "基本終了", type: "time", default: "17:00" },
  { key: "defaultBreakMinutes", label: "基本休憩(分)", type: "number", default: 60 },
  { key: "note", label: "備考", type: "textarea", nullable: true },
];

export default async function EmployeesPage() {
  const rows = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const tableRows = rows.map((r) => ({
    id: r.id,
    name: r.name,
    employmentType: r.employmentType,
    affiliation: r.affiliation,
    defaultStartTime: r.defaultStartTime,
    defaultEndTime: r.defaultEndTime,
    defaultBreakMinutes: r.defaultBreakMinutes,
    note: r.note,
  }));

  return (
    <>
      <h1>従業員マスター</h1>
      <MasterForm
        endpoint={kitagoyaApiPath("/employees")}
        kind="従業員"
        fields={employeeFields}
      />
      <EmployeesMasterTable rows={tableRows} fields={employeeFields} />
    </>
  );
}
