import Link from "next/link";
import { CalendarDays, ClipboardCheck, ListChecks, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
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
  const missingAffiliationCount = rows.filter((row) => !hasText(row.affiliation)).length;
  const missingWorkTimeCount = rows.filter((row) => !row.defaultStartTime || !row.defaultEndTime).length;
  const invalidBreakCount = rows.filter((row) => row.defaultBreakMinutes < 0).length;
  const shiftEntryDisabledCount = rows.filter((row) => !row.shiftEntryEnabled).length;
  const needsActionCount = rows.filter(
    (row) =>
      !hasText(row.affiliation) ||
      !row.defaultStartTime ||
      !row.defaultEndTime ||
      row.defaultBreakMinutes < 0 ||
      (row.shiftEntryEnabled && !row.shiftEntryToken) ||
      !row.shiftEntryEnabled,
  ).length;
  const readyCount = rows.length - needsActionCount;
  const nextAction =
    missingAffiliationCount > 0
      ? { label: "所属未設定を確認", href: "#employee-master-list" }
      : missingWorkTimeCount > 0
        ? { label: "勤務時間を確認", href: "#employee-master-list" }
        : shiftEntryUnissuedCount > 0
          ? { label: "本人入力URLを発行", href: "#employee-master-list" }
          : shiftEntryDisabledCount > 0
            ? { label: "本人入力停止を確認", href: "#employee-master-list" }
            : { label: "シフトへ進む", href: kitagoyaPath("/shifts") };
  const flowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "従業員を追加",
      href: "#employee-create",
      tone: "info",
      Icon: UserPlus,
    },
    {
      label: "整備対象",
      count: needsActionCount,
      detail: `${readyCount}/${rows.length} 完了`,
      href: "#employee-master-list",
      tone: needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "本人入力URL",
      count: shiftEntryUnissuedCount,
      detail: `発行済み ${shiftEntryIssuedCount}名`,
      href: "#employee-master-list",
      tone: shiftEntryUnissuedCount > 0 ? "warn" : "success",
      Icon: Users,
    },
    {
      label: "基本勤務",
      count: missingWorkTimeCount + invalidBreakCount,
      detail: `時間 ${missingWorkTimeCount} / 休憩 ${invalidBreakCount}`,
      href: "#employee-master-list",
      tone: missingWorkTimeCount + invalidBreakCount > 0 ? "warn" : "success",
      Icon: ListChecks,
    },
    {
      label: "シフト確認",
      count: "確認",
      detail: "月次シフトへ",
      href: kitagoyaPath("/shifts"),
      tone: "info",
      Icon: CalendarDays,
    },
  ];

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
        <div className="page-title-actions">
          <a className="button-link secondary-link" href="#employee-create">
            <UserPlus size={16} aria-hidden="true" />
            新規従業員
          </a>
          <a className="button-link secondary-link" href="#employee-master-list">
            <Users size={16} aria-hidden="true" />
            本人入力URL
          </a>
          <Link className="button-link" href={kitagoyaPath("/shifts")}>
            <CalendarDays size={16} aria-hidden="true" />
            シフト
          </Link>
        </div>
      </div>
      <div className="master-page-command">
        <div className="master-page-command-title">
          <span className={`badge ${needsActionCount > 0 ? "warn" : "success"}`}>
            {needsActionCount > 0 ? `整備が必要 ${needsActionCount}` : "整備済み"}
          </span>
          <strong>従業員マスター整備フロー</strong>
          <span className="subtext">有効スタッフ {rows.length}名</span>
          <a className="master-page-next" href={nextAction.href}>
            次: {nextAction.label}
          </a>
        </div>
        <div className="master-page-checks">
          <span className={`badge ${missingAffiliationCount > 0 ? "warn" : "success"}`}>
            所属 {missingAffiliationCount}名
          </span>
          <span className={`badge ${missingWorkTimeCount > 0 ? "warn" : "success"}`}>
            勤務時間 {missingWorkTimeCount}名
          </span>
          <span className={`badge ${invalidBreakCount > 0 ? "warn" : "success"}`}>
            休憩 {invalidBreakCount}名
          </span>
          <span className={`badge ${shiftEntryUnissuedCount > 0 ? "warn" : "success"}`}>
            URL未発行 {shiftEntryUnissuedCount}名
          </span>
          <span className={`badge ${shiftEntryDisabledCount > 0 ? "warn" : "success"}`}>
            本人入力停止 {shiftEntryDisabledCount}名
          </span>
        </div>
      </div>
      <div className="master-flow-grid" aria-label="従業員マスター整備フロー">
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
      <section id="employee-create" className="anchor-offset">
        <MasterForm
          endpoint={kitagoyaApiPath("/employees")}
          kind="従業員"
          fields={employeeFields}
        />
      </section>
      <section id="employee-master-list" className="anchor-offset">
        <EmployeesMasterTable rows={tableRows} fields={employeeFields} />
      </section>
    </>
  );
}

function hasText(value: string | null) {
  return Boolean(value && value.trim());
}
