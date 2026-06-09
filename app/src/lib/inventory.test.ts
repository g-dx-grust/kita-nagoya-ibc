import { describe, expect, it } from "vitest";
import { summarizeInventorySnapshots } from "./inventory";
import { INVENTORY_LEDGER_STATUS, MOVEMENT_TYPE } from "./inventory-types";

describe("summarizeInventorySnapshots", () => {
  it("separates confirmed, planned in, planned out, and theoretical stock", () => {
    const snapshots = summarizeInventorySnapshots(
      ["p1"],
      [
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.OPENING,
          quantity: 100,
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        },
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.PLANNED_PRODUCTION_IN,
          quantity: 40,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
        },
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.PLANNED_SHIPMENT_OUT,
          quantity: -25,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
        },
      ],
    );

    expect(snapshots.p1).toMatchObject({
      onHand: 100,
      plannedIn: 40,
      plannedOut: 25,
      theoreticalStock: 115,
    });
  });

  it("excludes cancelled rows from every stock bucket", () => {
    const snapshots = summarizeInventorySnapshots(
      ["rm1"],
      [
        {
          itemId: "rm1",
          movementType: MOVEMENT_TYPE.OPENING,
          quantity: 10,
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        },
        {
          itemId: "rm1",
          movementType: MOVEMENT_TYPE.PLANNED_MATERIAL_USE,
          quantity: -10,
          status: INVENTORY_LEDGER_STATUS.CANCELLED,
        },
      ],
    );

    expect(snapshots.rm1).toMatchObject({
      onHand: 10,
      plannedIn: 0,
      plannedOut: 0,
      theoreticalStock: 10,
    });
  });

  it("separates confirmed and unconfirmed inbound without double-counting synced purchase orders", () => {
    const snapshots = summarizeInventorySnapshots(
      ["rm1"],
      [
        {
          itemId: "rm1",
          movementType: MOVEMENT_TYPE.INBOUND_UNCONFIRMED,
          quantity: 20,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
          sourceType: "purchase_order",
          sourceId: "po-synced",
        },
      ],
      [
        {
          id: "po-synced",
          itemId: "rm1",
          orderedQuantity: 20,
          confirmedQuantity: null,
          status: "ordered_unconfirmed",
        },
        {
          id: "po-unsynced",
          itemId: "rm1",
          orderedQuantity: 30,
          confirmedQuantity: 25,
          status: "confirmed",
        },
      ],
    );

    expect(snapshots.rm1).toMatchObject({
      plannedIn: 45,
      confirmedInbound: 25,
      unconfirmedInbound: 20,
      theoreticalStock: 45,
    });
  });

  it("keeps PLANNED production_plan rows by default (no superseding) so behavior is unchanged", () => {
    const product = summarizeInventorySnapshots(
      ["p1"],
      [
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.PLANNED_PRODUCTION_IN,
          quantity: 10,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
          sourceType: "production_plan",
          sourceId: "plan-1",
        },
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.ACTUAL_PRODUCTION_IN,
          quantity: 10,
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          sourceType: "daily_report",
          sourceId: "report-1",
        },
      ],
    );

    // Without supersededPlanIds the PLANNED row is counted -> planned + actual = 20.
    expect(product.p1).toMatchObject({
      onHand: 10,
      plannedIn: 10,
      plannedOut: 0,
      theoreticalStock: 20,
    });
  });

  it("skips a completed plan's PLANNED production_plan rows when superseded (no double-count)", () => {
    const product = summarizeInventorySnapshots(
      ["p1"],
      [
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.PLANNED_PRODUCTION_IN,
          quantity: 10,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
          sourceType: "production_plan",
          sourceId: "plan-1", // product PLANNED rows use the bare planId
        },
        {
          itemId: "p1",
          movementType: MOVEMENT_TYPE.ACTUAL_PRODUCTION_IN,
          quantity: 10,
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          sourceType: "daily_report",
          sourceId: "report-1",
        },
      ],
      [],
      new Set(["plan-1"]),
    );

    // PLANNED superseded -> theoretical stock equals the actual-only figure (10, not 20).
    expect(product.p1).toMatchObject({
      onHand: 10,
      plannedIn: 0,
      plannedOut: 0,
      theoreticalStock: 10,
    });

    const material = summarizeInventorySnapshots(
      ["rm1"],
      [
        {
          itemId: "rm1",
          movementType: MOVEMENT_TYPE.PLANNED_MATERIAL_USE,
          quantity: -3,
          status: INVENTORY_LEDGER_STATUS.PLANNED,
          sourceType: "production_plan",
          // material PLANNED rows use sourceId of the form planId:itemType:itemId:index
          sourceId: "plan-1:raw_material:rm1:0",
        },
        {
          itemId: "rm1",
          movementType: MOVEMENT_TYPE.ACTUAL_MATERIAL_USE,
          quantity: -3,
          status: INVENTORY_LEDGER_STATUS.CONFIRMED,
          sourceType: "daily_report",
          sourceId: "report-1:raw_material:rm1:0",
        },
      ],
      [],
      new Set(["plan-1"]),
    );

    // PLANNED_MATERIAL_USE -3 + ACTUAL_MATERIAL_USE -3 -> -3, NOT -6.
    expect(material.rm1).toMatchObject({
      onHand: -3,
      plannedIn: 0,
      plannedOut: 0,
      theoreticalStock: -3,
    });
  });
});
