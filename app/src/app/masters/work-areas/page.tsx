import { HelpTooltip } from "@/components/ui/help-tooltip";
import { areaTypeLabel, autoScheduleRoleLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { kitagoyaApiPath } from "@/lib/paths";
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
          <HelpTooltip text="部屋名・外注先名はマスターで追加・変更できます。生産予定や能力設定ではここに登録した名称を使います。" />
        </div>
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
      <MasterForm
        endpoint={kitagoyaApiPath("/work-areas")}
        kind="作業場所"
        fields={workAreaFields}
      />
      <WorkAreaCapacityTable rows={tableRows} />
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
