import { describe, expect, it } from "vitest";
import { allocateDayStaff, type AllocationInput } from "./staff-allocation";

const staff = (id: string, name: string, start = "09:00", end = "17:00") => ({
  employeeId: id,
  employeeName: name,
  startTime: start,
  endTime: end,
});

const base: Omit<AllocationInput, "staff" | "jobs"> = {
  dayStart: "09:00",
  dayEnd: "17:00",
  stepMinutes: 5,
  breakWindows: [],
};

describe("allocateDayStaff", () => {
  it("仕事が有り余る場合、出勤者全員が遊休ゼロで働きあふれ数量が出る", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A"), staff("e2", "B")],
      jobs: [
        {
          jobId: "j1",
          productId: "p1",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          quantity: 10000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
    });

    expect(result.summary.totalIdleMinutes).toBe(0);
    expect(result.summary.fullyUtilized).toBe(true);
    // 2人 × 480分 = 960人分 → 960/60*100 = 1600袋
    expect(result.jobs[0].scheduledQuantity).toBe(1600);
    expect(result.jobs[0].overflowQuantity).toBe(8400);
    expect(result.summary.hasOverflow).toBe(true);
    for (const emp of result.employees) {
      expect(emp.workingMinutes).toBe(480);
      expect(emp.idleMinutes).toBe(0);
    }
  });

  it("作業が早く終わると残りの時間は『仕事なし』待機として明示される", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A"), staff("e2", "B"), staff("e3", "C"), staff("e4", "D")],
      jobs: [
        {
          jobId: "j1",
          productId: "p1",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          quantity: 400,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
    });

    // 400袋 ÷ (100×4人) = 1時間 → 09:00-10:00 で完了
    expect(result.jobs[0].scheduledQuantity).toBe(400);
    expect(result.jobs[0].overflowQuantity).toBe(0);
    expect(result.jobs[0].endTime).toBe("10:00");
    expect(result.summary.idleStaffCount).toBe(4);
    expect(result.summary.capacityBottleneck).toBe(false);
    for (const emp of result.employees) {
      expect(emp.workingMinutes).toBe(60);
      expect(emp.idleMinutes).toBe(420);
      expect(emp.idleSegments.every((seg) => seg.reason === "no_remaining_work")).toBe(true);
    }
  });

  it("部屋の同時人数上限で入れない人は『部屋満員』待機として検出される", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A"), staff("e2", "B"), staff("e3", "C"), staff("e4", "D")],
      jobs: [
        {
          jobId: "j1",
          productId: "p1",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "機械部屋",
          quantity: 100000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 2,
        },
      ],
    });

    expect(result.summary.capacityBottleneck).toBe(true);
    expect(result.summary.idleStaffCount).toBe(2);
    // 2人は終日フル稼働、2人は終日待機
    const working = result.employees.filter((e) => e.idleMinutes === 0);
    const idle = result.employees.filter((e) => e.workingMinutes === 0);
    expect(working).toHaveLength(2);
    expect(idle).toHaveLength(2);
    expect(idle[0].idleSegments.every((seg) => seg.reason === "room_capacity_full")).toBe(true);
  });

  it("2部屋並行で、片方が終わると空いた人が合流(移動)する", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A"), staff("e2", "B"), staff("e3", "C"), staff("e4", "D")],
      jobs: [
        {
          jobId: "jA",
          productId: "pA",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          workAreaDisplayOrder: 1,
          quantity: 200,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 2,
        },
        {
          jobId: "jB",
          productId: "pB",
          productName: "商品B",
          workAreaId: "room2",
          workAreaName: "機械部屋",
          workAreaDisplayOrder: 2,
          quantity: 1200,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
    });

    const jobA = result.jobs.find((j) => j.jobId === "jA")!;
    const jobB = result.jobs.find((j) => j.jobId === "jB")!;
    // 商品A: 2人で200袋 → 1時間で10:00完了
    expect(jobA.scheduledQuantity).toBe(200);
    expect(jobA.endTime).toBe("10:00");
    // 商品B: Aが空いた10:00以降は4人に増えて合流
    expect(jobB.peopleSegments.some((seg) => seg.startTime === "10:00" && seg.peopleCount === 4)).toBe(true);
    expect(jobB.scheduledQuantity).toBe(1200);
    // どちらも作りきれるので overflow なし
    expect(result.summary.hasOverflow).toBe(false);
    // 合流＝room1からroom2へ移った人が存在する
    const moved = result.employees.find(
      (e) => e.segments.some((s) => s.workAreaId === "room1") && e.segments.some((s) => s.workAreaId === "room2"),
    );
    expect(moved).toBeDefined();
  });

  it("手動ピンで指定した人は自動配置を上書きして指定の部屋に固定される", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A")],
      jobs: [
        {
          jobId: "jA",
          productId: "pA",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          workAreaDisplayOrder: 1,
          quantity: 100000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
        {
          jobId: "jB",
          productId: "pB",
          productName: "商品B",
          workAreaId: "room2",
          workAreaName: "機械部屋",
          workAreaDisplayOrder: 2,
          quantity: 100000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
      // ピンが無ければ displayOrder の小さい room1 に入るが、room2 にピン
      pinnedAssignments: [{ employeeId: "e1", workAreaId: "room2", startTime: "09:00", endTime: "17:00" }],
    });

    const jobA = result.jobs.find((j) => j.jobId === "jA")!;
    const jobB = result.jobs.find((j) => j.jobId === "jB")!;
    expect(jobA.scheduledQuantity).toBe(0);
    expect(jobB.scheduledQuantity).toBeGreaterThan(0);
    expect(result.employees[0].segments.every((s) => s.workAreaId === "room2")).toBe(true);
  });

  it("ピンされた人は他に仕事が残っていても自動で別部屋へ移らない", () => {
    const result = allocateDayStaff({
      ...base,
      staff: [staff("e1", "A")],
      jobs: [
        {
          jobId: "jA",
          productId: "pA",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          workAreaDisplayOrder: 1,
          quantity: 200,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
        {
          jobId: "jB",
          productId: "pB",
          productName: "商品B",
          workAreaId: "room2",
          workAreaName: "機械部屋",
          workAreaDisplayOrder: 2,
          quantity: 100000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
      pinnedAssignments: [{ employeeId: "e1", workAreaId: "room1", startTime: "09:00", endTime: "17:00" }],
    });

    const jobA = result.jobs.find((j) => j.jobId === "jA")!;
    const jobB = result.jobs.find((j) => j.jobId === "jB")!;
    // room1 の 200袋を1人で 09:00-11:00 に作り、その後は room2 に仕事が残っていても移らず手すき
    expect(jobA.scheduledQuantity).toBe(200);
    expect(jobA.endTime).toBe("11:00");
    expect(jobB.scheduledQuantity).toBe(0);
    const emp = result.employees[0];
    expect(emp.workingMinutes).toBe(120);
    expect(emp.idleMinutes).toBe(360);
    expect(emp.segments.every((s) => s.workAreaId === "room1")).toBe(true);
  });

  it("休憩時間帯は作業せず、待機(idle)ともカウントされない", () => {
    const result = allocateDayStaff({
      ...base,
      breakWindows: [{ startTime: "12:00", endTime: "13:00" }],
      staff: [staff("e1", "A")],
      jobs: [
        {
          jobId: "j1",
          productId: "p1",
          productName: "商品A",
          workAreaId: "room1",
          workAreaName: "一般部屋",
          quantity: 100000,
          unit: "袋",
          unitsPerPersonHour: 100,
          roomMaxPeople: 4,
        },
      ],
    });

    const emp = result.employees[0];
    expect(emp.breakMinutes).toBe(60);
    expect(emp.idleMinutes).toBe(0);
    // 在席480分 - 休憩60分 = 420分作業
    expect(emp.workingMinutes).toBe(420);
  });
});
