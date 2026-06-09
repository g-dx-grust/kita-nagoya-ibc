export const MOVEMENT_TYPE = {
  OPENING: "opening",
  PLANNED_RESERVE: "planned_reserve",
  ACTUAL_CONSUME: "actual_consume",
  INBOUND: "inbound",
  SHIPMENT_OUT: "shipment_out", // 手入力の出庫/出荷
  ADJUSTMENT: "adjustment",
  TRANSFER: "transfer",

  PLANNED_PRODUCTION_IN: "PLANNED_PRODUCTION_IN",
  PLANNED_MATERIAL_USE: "PLANNED_MATERIAL_USE",
  PLANNED_SHIPMENT_OUT: "PLANNED_SHIPMENT_OUT",
  ACTUAL_PRODUCTION_IN: "ACTUAL_PRODUCTION_IN",
  ACTUAL_MATERIAL_USE: "ACTUAL_MATERIAL_USE",
  ACTUAL_SHIPMENT_OUT: "ACTUAL_SHIPMENT_OUT",
  INBOUND_CONFIRMED: "INBOUND_CONFIRMED",
  INBOUND_UNCONFIRMED: "INBOUND_UNCONFIRMED",
} as const;

export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE];

export const INVENTORY_LEDGER_STATUS = {
  PLANNED: "PLANNED",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const;

export type InventoryLedgerStatusValue =
  (typeof INVENTORY_LEDGER_STATUS)[keyof typeof INVENTORY_LEDGER_STATUS];

// 在庫の手入力(管理者)で作られた StockMovement を識別する sourceType。
// 自動生成(生産予定/日報/発注)と区別し、手入力分だけを一覧・削除できるようにする。
export const MANUAL_INVENTORY_SOURCE_TYPE = "manual_inventory";

// 日報蓄積(ProductionDailyReportEntry)の保存で生成する実績在庫の sourceType。
// 生産予定連動日報(daily_report)とは別系統で、二重計上を避けるため独立して識別する。
export const PRODUCTION_DAILY_REPORT_SOURCE = "production_daily_report";
