import { HelpTooltip } from "@/components/ui/help-tooltip";
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
      <MasterForm
        endpoint={kitagoyaApiPath("/work-areas")}
        kind="作業場所"
        fields={workAreaFields}
      />
      <WorkAreaCapacityTable rows={tableRows} />
    </>
  );
}
