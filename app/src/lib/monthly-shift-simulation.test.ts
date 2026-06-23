import { describe, expect, it } from "vitest";
import { simulateMonthlyShiftSchedule, type ShiftSimulationProduct } from "./monthly-shift-simulation";

const product: ShiftSimulationProduct = {
  productId: "p1",
  productCode: "P001",
  productName: "商品A",
  productionType: "stock",
  unit: "袋",
  defaultWorkAreaId: "room1",
  capacities: [
    {
      productId: "p1",
      workAreaId: "room1",
      workAreaName: "一般部屋",
      workAreaDefaultStartTime: "09:00",
      workAreaDefaultEndTime: "17:00",
      workAreaMaxPeopleCount: 2,
      workAreaDisplayOrder: 1,
      unitsPerPersonHour: 100,
      standardPeople: 2,
      standardBreakMinutes: 0,
    },
  ],
};

function productWithTwoRooms(productId: string, productCode: string, productName: string): ShiftSimulationProduct {
  return {
    productId,
    productCode,
    productName,
    productionType: "stock",
    unit: "袋",
    defaultWorkAreaId: "room1",
    capacities: [
      {
        productId,
        workAreaId: "room1",
        workAreaName: "一般部屋",
        workAreaDefaultStartTime: "09:00",
        workAreaDefaultEndTime: "17:00",
        workAreaMaxPeopleCount: 2,
        workAreaDisplayOrder: 1,
        unitsPerPersonHour: 100,
        standardPeople: 2,
        standardBreakMinutes: 0,
      },
      {
        productId,
        workAreaId: "room2",
        workAreaName: "機械部屋",
        workAreaDefaultStartTime: "09:00",
        workAreaDefaultEndTime: "17:00",
        workAreaMaxPeopleCount: 2,
        workAreaDisplayOrder: 2,
        unitsPerPersonHour: 100,
        standardPeople: 2,
        standardBreakMinutes: 0,
      },
    ],
  };
}

