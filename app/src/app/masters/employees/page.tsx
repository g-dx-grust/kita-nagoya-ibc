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
  { key: "shiftEntryEnabled", label: "本人シフト入力を許可", type: "checkbox", default: true },
  { key: "note", label: "備考", type: "textarea", nullable: true },
];

export default async function EmployeesPage() {
  const rows = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const ownCount = rows.filter((row) => row.employmentType === "own").length;
  const tempCount = rows.filter((row) => row.employmentType === "temp").length;
  const otherCount = rows.length - ownCount - tempCount;
  const shiftEntryEnabledCount = rows.filter((row) => row.shiftEntryEnabled).length;
  const shiftEntryIssuedCount = rows.filter((row) => row.shiftEntryEnabled && row.shiftEntryToken).length;
  const shiftEntryUnissuedCount = shiftEntryEnabledCount - shiftEntryIssuedCount;

  const tableRows = rows.map((r) => ({
    id: r.id,
    name: r.name,
    employmentType: r.employmentType,
    affiliation: r.affiliation,
    defaultStartTime: r.defaultStartTime,
    defaultEndTime: r.defaultEndTime,
    defaultBreakMinutes: r.defaultBreakMinutes,
    shiftEntryToken: r.shiftEntryToken,
    shiftEntryEnabled: r.shiftEntryEnabled,
    note: r.note,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>従業員マスター</h1>
      </div>
      <div className="employee-summary-grid">
        <div className="metric">
          <div className="metric-label">登録スタッフ</div>
          <div className="metric-value">{rows.length}名</div>
          <div className="metric-note">有効な従業員</div>
        </div>
        <div className="metric">
          <div className="metric-label">雇用区分</div>
          <div className="metric-value employee-summary-breakdown">
            <span>自社 {ownCount}名</span>
            <span>派遣 {tempCount}名</span>
            {otherCount > 0 && <span>その他 {otherCount}名</span>}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">本人入力許可</div>
          <div className="metric-value">{shiftEntryEnabledCount}名</div>
          <div className="metric-note">URL発行済み {shiftEntryIssuedCount}名</div>
        </div>
        <div className="metric">
          <div className="metric-label">URL未発行</div>
          <div className={`metric-value ${shiftEntryUnissuedCount > 0 ? "warn-value" : ""}`}>
            {shiftEntryUnissuedCount}名
          </div>
          <div className="metric-note">本人入力URLの共有待ち</div>
        </div>
      </div>
      <MasterForm
        endpoint={kitagoyaApiPath("/employees")}
        kind="従業員"
        fields={employeeFields}
      />
      <EmployeesMasterTable rows={tableRows} fields={employeeFields} />
    </>
  );
}
