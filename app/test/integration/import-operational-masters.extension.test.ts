import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as IMPORT_CAPACITIES } from "@/app/api/import/capacities/route";
import { POST as IMPORT_SHIFTS } from "@/app/api/import/shifts/route";
import { POST as IMPORT_WORK_AREAS } from "@/app/api/import/work-areas/route";
import { GET as TEMPLATE } from "@/app/api/export/master-template/route";
import { cleanupAll } from "../helpers/cleanup";
import { createTestProduct, createTestWorkArea } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Operational master CSV imports (integration)", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("imports work area extension columns", async () => {
    const csv = [
      "name,area_type,default_start_time,default_end_time,max_people_count,display_order,external_flag,note,equipment_kind,concurrent_operation_allowed,valid_from,valid_to",
      "CSV作業場所,internal,09:00,17:00,4,1,false,,MACHINE,false,2026-01-01,",
    ].join("\n");

    const response = await IMPORT_WORK_AREAS(
      new Request("http://test.local/api/import/work-areas", { method: "POST", body: csv }),
    );
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const workArea = await prisma.workArea.findUnique({ where: { name: "CSV作業場所" } });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(workArea).toMatchObject({
      equipmentKind: "MACHINE",
      concurrentOperationAllowed: false,
    });
  });

  it("imports capacity extension columns", async () => {
    const product = await createTestProduct(prisma, { productCode: "PCAP001" });
    const workArea = await createTestWorkArea(prisma, { name: "能力CSV部屋" });
    const csv = [
      "product_code,product_name,work_area_name,units_per_person_hour,standard_people,standard_break_minutes,candidate_priority,note,source_type,locked,valid_from,valid_to",
      "PCAP001,,能力CSV部屋,120,3,0,2,,DAILY_REPORT_MEDIAN,true,2026-01-01,",
    ].join("\n");

    const response = await IMPORT_CAPACITIES(
      new Request("http://test.local/api/import/capacities", { method: "POST", body: csv }),
    );
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const capacity = await prisma.productionCapacity.findUnique({
      where: { productId_workAreaId: { productId: product.id, workAreaId: workArea.id } },
    });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(capacity).toMatchObject({
      sourceType: "DAILY_REPORT_MEDIAN",
      locked: true,
      unitsPerPersonHour: 120,
      candidatePriority: 2,
    });
  });

  it("imports shifts and resolves shift_pattern_name", async () => {
    const pattern = await prisma.shiftPattern.create({
      data: { name: "CSV標準", startTime: "09:00", endTime: "17:00" },
    });
    // シフト取込は社員マスターを破壊しない方針: 既存社員(正式名称)にのみ紐付け、
    // 未知の手入力名は勝手に新規作成せずスキップする。よって対象社員を先に登録する。
    await prisma.employee.create({ data: { name: "CSV従業員" } });
    const csv = [
      "employee_name,date,start_time,end_time,break_minutes,status,shift_pattern_name",
      "CSV従業員,2026-05-20,09:00,17:00,60,confirmed,CSV標準",
    ].join("\n");

    const response = await IMPORT_SHIFTS(
      new Request("http://test.local/api/import/shifts", { method: "POST", body: csv }),
    );
    const result = (await response.json()) as { imported: number; errors: unknown[] };
    const employee = await prisma.employee.findFirst({ where: { name: "CSV従業員" } });
    const shift = employee
      ? await prisma.shift.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date: new Date("2026-05-20") } },
        })
      : null;

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(shift?.shiftPatternId).toBe(pattern.id);
  });

  it("exposes new operational master templates", async () => {
    for (const type of ["work-areas", "capacities", "shifts", "shift-patterns", "shift-breaks"]) {
      const response = await TEMPLATE(
        new Request(`http://test.local/api/export/master-template?type=${type}`),
      );
      expect(response.status).toBe(200);
    }
  });
});
