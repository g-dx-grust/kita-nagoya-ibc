import type { MasterField } from "../master-form";

export const workAreaFields: MasterField[] = [
  { key: "name", label: "名称", required: true },
  {
    key: "areaType",
    label: "種別",
    type: "select",
    default: "internal",
    options: [
      { value: "internal", label: "社内" },
      { value: "external", label: "外注" },
      { value: "warehouse", label: "倉庫" },
    ],
  },
  { key: "defaultStartTime", label: "標準開始", type: "time", nullable: true },
  { key: "defaultEndTime", label: "標準終了", type: "time", nullable: true },
  { key: "maxPeopleCount", label: "最大配置人数", type: "number", default: 4 },
  { key: "displayOrder", label: "表示順", type: "number", default: 0 },
  {
    key: "equipmentKind",
    label: "設備種別",
    type: "select",
    default: "ROOM",
    options: [
      { value: "ROOM", label: "部屋" },
      { value: "LINE", label: "ライン" },
      { value: "MACHINE", label: "機械" },
      { value: "OTHER", label: "その他" },
    ],
  },
  {
    key: "autoScheduleRole",
    label: "自動予定の役割",
    type: "select",
    default: "SHARED",
    options: [
      { value: "ORDER_PRIMARY", label: "受注生産を優先" },
      { value: "STOCK_PRIMARY", label: "在庫生産を優先" },
      { value: "SHARED", label: "共用" },
      { value: "EXCLUDED", label: "自動予定から除外" },
    ],
  },
  { key: "concurrentOperationAllowed", label: "同時稼働可", type: "checkbox", default: true },
  { key: "externalFlag", label: "外注先", type: "checkbox", default: false },
  { key: "validFrom", label: "有効開始", type: "date", nullable: true },
  { key: "validTo", label: "有効終了", type: "date", nullable: true },
  { key: "note", label: "備考", type: "textarea", nullable: true },
];
