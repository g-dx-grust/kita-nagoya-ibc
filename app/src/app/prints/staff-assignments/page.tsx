import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { employmentTypeLabel, manualNote } from "@/lib/labels";
import { kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import PrintButton from "../print-button";

export const dynamic = "force-dynamic";

const AREA_PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#65a30d", "#dc2626"];

function hm(value: string | null | undefined) {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

type PlanWithPrintData = Awaited<ReturnType<typeof loadPlansAndEmployees>>["plans"][number];
type EmployeeWithPrintData = Awaited<ReturnType<typeof loadPlansAndEmployees>>["employees"][number];

export default async function StaffAssignmentsPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  const { plans, employees } = await loadPlansAndEmployees(date);
  const byWorkArea = groupByWorkArea(plans);
  const employeeRows = buildEmployeeRows(employees, plans);
  const requiredStaffCount = plans.reduce((sum, plan) => sum + plan.plannedPeopleCount, 0);
  const assignedCount = plans.reduce((sum, plan) => sum + plan.assignments.length, 0);
  const unassignedCount = Math.max(0, requiredStaffCount - assignedCount);
  const unassignedEmployeeCount = employeeRows.filter((row) => row.assignmentTime === "未配置").length;
  const isReady = plans.length > 0 && unassignedCount === 0;

  // 部屋別タイムライン（印刷用ガント）の窓・色
  const startsEnds = plans.flatMap((p) => [hm(p.plannedStartTime), hm(p.plannedEndTime ?? p.desiredEndTime ?? "17:00")]);
  const winStart = startsEnds.length ? Math.min(540, ...startsEnds.filter((v) => v > 0)) : 540;
  const winEnd = startsEnds.length ? Math.max(1020, ...startsEnds) : 1020;
  const span = Math.max(1, winEnd - winStart);
  const ticks: number[] = [];
  for (let m = Math.ceil(winStart / 60) * 60; m <= winEnd; m += 60) ticks.push(m);
  const areaColor = new Map<string, string>();
  byWorkArea.forEach(([name], i) => areaColor.set(name, AREA_PALETTE[i % AREA_PALETTE.length]));
  const barPos = (s: string, e: string) => {
    const left = Math.max(0, Math.min(100, ((hm(s) - winStart) / span) * 100));
    const width = Math.max(0, Math.min(100 - left, ((hm(e) - hm(s)) / span) * 100));
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <div className="print-page">
      <div className="no-print toolbar">
        <Link href={kitagoyaPath(`/prints?date=${date}`)}>← 現場印刷へ</Link>
        <div className="spacer" />
        <PrintButton label="スタッフ配置を印刷" />
      </div>

      <div className={`no-print print-readiness-command ${isReady ? "success" : "warn"}`}>
        <div className="print-readiness-title">
          <span className={`badge ${isReady ? "success" : "warn"}`}>{isReady ? "印刷OK" : "要確認"}</span>
          <strong>スタッフ配置表</strong>
          <span>{date}</span>
        </div>
        <div className="print-readiness-checks">
          <span className="badge info">部屋 {byWorkArea.length}</span>
          <span className="badge info">予定 {plans.length}</span>
          <span className={unassignedCount > 0 ? "badge warn" : "badge success"}>未配置 {unassignedCount}</span>
          <span className={unassignedEmployeeCount > 0 ? "badge warn" : "badge success"}>
            未割当スタッフ {unassignedEmployeeCount}
          </span>
        </div>
        <div className="print-readiness-actions">
          {unassignedCount > 0 && (
            <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/allocate?date=${date}`)}>
              割り当て確認
            </Link>
          )}
          <Link className="button-link secondary-link" href={kitagoyaPath(`/prints/production-schedule?date=${date}`)}>
            作業日報
          </Link>
        </div>
      </div>

      <header className="print-title">
        <div>
          <h1>スタッフ配置表</h1>
          <p>{date}</p>
        </div>
        <div className="print-meta">
          <div>スタッフ数: {employees.length}人</div>
          <div>出力日時: {formatDateTime(new Date())}</div>
        </div>
      </header>

      {plans.length > 0 && (
        <section className="print-section print-gantt">
          <h2>部屋別タイムライン（誰がどの部屋で何時から何を）</h2>
          <div className="gantt" style={{ "--gantt-cols": Math.max(1, Math.round(span / 60)) } as CSSProperties}>
            <div className="gantt-axis">
              <div className="gantt-axis-spacer" />
              <div className="gantt-axis-scale">
                {ticks.map((m) => (
                  <div key={m} className="gantt-tick" style={{ left: `${((m - winStart) / span) * 100}%` }}>
                    {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
                  </div>
                ))}
              </div>
            </div>
            {byWorkArea.map(([workAreaName, areaPlans]) => (
              <div className="gantt-row" key={workAreaName}>
                <div className="gantt-label">{workAreaName}</div>
                <div className="gantt-track">
                  {areaPlans
                    .filter((plan) => plan.plannedEndTime ?? plan.desiredEndTime)
                    .map((plan) => (
                      <div
                        key={plan.id}
                        className="gantt-bar"
                        style={{
                          ...barPos(plan.plannedStartTime, plan.plannedEndTime ?? plan.desiredEndTime ?? "17:00"),
                          background: areaColor.get(workAreaName),
                        }}
                      >
                        <span>{plan.product.officialName}</span>
                        <span className="gantt-bar-sub">{plan.assignments.length || plan.plannedPeopleCount}人</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="print-section page-break">
        <h2>作業場所別配置</h2>
        {plans.length === 0 ? (
          <div className="empty-state">この日の生産予定はありません。</div>
        ) : (
          byWorkArea.map(([workAreaName, areaPlans], index) => (
            // 部屋ごとに改ページ（1部屋=1枚）。先頭部屋は改ページしない。
            <div key={workAreaName} className={index > 0 ? "print-subsection page-break" : "print-subsection"}>
              <h3>{workAreaName}</h3>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>商品</th>
                    <th>数量</th>
                    <th>必要人数</th>
                    <th>配置スタッフ</th>
                    <th>未配置</th>
                  </tr>
                </thead>
                <tbody>
                  {areaPlans.map((plan) => {
                    const shortage = Math.max(0, plan.plannedPeopleCount - plan.assignments.length);
                    return (
                      <tr key={plan.id} className={shortage > 0 ? "print-row-warn" : undefined}>
                        <td>
                          {plan.plannedStartTime} - {plan.plannedEndTime ?? plan.desiredEndTime ?? "未計算"}
                        </td>
                        <td>
                          <strong>{plan.product.officialName}</strong>
                          <div className="subtext">{plan.product.productCode}</div>
                        </td>
                        <td className="right">
                          {formatCases(plan.plannedQuantity, {
                            casePackQty: plan.product.casePackQty,
                            baseUnit: plan.unit,
                          })}
                        </td>
                        <td className="right">{plan.plannedPeopleCount}</td>
                        <td>{staffNames(plan)}</td>
                        <td>{shortage > 0 ? `${shortage}人` : "なし"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      <section className="print-section page-break">
        <h2>スタッフ別配置</h2>
        <table className="print-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>勤務予定</th>
              <th>移動</th>
              <th>配置時間</th>
              <th>作業場所</th>
              <th>商品</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {employeeRows.map((row) => (
              <tr key={row.key} className={row.assignmentTime === "未配置" ? "print-row-warn" : undefined}>
                <td>
                  <strong>{row.employee.name}</strong>
                  <div className="subtext">{employeeMeta(row.employee)}</div>
                </td>
                <td>{row.shift}</td>
                <td>{row.movement}</td>
                <td>{row.assignmentTime}</td>
                <td>{row.workArea}</td>
                <td>{row.product}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function loadPlansAndEmployees(date: string) {
  const [start, end] = dayRange(date);
  const [plans, employees] = await Promise.all([
    prisma.productionPlan.findMany({
      where: { date: { gte: start, lt: end }, status: { not: "cancelled" } },
      include: {
        product: true,
        workArea: true,
        assignments: {
          where: { employee: { shifts: { some: { date: { gte: start, lt: end }, status: { not: "off" } } } } },
          include: { employee: true },
          orderBy: [{ startTime: "asc" }],
        },
      },
      orderBy: [{ workArea: { displayOrder: "asc" } }, { plannedStartTime: "asc" }],
    }),
    prisma.employee.findMany({
      where: { active: true, shifts: { some: { date: { gte: start, lt: end }, status: { not: "off" } } } },
      include: { shifts: { where: { date: { gte: start, lt: end } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { plans, employees };
}

function groupByWorkArea(plans: PlanWithPrintData[]) {
  const map = new Map<string, PlanWithPrintData[]>();
  for (const plan of plans) {
    const key = plan.workArea.name;
    map.set(key, [...(map.get(key) ?? []), plan]);
  }
  return [...map.entries()];
}

function buildEmployeeRows(employees: EmployeeWithPrintData[], plans: PlanWithPrintData[]) {
  const rows: {
    key: string;
    employee: EmployeeWithPrintData;
    shift: string;
    assignmentTime: string;
    movement: string;
    workArea: string;
    product: string;
    note: string;
  }[] = [];

  for (const employee of employees) {
    // 当日の割り当てを開始時刻順に並べ、前後関係から部屋移動を判定する。
    // (moveAfterPlanId は実データで未設定のため使わない)
    const assignments = plans
      .flatMap((plan) =>
        plan.assignments
          .filter((assignment) => assignment.employeeId === employee.id)
          .map((assignment) => ({ plan, assignment })),
      )
      .sort((a, b) => a.assignment.startTime.localeCompare(b.assignment.startTime));
    const shift = employee.shifts[0]
      ? `${employee.shifts[0].startTime}-${employee.shifts[0].endTime}`
      : "未登録";

    if (assignments.length === 0) {
      rows.push({
        key: `${employee.id}-empty`,
        employee,
        shift,
        assignmentTime: "未配置",
        movement: "",
        workArea: "",
        product: "",
        note: "",
      });
      continue;
    }

    assignments.forEach((current, i) => {
      const { plan, assignment } = current;
      const previous = i > 0 ? assignments[i - 1] : null;
      rows.push({
        key: assignment.id,
        employee,
        shift,
        movement: movementText(current, previous),
        assignmentTime: `${assignment.startTime}-${assignment.endTime}`,
        workArea: plan.workArea.name,
        product: plan.product.officialName,
        note: manualNote(plan.note),
      });
    });
  }

  return rows;
}

type AssignmentRef = { plan: PlanWithPrintData; assignment: PlanWithPrintData["assignments"][number] };

// 従業員の割り当て時刻基準で「いつ・どこから」その部屋に入ったかを表す。
function movementText(current: AssignmentRef, previous: AssignmentRef | null) {
  const arrival = current.assignment.startTime;
  const room = current.plan.workArea.name;
  if (!previous) return `${arrival} ${room}入室`;
  if (previous.plan.workAreaId === current.plan.workAreaId) return `${arrival} ${room}で継続`;
  return `${arrival} ${previous.plan.workArea.name} → ${room}`;
}

function staffNames(plan: PlanWithPrintData) {
  if (plan.assignments.length === 0) return "未配置";
  return plan.assignments
    .map((assignment) => `${assignment.employee.name} (${assignment.startTime}-${assignment.endTime})`)
    .join(" / ");
}

function employeeMeta(employee: EmployeeWithPrintData) {
  return [employmentTypeLabel(employee.employmentType), employee.affiliation]
    .filter(Boolean)
    .join(" / ");
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
