import Link from "next/link";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ClipboardCheck, Clock, Factory, Settings, Table2, Users } from "lucide-react";
import { areaTypeLabel, autoScheduleRoleLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import MasterForm from "../master-form";
import { workAreaFields } from "./work-area-fields";
import WorkAreaCapacityTable from "./work-area-capacity-table";

export const dynamic = "force-dynamic";

export default async function WorkAreasPage() {
  const rows = await prisma.workArea.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const areaTypeCounts = countBy(rows, (row) => row.areaType);
  const autoScheduleRoleCounts = countBy(rows, (row) => row.autoScheduleRole);
  const totalMaxPeople = rows.reduce((sum, row) => sum + row.maxPeopleCount, 0);
  const standardTimeConfiguredCount = rows.filter(
    (row) => row.defaultStartTime && row.defaultEndTime,
  ).length;
  const standardTimeMissingCount = rows.length - standardTimeConfiguredCount;
  const concurrentAllowedCount = rows.filter((row) => row.concurrentOperationAllowed).length;
  const concurrentBlockedCount = rows.length - concurrentAllowedCount;
  const invalidPeopleCount = rows.filter((row) => row.maxPeopleCount < 1).length;
  const excludedCount = rows.filter((row) => row.autoScheduleRole === "EXCLUDED").length;
  const externalMismatchCount = rows.filter(
    (row) =>
      (row.areaType === "external" && !row.externalFlag) ||
      (row.areaType !== "external" && row.externalFlag),
  ).length;
  const needsActionCount = rows.filter(
    (row) =>
      !row.defaultStartTime ||
      !row.defaultEndTime ||
      row.maxPeopleCount < 1 ||
      row.autoScheduleRole === "EXCLUDED" ||
      !row.concurrentOperationAllowed ||
      (row.areaType === "external" && !row.externalFlag) ||
      (row.areaType !== "external" && row.externalFlag),
  ).length;
  const readyCount = rows.length - needsActionCount;
  const nextAction =
    standardTimeMissingCount > 0
      ? { label: "標準時間を確認", href: "#work-area-master-list" }
      : invalidPeopleCount > 0
        ? { label: "最大人数を確認", href: "#work-area-master-list" }
        : excludedCount > 0
          ? { label: "自動予定対象を確認", href: "#work-area-master-list" }
          : externalMismatchCount > 0
            ? { label: "外注設定を確認", href: "#work-area-master-list" }
            : { label: "能力確認へ進む", href: kitagoyaPath("/capacity-review") };
  const flowCards = [
    {
      label: "新規登録",
      count: "追加",
      detail: "作業場所を追加",
      href: "#work-area-create",
      tone: "info",
      Icon: Factory,
    },
    {
      label: "整備対象",
      count: needsActionCount,
      detail: `${readyCount}/${rows.length} 完了`,
      href: "#work-area-master-list",
      tone: needsActionCount > 0 ? "warn" : "success",
      Icon: ClipboardCheck,
    },
    {
      label: "標準時間",
      count: standardTimeMissingCount,
      detail: "未設定",
      href: "#work-area-master-list",
      tone: standardTimeMissingCount > 0 ? "warn" : "success",
      Icon: Clock,
    },
    {
      label: "配置人数",
      count: totalMaxPeople,
      detail: `${rows.length}場所の合計`,
      href: "#work-area-master-list",
      tone: invalidPeopleCount > 0 ? "warn" : "success",
      Icon: Users,
    },
    {
      label: "能力確認",
      count: "確認",
      detail: "商品能力へ",
      href: kitagoyaPath("/capacity-review"),
      tone: "info",
      Icon: Settings,
    },
  ];

  const tableRows = rows.map((row) => ({
    id: row.id,
    name: row.name,
    areaType: row.areaType,
    defaultStartTime: row.defaultStartTime,
    defaultEndTime: row.defaultEndTime,
    maxPeopleCount: row.maxPeopleCount,
    externalFlag: row.externalFlag,
    displayOrder: row.displayOrder,
    equipmentKind: row.equipmentKind,
    autoScheduleRole: row.autoScheduleRole,
    concurrentOperationAllowed: row.concurrentOperationAllowed,
    validFrom: row.validFrom ? row.validFrom.toISOString().slice(0, 10) : null,
    validTo: row.validTo ? row.validTo.toISOString().slice(0, 10) : null,
    note: row.note,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>作業場所マスター</h1>
        <div className="page-title-actions">
          <a className="button-link secondary-link" href="#work-area-create">
            <Factory size={16} aria-hidden="true" />
            新規場所
          </a>
          <Link className="button-link secondary-link" href={kitagoyaPath("/capacity-review")}>
            <Settings size={16} aria-hidden="true" />
            能力確認
          </Link>
          <Link className="button-link" href={kitagoyaPath("/production-plans/auto")}>
            <Table2 size={16} aria-hidden="true" />
            自動予定
          </Link>
          <HelpTooltip text="部屋名・外注先名はマスターで追加・変更できます。生産予定や能力設定ではここに登録した名称を使います。" />
        </div>
      </div>
      <div className="master-page-command">
        <div className="master-page-command-title">
          <span className={`badge ${needsActionCount > 0 ? "warn" : "success"}`}>
            {needsActionCount > 0 ? `整備が必要 ${needsActionCount}` : "整備済み"}
          </span>
          <strong>作業場所マスター整備フロー</strong>
          <span className="subtext">登録作業場所 {rows.length}件</span>
          <a className="master-page-next" href={nextAction.href}>
            次: {nextAction.label}
          </a>
        </div>
        <div className="master-page-checks">
          <span className={`badge ${standardTimeMissingCount > 0 ? "warn" : "success"}`}>
            標準時間 {standardTimeMissingCount}件
          </span>
          <span className={`badge ${invalidPeopleCount > 0 ? "warn" : "success"}`}>
            人数 {invalidPeopleCount}件
          </span>
          <span className={`badge ${excludedCount > 0 ? "warn" : "success"}`}>
            自動予定除外 {excludedCount}件
          </span>
          <span className={`badge ${concurrentBlockedCount > 0 ? "warn" : "success"}`}>
            同時稼働不可 {concurrentBlockedCount}件
          </span>
          <span className={`badge ${externalMismatchCount > 0 ? "warn" : "success"}`}>
            外注差異 {externalMismatchCount}件
          </span>
        </div>
      </div>
      <div className="master-flow-grid" aria-label="作業場所マスター整備フロー">
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
      <div className="work-area-summary-grid">
        <div className="metric">
          <div className="metric-label">登録作業場所</div>
          <div className="metric-value">{rows.length}件</div>
          <div className="metric-note">最大配置合計 {totalMaxPeople}人</div>
        </div>
        <div className="metric">
          <div className="metric-label">種別</div>
          <div className="metric-value work-area-summary-breakdown">
            <span>
              {areaTypeLabel("internal")} {areaTypeCounts.get("internal") ?? 0}件
            </span>
            <span>
              {areaTypeLabel("external")} {areaTypeCounts.get("external") ?? 0}件
            </span>
            <span>
              {areaTypeLabel("warehouse")} {areaTypeCounts.get("warehouse") ?? 0}件
            </span>
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">標準時間</div>
          <div className={`metric-value ${standardTimeMissingCount > 0 ? "warn-value" : ""}`}>
            {standardTimeConfiguredCount}件
          </div>
          <div className="metric-note">未設定 {standardTimeMissingCount}件</div>
        </div>
        <div className="metric">
          <div className="metric-label">稼働設定</div>
          <div className="metric-value work-area-summary-breakdown">
            <span>同時可 {concurrentAllowedCount}件</span>
            <span>不可 {concurrentBlockedCount}件</span>
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">自動予定</div>
          <div className="metric-value work-area-summary-breakdown">
            <span>
              {autoScheduleRoleLabel("ORDER_PRIMARY")} {autoScheduleRoleCounts.get("ORDER_PRIMARY") ?? 0}件
            </span>
            <span>
              {autoScheduleRoleLabel("STOCK_PRIMARY")} {autoScheduleRoleCounts.get("STOCK_PRIMARY") ?? 0}件
            </span>
            <span>
              {autoScheduleRoleLabel("SHARED")} {autoScheduleRoleCounts.get("SHARED") ?? 0}件
            </span>
            <span>
              除外 {autoScheduleRoleCounts.get("EXCLUDED") ?? 0}件
            </span>
          </div>
        </div>
      </div>
      <section id="work-area-create" className="anchor-offset">
        <MasterForm
          endpoint={kitagoyaApiPath("/work-areas")}
          kind="作業場所"
          fields={workAreaFields}
        />
      </section>
      <section id="work-area-master-list" className="anchor-offset">
        <WorkAreaCapacityTable rows={tableRows} />
      </section>
    </>
  );
}

function countBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  return rows.reduce((counts, row) => {
    const key = getKey(row);
    if (!key) return counts;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}
