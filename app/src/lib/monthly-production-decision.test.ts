import { describe, expect, it } from "vitest";
import { computeDemandPlanCoverage } from "./monthly-production-decision";

describe("computeDemandPlanCoverage", () => {
  it("allocates make-to-order plans to open demands by due date", () => {
    const rows = computeDemandPlanCoverage({
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      demands: [
        { id: "d1", productId: "p1", dueDate: "2026-06-10", demandType: "order", quantity: 80, status: "open" },
        { id: "d2", productId: "p1", dueDate: "2026-06-20", demandType: "order", quantity: 50, status: "open" },
      ],
      plans: [
        { id: "plan1", productId: "p1", date: "2026-06-08", productionType: "make_to_order", plannedQuantity: 100, status: "draft" },
        { id: "plan2", productId: "p1", date: "2026-06-18", productionType: "make_to_order", plannedQuantity: 30, status: "confirmed" },
      ],
    });

    expect(rows).toMatchObject([
      { id: "d1", plannedQuantity: 80, remainingQuantity: 0, coverageStatus: "covered" },
      { id: "d2", plannedQuantity: 50, remainingQuantity: 0, coverageStatus: "covered" },
    ]);
  });

  it("does not use production scheduled after the demand due date", () => {
    const rows = computeDemandPlanCoverage({
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      demands: [
        { id: "d1", productId: "p1", dueDate: "2026-06-10", demandType: "order", quantity: 60, status: "open" },
      ],
      plans: [
        { id: "plan1", productId: "p1", date: "2026-06-12", productionType: "make_to_order", plannedQuantity: 60, status: "draft" },
      ],
    });

    expect(rows[0]).toMatchObject({ plannedQuantity: 0, remainingQuantity: 60, coverageStatus: "unplanned" });
  });

  it("ignores stock plans and cancelled plans for order coverage", () => {
    const rows = computeDemandPlanCoverage({
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      demands: [
        { id: "d1", productId: "p1", dueDate: "2026-06-10", demandType: "order", quantity: 60, status: "open" },
      ],
      plans: [
        { id: "stock", productId: "p1", date: "2026-06-08", productionType: "stock", plannedQuantity: 60, status: "draft" },
        { id: "cancelled", productId: "p1", date: "2026-06-08", productionType: "make_to_order", plannedQuantity: 60, status: "cancelled" },
      ],
    });

    expect(rows[0]).toMatchObject({ plannedQuantity: 0, remainingQuantity: 60, coverageStatus: "unplanned" });
  });
});
