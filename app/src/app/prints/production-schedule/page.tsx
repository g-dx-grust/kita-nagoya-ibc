import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { manualNote } from "@/lib/labels";
import { kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import PrintButton from "../print-button";
import PrintDateNav from "../print-date-nav";

export const dynamic = "force-dynamic";

type PlanWithPrintData = Awaited<ReturnType<typeof loadData>>["plans"][number];
type ProductWithBom = PlanWithPrintData["product"];
type PackagingInfo = { id: string; name: string; kind: string | null };
type PackagingMap = Map<string, PackagingInfo>;

// 1部屋=1枚の作業日報。現場で追記できるよう、最低この行数まで空行を補う。
const MIN_ROWS_PER_SHEET = 12;

// 紙の「作業日報」フォーム下部の注意書き(2020-06-04改訂版)を再現する。
const NIPPO_NOTES = [
  "使用原料のロットNo（賞味期限・製造日等）は必ず記入すること。ロットNo不明の原料は責任者に報告し、使用しないこと。",
  "食味チェック欄：見た目（カビ・異物付着等）、味（しけり・異味等）がないか2名以上で確認し、問題ない場合は点を記入する。",
  "逸脱した商品の修正処置等、特記事項は備考欄に記入する。",
  "記入のない部分は空欄にせず斜線を引くこと。",
  "誤って記載した場合は、修正液等で消さず二重線で修正すること。",
];

export default async function ProductionSchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  const { plans, packagingMap } = await loadData(date);
  const grouped = groupByWorkArea(plans);
  const timelines = buildTimelines(plans);
  const printedAt = formatDateTime(new Date());
  const workDate = formatWorkDate(date);
  const assignedCount = plans.reduce((sum, plan) => sum + plan.assignments.length, 0);
  const requiredStaffCount = plans.reduce((sum, plan) => sum + plan.plannedPeopleCount, 0);
  const unassignedCount = Math.max(0, requiredStaffCount - assignedCount);
  const warningCount = plans.filter((plan) => plan.status === "draft" || warningList(plan).length > 0).length;
  const isReady = plans.length > 0 && unassignedCount === 0 && warningCount === 0;

  return (
    <div className="print-page nippo-page">
      <div className="no-print toolbar">
        <Link href={kitagoyaPath(`/prints?date=${date}`)}>← 現場印刷へ</Link>
        <div className="spacer" />
        <PrintButton label="作業日報を印刷" />
      </div>
      <PrintDateNav basePath="/prints/production-schedule" date={date} label="作業日報の日付切替" />

      <div className={`no-print print-readiness-command ${isReady ? "success" : "warn"}`}>
        <div className="print-readiness-title">
          <span className={`badge ${isReady ? "success" : "warn"}`}>{isReady ? "印刷OK" : "要確認"}</span>
          <strong>作業日報印刷</strong>
          <span>{workDate}</span>
        </div>
        <div className="print-readiness-checks">
          <span className="badge info">部屋 {grouped.length}</span>
          <span className="badge info">予定 {plans.length}</span>
          <span className={unassignedCount > 0 ? "badge warn" : "badge success"}>未配置 {unassignedCount}</span>
          <span className={warningCount > 0 ? "badge warn" : "badge success"}>注意 {warningCount}</span>
        </div>
        <div className="print-readiness-actions">
          {unassignedCount > 0 && (
            <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/allocate?date=${date}`)}>
              割り当て確認
            </Link>
          )}
          <Link className="button-link secondary-link" href={kitagoyaPath(`/prints/staff-assignments?date=${date}`)}>
            配置表
          </Link>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="empty-state">この日の生産予定はありません。</div>
      ) : (
        grouped.map(([workAreaName, areaPlans], index) => {
          const blankRows = Math.max(0, MIN_ROWS_PER_SHEET - areaPlans.length);
          const staff = roomStaff(areaPlans, timelines);
          return (
            // 作業部屋ごとに改ページ(1部屋=1枚)。先頭部屋は改ページしない。
            <section key={workAreaName} className={index > 0 ? "nippo-sheet page-break" : "nippo-sheet"}>
              <div className="nippo-titlebar">
                <h2>作業日報</h2>
                <div className="nippo-room">{workAreaName}</div>
              </div>

              <div className="nippo-meta">
                <div>
                  <span className="label">作業日</span>
                  {workDate}
                </div>
                <div>
                  <span className="label">ライン No.</span>
                  {workAreaName}
                </div>
                <div>
                  <span className="label">記入者</span>
                </div>
                <div>
                  <span className="label">責任者</span>
                </div>
              </div>

              <div className="nippo-staff">
                <span className="label">担当者</span>
                {staff.length === 0 ? (
                  "　"
                ) : (
                  <span className="nippo-staff-list">
                    {staff.map((s, i) => (
                      <span className="nippo-staff-chip" key={i}>
                        {s.name}
                        {s.moveTo ? <span className="nippo-move">（{s.moveTo}へ移動）</span> : null}
                      </span>
                    ))}
                  </span>
                )}
              </div>

              <table className="nippo-table">
                <colgroup>
                  <col className="c-time" />
                  <col className="c-brand" />
                  <col className="c-name" />
                  <col className="c-vol" />
                  <col className="c-qty" />
                  <col className="c-exp" />
                  <col className="c-tray" />
                  <col className="c-pres" />
                  <col className="c-ship" />
                  <col className="c-carton" />
                  <col className="c-note" />
                </colgroup>
                <thead>
                  <tr>
                    <th>作業時間</th>
                    <th>ブランド</th>
                    <th>商品名</th>
                    <th>内容量</th>
                    <th>数量</th>
                    <th>賞味期限</th>
                    <th>トレー</th>
                    <th>保存剤</th>
                    <th>出荷</th>
                    <th>ダンボール</th>
                    <th>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {areaPlans.map((plan) => (
                    <tr key={plan.id} className={plan.status === "draft" || warningList(plan).length > 0 ? "print-row-warn" : undefined}>
                      <td className="center">
                        {plan.plannedStartTime}～{plan.plannedEndTime ?? plan.desiredEndTime ?? "　"}
                      </td>
                      {/* ブランド(OEM/取引先名)はマスター化対応中。完了後 product.brand を自動表示する。 */}
                      <td>{productBrand(plan.product)}</td>
                      <td>
                        <strong>{plan.product.officialName}</strong>
                        <div className="nippo-sub">{plan.product.productCode}</div>
                      </td>
                      <td className="center">{contentVolume(plan.product)}</td>
                      <td className="right">
                        {formatCases(plan.plannedQuantity, {
                          casePackQty: plan.product.casePackQty,
                          baseUnit: plan.unit,
                        })}
                      </td>
                      {/* 賞味期限はロット依存のため現場で手書き */}
                      <td />
                      {/* トレーは未マスター化のため手書き */}
                      <td />
                      <td>{packagingByKind(plan.product, packagingMap, ["desiccant"])}</td>
                      {/* 出荷方法は未マスター化のため手書き */}
                      <td />
                      <td>{packagingByKind(plan.product, packagingMap, ["carton"])}</td>
                      <td>{remarks(plan)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: blankRows }).map((_, i) => (
                    <tr key={`blank-${i}`} className="nippo-blank">
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="nippo-notes">
                <ul>
                  {NIPPO_NOTES.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
                <div className="nippo-foot">出力日時 {printedAt}</div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

async function loadData(date: string) {
  const [start, end] = dayRange(date);
  const [plans, packagingMaterials] = await Promise.all([
    prisma.productionPlan.findMany({
      where: { date: { gte: start, lt: end }, status: { not: "cancelled" } },
      include: {
        product: { include: { bomItems: { where: { active: true, itemType: "packaging" } } } },
        workArea: true,
        requirements: true,
        assignments: {
          where: { employee: { shifts: { some: { date: { gte: start, lt: end }, status: { not: "off" } } } } },
          include: { employee: true },
          orderBy: [{ startTime: "asc" }],
        },
      },
      orderBy: [{ workArea: { displayOrder: "asc" } }, { plannedStartTime: "asc" }],
    }),
    prisma.packagingMaterial.findMany({ select: { id: true, name: true, kind: true } }),
  ]);
  const packagingMap: PackagingMap = new Map(packagingMaterials.map((p) => [p.id, p]));
  return { plans, packagingMap };
}

function groupByWorkArea(plans: PlanWithPrintData[]) {
  const map = new Map<string, PlanWithPrintData[]>();
  for (const plan of plans) {
    const key = plan.workArea.name;
    map.set(key, [...(map.get(key) ?? []), plan]);
  }
  return [...map.entries()];
}

type TimelineEntry = {
  plan: PlanWithPrintData;
  assignment: PlanWithPrintData["assignments"][number];
};

// 従業員ごとに当日の全割り当てを時刻順に並べる(部屋をまたぐ移動の導出に使う)。
// moveAfterPlanId は実データで未設定のため、開始時刻順の前後関係から移動を判定する。
function buildTimelines(plans: PlanWithPrintData[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const plan of plans) {
    for (const assignment of plan.assignments) {
      const arr = map.get(assignment.employeeId) ?? [];
      arr.push({ plan, assignment });
      map.set(assignment.employeeId, arr);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.assignment.startTime.localeCompare(b.assignment.startTime));
  }
  return map;
}

// 苗字のみを返す(氏名は半角/全角スペース区切り)。前後の空白は除去する。
function surname(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/[\s　]+/)[0] || trimmed;
}

// この部屋の担当者(苗字)を入室順に列挙する。
// 在室終了後に別部屋の割り当てがある人は「作業後の移動先」だけを注記する(時刻は出さない=人員配置側で見る)。
function roomStaff(areaPlans: PlanWithPrintData[], timelines: Map<string, TimelineEntry[]>) {
  const roomName = areaPlans[0]?.workArea.name ?? "";
  const seen = new Set<string>();
  const ordered = areaPlans
    .flatMap((plan) => plan.assignments)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const staff: { name: string; moveTo: string }[] = [];
  for (const assignment of ordered) {
    if (seen.has(assignment.employeeId)) continue;
    seen.add(assignment.employeeId);
    const timeline = timelines.get(assignment.employeeId) ?? [];
    const inRoom = timeline.filter((t) => t.plan.workArea.name === roomName);
    if (inRoom.length === 0) continue;
    const end = inRoom.reduce(
      (latest, t) => (t.assignment.endTime > latest ? t.assignment.endTime : latest),
      inRoom[0].assignment.endTime,
    );
    const next = timeline.find((t) => t.assignment.startTime >= end && t.plan.workArea.name !== roomName);
    staff.push({ name: surname(assignment.employee.name), moveTo: next ? next.plan.workArea.name : "" });
  }
  return staff;
}

// ブランド(OEM/取引先名)はマスター化対応中。brand フィールド追加後はそのまま自動表示される。
function productBrand(product: ProductWithBom): string {
  return (product as { brand?: string | null }).brand ?? "";
}

function contentVolume(product: ProductWithBom): string {
  return product.packSizeG != null ? `${product.packSizeG}g` : "";
}

// 商品BOMの資材を種別で引いて表示する(保存剤=乾燥剤, ダンボール=carton)。
function packagingByKind(product: ProductWithBom, packagingMap: PackagingMap, kinds: string[]): string {
  const names = product.bomItems
    .filter((item) => item.itemType === "packaging")
    .map((item) => packagingMap.get(item.itemId))
    .filter((p): p is PackagingInfo => !!p && kinds.includes(p.kind ?? ""))
    .map((p) => p.name);
  return [...new Set(names)].join(" / ");
}

function remarks(plan: PlanWithPrintData): string {
  const parts: string[] = [];
  if (plan.status === "draft") parts.push("【仮】");
  const note = manualNote(plan.note);
  if (note) parts.push(note);
  const warns = warningList(plan);
  if (warns.length) parts.push(`⚠${warns.join("・")}`);
  return parts.join(" ");
}

function warningList(plan: PlanWithPrintData): string[] {
  const items: string[] = [];
  if (plan.overtimeMinutes > 0) items.push(`17時超${plan.overtimeMinutes}分`);
  const shortages = plan.requirements.filter((r) => r.shortageType !== "none");
  if (shortages.some((s) => s.shortageType === "hard_shortage")) items.push("原料/資材不足");
  if (shortages.some((s) => s.shortageType === "unconfirmed_dependency")) items.push("未確定入荷依存");
  return items;
}

function dayRange(date: string): [Date, Date] {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function formatWorkDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = "日月火水木金土"[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "";
  return `${y}年 ${m}月 ${d}日（${weekday}）`;
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
