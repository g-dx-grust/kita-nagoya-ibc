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
    concurrentOperationAllowed: row.concurrentOperationAllowed,
    validFrom: row.validFrom ? row.validFrom.toISOString().slice(0, 10) : null,
    validTo: row.validTo ? row.validTo.toISOString().slice(0, 10) : null,
    note: row.note,
  }));

  return (
    <>
      <h1>作業場所マスター</h1>
      <p className="section-note">
        部屋名・外注先名は文字起こし上の表記が不確実なため、ここで自由に追加・変更してください。
      </p>
      <MasterForm
        endpoint={kitagoyaApiPath("/work-areas")}
        kind="作業場所"
        fields={workAreaFields}
      />
      <WorkAreaCapacityTable rows={tableRows} />
    </>
  );
}
