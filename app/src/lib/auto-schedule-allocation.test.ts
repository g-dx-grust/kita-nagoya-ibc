import { describe, expect, it } from "vitest";
import { assignBalancedRooms } from "./auto-schedule-allocation";
import { allocateDayStaff, type AllocationJob } from "./staff-allocation";

type Cap = { workAreaId: string };

describe("assignBalancedRooms", () => {
  it("全商品が同じ部屋候補でも、商品を複数部屋へ散らして配分する", () => {
    // 4商品とも room1(既定),room2,room3 が使える → 並行稼働のため散らす
    const cands: Cap[] = [{ workAreaId: "room1" }, { workAreaId: "room2" }, { workAreaId: "room3" }];
    const items = [{ tempId: "t1" }, { tempId: "t2" }, { tempId: "t3" }, { tempId: "t4" }];
    const map = new Map(items.map((i) => [i.tempId, cands]));

    const result = assignBalancedRooms(items, map);
    expect(result.get("t1")?.workAreaId).toBe("room1"); // 先頭=既定優先
    expect(result.get("t2")?.workAreaId).toBe("room2");
    expect(result.get("t3")?.workAreaId).toBe("room3");
    expect(result.get("t4")?.workAreaId).toBe("room1"); // 一巡して再びroom1

    const counts = new Map<string, number>();
    for (const c of result.values()) counts.set(c.workAreaId, (counts.get(c.workAreaId) ?? 0) + 1);
    expect(counts.get("room1")).toBe(2);
    expect(counts.get("room2")).toBe(1);
    expect(counts.get("room3")).toBe(1);
  });

  it("候補が無い商品は割り当てない", () => {
    const items = [{ tempId: "t1" }, { tempId: "t2" }];
    const map = new Map<string, Cap[]>([["t1", [{ workAreaId: "room1" }]]]);
    const result = assignBalancedRooms(items, map);
    expect(result.get("t1")?.workAreaId).toBe("room1");
    expect(result.has("t2")).toBe(false);
  });

  it("部屋の強制指定(override)があればそれを優先する", () => {
    const cands: Cap[] = [{ workAreaId: "room1" }, { workAreaId: "room2" }];
    const items = [{ tempId: "t1" }, { tempId: "t2" }];
    const map = new Map(items.map((i) => [i.tempId, cands]));
    const forced = new Map([["t1", "room2"]]);
    const result = assignBalancedRooms(items, map, forced);
    expect(result.get("t1")?.workAreaId).toBe("room2");
  });
});

describe("自動作成(最大数量)の遊休ゼロ統合", () => {
  // 部屋候補(3部屋・各上限4名)。商品はどの部屋でも作れる想定。
  const rooms = ["room1", "room2", "room3"];
  const cands = rooms.map((workAreaId, i) => ({ workAreaId, displayOrder: i + 1 }));
  const staff = Array.from({ length: 12 }, (_, i) => ({
    employeeId: `e${i + 1}`,
    employeeName: `E${i + 1}`,
    startTime: "09:00",
    endTime: "17:00",
  }));

  function buildJobs(roomByTemp: Map<string, { workAreaId: string; displayOrder: number }>, items: { tempId: string }[]): AllocationJob[] {
    return items.map((item, index) => {
      const room = roomByTemp.get(item.tempId)!;
      return {
        jobId: item.tempId,
        productId: `p${index}`,
        productName: `商品${index}`,
        workAreaId: room.workAreaId,
        workAreaName: room.workAreaId,
        workAreaDisplayOrder: room.displayOrder,
        quantity: 100000, // 有り余る量
        unit: "袋",
        unitsPerPersonHour: 100,
        roomMaxPeople: 4,
      } satisfies AllocationJob;
    });
  }

  it("出勤者全員(12名)が複数部屋へ並行配置され遊休ゼロになる", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ tempId: `preview-${i + 1}` }));
    const map = new Map(items.map((i) => [i.tempId, cands]));
    const chosen = assignBalancedRooms(items, map); // 3部屋に2件ずつ散る
    const allocation = allocateDayStaff({
      dayStart: "09:00",
      dayEnd: "17:00",
      breakWindows: [],
      staff,
      jobs: buildJobs(chosen, items),
    });
    // 3部屋×4名=12名が全員フル稼働
    expect(allocation.summary.totalStaff).toBe(12);
    expect(allocation.summary.fullyUtilized).toBe(true);
    expect(allocation.summary.totalIdleMinutes).toBe(0);
  });

  it("対比: 全商品を1部屋に固めると上限4名しか働けず8名が遊休になる", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ tempId: `preview-${i + 1}` }));
    // 全件 room1 に強制 → 1部屋に集中
    const map = new Map(items.map((i) => [i.tempId, cands]));
    const forced = new Map(items.map((i) => [i.tempId, "room1"]));
    const chosen = assignBalancedRooms(items, map, forced);
    const allocation = allocateDayStaff({
      dayStart: "09:00",
      dayEnd: "17:00",
      breakWindows: [],
      staff,
      jobs: buildJobs(chosen, items),
    });
    expect(allocation.summary.idleStaffCount).toBe(8);
    expect(allocation.summary.capacityBottleneck).toBe(true);
  });
});