describe("simulateMonthlyShiftSchedule", () => {
  it("実シフトの1日能力を超える数量を複数日の仮予定へ分割する", () => {
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-03"],
          quantity: 2000,
          reasons: ["在庫不足"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e1", employeeName: "A", date: "2026-05-02", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-02", startTime: "09:00", endTime: "17:00" },
      ],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.plans).toHaveLength(2);
    expect(result.plans[0]).toMatchObject({ date: "2026-05-01", quantity: 1350, peopleCount: 2 });
    expect(result.plans[1]).toMatchObject({ date: "2026-05-02", quantity: 650, peopleCount: 2 });
    expect(result.skipped).toHaveLength(0);
  });

  it("schedulePriority が小さい商品を優先して先に配置する", () => {
    const mk = (id: string, code: string, name: string): ShiftSimulationProduct => ({
      productId: id,
      productCode: code,
      productName: name,
      productionType: "stock",
      unit: "袋",
      defaultWorkAreaId: "room1",
      capacities: [
        {
          productId: id,
          workAreaId: "room1",
          workAreaName: "一般部屋",
          workAreaDefaultStartTime: "09:00",
          workAreaDefaultEndTime: "10:00",
          workAreaMaxPeopleCount: 1,
          workAreaDisplayOrder: 1,
          unitsPerPersonHour: 100,
          standardPeople: 1,
          standardBreakMinutes: 0,
        },
      ],
    });
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "10:00", // 1人×1時間×100/人時 = 1日100袋しか作れない
      products: [mk("p1", "P001", "コード先頭の商品"), mk("p2", "P002", "優先度1の商品")],
      items: [
        // P001 は商品コードが先だが優先度は低い(2)。P002 は優先度1。
        {
          productId: "p1",
          productCode: "P001",
          productName: "コード先頭の商品",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 100,
          schedulePriority: 2,
          reasons: [],
        },
        {
          productId: "p2",
          productCode: "P002",
          productName: "優先度1の商品",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 100,
          schedulePriority: 1,
          reasons: [],
        },
      ],
      shifts: [{ employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "10:00" }],
      existingPlans: [],
      existingAssignments: [],
    });

    // 容量は1日100袋。優先度1の P002 が先に配置され、P001 は積み残し(skipped)。
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].productCode).toBe("P002");
    expect(result.skipped.map((s) => s.productCode)).toContain("P001");
  });

  it("出勤シフトがない場合は仮予定にせず未配置にする", () => {
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 100,
          reasons: ["在庫不足"],
        },
      ],
      shifts: [],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.plans).toHaveLength(0);
    expect(result.skipped[0].remainingQuantity).toBe(100);
  });

  it("標準人数を超えて出勤していても部屋の同時人数上限まで詰める（遊休ゼロ）", () => {
    // 標準人数2だが、部屋上限4・出勤4名。従来は2名しか割り当てず2名が遊休だったが、
    // 当日エンジンに寄せたことで上限4名まで詰めて1日で作りきる。
    const wideRoomProduct: ShiftSimulationProduct = {
      ...product,
      capacities: [{ ...product.capacities[0], workAreaMaxPeopleCount: 4, standardPeople: 2 }],
    };
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      products: [wideRoomProduct],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 2400,
          reasons: ["在庫不足"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e3", employeeName: "C", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e4", employeeName: "D", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
      ],
      existingPlans: [],
      existingAssignments: [],
    });

    // 4名 × 100/人時 × 6.75稼働時間 = 2700 まで作れるので 2400 を1日で完了
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({ date: "2026-05-01", quantity: 2400, peopleCount: 4 });
    expect(result.plans[0].assignedEmployees).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);
  });

  it("既存割当で塞がっている出勤者は二重割当しない", () => {
    // e1 は別の確定予定で 09:00-17:00 塞がっている。残る e2 の1名分しか割り当てられない。
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 200,
          reasons: ["在庫不足"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
      ],
      existingPlans: [],
      existingAssignments: [
        { employeeId: "e1", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
      ],
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].peopleCount).toBe(1);
    expect(result.plans[0].assignedEmployees).toEqual([{ employeeId: "e2", employeeName: "B" }]);
  });

  it("既存予定がある部屋は空き時間から配置する", () => {
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 300,
          reasons: ["在庫不足"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
      ],
      existingPlans: [{ date: "2026-05-01", workAreaId: "room1", startTime: "09:00", endTime: "12:00" }],
      existingAssignments: [],
    });

    expect(result.plans[0]).toMatchObject({ startTime: "13:00", endTime: "14:30", quantity: 300 });
  });

  it("複数商品が同じ既定部屋を持つ場合でも候補部屋へ分散して同日並行配置する", () => {
    const productA = productWithTwoRooms("p1", "P001", "商品A");
    const productB = productWithTwoRooms("p2", "P002", "商品B");
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "10:00",
      breakWindows: [],
      products: [productA, productB],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 200,
          reasons: ["月間予測"],
        },
        {
          productId: "p2",
          productCode: "P002",
          productName: "商品B",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 200,
          reasons: ["月間予測"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "10:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "10:00" },
        { employeeId: "e3", employeeName: "C", date: "2026-05-01", startTime: "09:00", endTime: "10:00" },
        { employeeId: "e4", employeeName: "D", date: "2026-05-01", startTime: "09:00", endTime: "10:00" },
      ],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.plans).toHaveLength(2);
    expect(result.plans.map((plan) => plan.workAreaId).sort()).toEqual(["room1", "room2"]);
    expect(result.plans.map((plan) => plan.quantity).sort((a, b) => a - b)).toEqual([200, 200]);
  });

  it("受注生産を受注優先部屋で先に回し、完了後に在庫優先部屋へ合流する", () => {
    const makeProduct = (
      productId: string,
      productCode: string,
      productName: string,
      productionType: "stock" | "make_to_order",
    ): ShiftSimulationProduct => ({
      productId,
      productCode,
      productName,
      productionType,
      unit: "袋",
      defaultWorkAreaId: "order-room",
      capacities: [
        {
          productId,
          workAreaId: "order-room",
          workAreaName: "受注優先部屋",
          workAreaDefaultStartTime: "09:00",
          workAreaDefaultEndTime: "12:00",
          workAreaMaxPeopleCount: 2,
          workAreaDisplayOrder: 1,
          workAreaAutoScheduleRole: "ORDER_PRIMARY",
          unitsPerPersonHour: 100,
          standardPeople: 2,
          standardBreakMinutes: 0,
        },
        {
          productId,
          workAreaId: "stock-room",
          workAreaName: "在庫優先部屋",
          workAreaDefaultStartTime: "09:00",
          workAreaDefaultEndTime: "12:00",
          workAreaMaxPeopleCount: 4,
          workAreaDisplayOrder: 2,
          workAreaAutoScheduleRole: "STOCK_PRIMARY",
          unitsPerPersonHour: 100,
          standardPeople: 4,
          standardBreakMinutes: 0,
        },
      ],
    });

    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "12:00",
      breakWindows: [],
      products: [
        makeProduct("order", "O001", "受注商品", "make_to_order"),
        makeProduct("stock", "S001", "在庫商品", "stock"),
      ],
      items: [
        {
          productId: "stock",
          productCode: "S001",
          productName: "在庫商品",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 200,
          reasons: ["月間予測"],
        },
        {
          productId: "order",
          productCode: "O001",
          productName: "受注商品",
          productionType: "make_to_order",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 200,
          reasons: ["受注"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "12:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "12:00" },
        { employeeId: "e3", employeeName: "C", date: "2026-05-01", startTime: "09:00", endTime: "12:00" },
        { employeeId: "e4", employeeName: "D", date: "2026-05-01", startTime: "09:00", endTime: "12:00" },
      ],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.plans).toHaveLength(2);
    const orderPlan = result.plans.find((plan) => plan.productId === "order")!;
    const stockPlan = result.plans.find((plan) => plan.productId === "stock")!;
    expect(orderPlan).toMatchObject({
      workAreaId: "order-room",
      startTime: "09:00",
      endTime: "10:00",
      peopleCount: 2,
    });
    expect(stockPlan).toMatchObject({
      workAreaId: "stock-room",
      startTime: "10:00",
      peopleCount: 4,
    });
  });

  it("商品ごとの候補順位がある場合は第1候補の部屋を優先する", () => {
    const prioritizedProduct = productWithTwoRooms("p1", "P001", "商品A");
    prioritizedProduct.capacities = prioritizedProduct.capacities.map((capacity) => ({
      ...capacity,
      candidatePriority: capacity.workAreaId === "room2" ? 1 : 2,
    }));
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "10:00",
      breakWindows: [],
      products: [prioritizedProduct],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 100,
          reasons: ["月間予測"],
        },
      ],
      shifts: [{ employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "10:00" }],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.plans[0].workAreaId).toBe("room2");
  });

  it("午後に既存予定がある部屋でも午前の空き枠へ配置する", () => {
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
      defaultStartTime: "09:00",
      baselineEndTime: "17:00",
      breakWindows: [],
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 400,
          reasons: ["月間予測"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
        { employeeId: "e2", employeeName: "B", date: "2026-05-01", startTime: "09:00", endTime: "17:00" },
      ],
      existingPlans: [{ date: "2026-05-01", workAreaId: "room1", startTime: "15:00", endTime: "17:00" }],
      existingAssignments: [],
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.plans[0]).toMatchObject({ startTime: "09:00", endTime: "11:00", quantity: 400 });
  });

  it("同じ商品の複数日候補を内部IDで分けて、別日予定として扱う", () => {
    const result = simulateMonthlyShiftSchedule({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
      defaultStartTime: "09:00",
      baselineEndTime: "10:00",
      breakWindows: [],
      products: [product],
      items: [
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-01",
          dueDates: ["2026-05-01"],
          quantity: 100,
          reasons: ["5/1分"],
        },
        {
          productId: "p1",
          productCode: "P001",
          productName: "商品A",
          productionType: "stock",
          unit: "袋",
          preferredDate: "2026-05-02",
          dueDates: ["2026-05-02"],
          quantity: 100,
          reasons: ["5/2分"],
        },
      ],
      shifts: [
        { employeeId: "e1", employeeName: "A", date: "2026-05-01", startTime: "09:00", endTime: "10:00" },
        { employeeId: "e1", employeeName: "A", date: "2026-05-02", startTime: "09:00", endTime: "10:00" },
      ],
      existingPlans: [],
      existingAssignments: [],
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.plans.map((plan) => ({ date: plan.date, dueDates: plan.dueDates }))).toEqual([
      { date: "2026-05-01", dueDates: ["2026-05-01"] },
      { date: "2026-05-02", dueDates: ["2026-05-02"] },
    ]);
  });
});
