import { z } from "zod";

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM");
const strictHhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const isoDateOrDateTime = z
  .string()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value)), {
    message: "YYYY-MM-DD or ISO date-time",
  });
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");

export const ProductionTypeEnum = z.enum(["stock", "make_to_order", "both"]);
export const ForecastMethodEnum = z.enum(["MANUAL", "YEAR_RATIO", "SALES_INPUT", "NONE"]);
export const EquipmentKindEnum = z.enum(["ROOM", "LINE", "MACHINE", "OTHER"]);
export const AutoScheduleRoleEnum = z.enum(["ORDER_PRIMARY", "STOCK_PRIMARY", "SHARED", "EXCLUDED"]);
export const CapacitySourceTypeEnum = z.enum(["MANUAL", "DAILY_REPORT_MEDIAN"]);
export const EquivalenceCalculationModeEnum = z.enum(["SUM_AS_SAME_PRODUCT", "REFERENCE_ONLY"]);
export const SpecialDemandEventTypeEnum = z.enum([
  "FLYER",
  "SPECIAL_CUSTOMER",
  "CAMPAIGN",
  "OTHER",
]);
export const SpecialDemandEventStatusEnum = z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]);
export const PlanProductionTypeEnum = z.enum([
  "stock",
  "make_to_order",
  "external",
  "trial",
  "other",
]);
export const PlanStatusEnum = z.enum(["draft", "confirmed", "cancelled", "completed"]);
export const ItemTypeEnum = z.enum(["raw_material", "packaging"]);
export const InventoryLedgerStatusEnum = z.enum(["PLANNED", "CONFIRMED", "CANCELLED"]);
export const ProductDailyReportApprovalStatusEnum = z.enum(["submitted", "approved", "rejected"]);

// --- 在庫の手入力(管理者) ---
export const ManualEntryKindEnum = z.enum(["inbound", "shipment", "adjustment", "opening"]);
export const ManualEntryDirectionEnum = z.enum(["increase", "decrease"]);
export const ManualInventoryEntrySchema = z
  .object({
    itemType: z.enum(["raw_material", "packaging", "product"]),
    itemId: z.string().min(1),
    kind: ManualEntryKindEnum,
    // 入力数量。inbound/shipment/adjustment は >0。opening は目標在庫(>=0)。
    quantity: z.number().nonnegative(),
    direction: ManualEntryDirectionEnum.optional(),
    effectiveDate: isoDate,
    expiryDate: isoDate.nullish(),
    shippingDeadline: isoDate.nullish(),
    note: z.string().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "opening" && !(v.quantity > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "数量は0より大きい値を入力してください",
      });
    }
    if (v.kind === "adjustment" && !v.direction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message: "棚卸調整は増加/減少を選択してください",
      });
    }
  });

// --- 在庫表のExcelライク・セル編集(まとめて保存) ---
// 手入力分を加算オーバーレイとして扱う。inbound>=0 / usage>=0 / opening は符号付き(加算)。
// 値が空/0で期限も無いセルは、該当する手入力movementを削除する。
export const ManualGridSaveSchema = z.object({
  itemType: z.enum(["raw_material", "packaging", "product"]),
  month: yearMonth,
  openings: z
    .array(z.object({ itemId: z.string().min(1), value: z.number() }))
    .default([]),
  cells: z
    .array(
      z.object({
        itemId: z.string().min(1),
        date: isoDate,
        inbound: z.number().nonnegative().nullish(),
        usage: z.number().nonnegative().nullish(),
        expiry: isoDate.nullish(),
        shipping: isoDate.nullish(),
      }),
    )
    .default([]),
});

// --- Excel由来の製造日報台帳 ---
export const ProductDailyReportEntrySchema = z
  .object({
    reportDate: isoDate,
    productId: z.string().nullish(),
    productName: z.string().nullish(),
    productionPlanId: z.string().nullish(),
    workAreaId: z.string().nullish(),
    workAreaName: z.string().max(120).nullish(),
    expiryDate: isoDate.nullish(),
    pillowManufacturedDate: isoDate.nullish(),
    pillowExpiryDate: isoDate.nullish(),
    packagingLotNumber: z.string().max(120).nullish(),
    fixedCode: z.string().max(80).nullish(),
    ribbonChangeTime: hhmm.nullish(),
    startTime: hhmm,
    endTime: hhmm,
    breakMinutes: z.number().int().min(0).default(0),
    workerCount: z.number().positive(),
    staffSealerCount: z.number().nonnegative().nullish(),
    staffSetCount: z.number().nonnegative().nullish(),
    staffReportNote: z.string().max(500).nullish(),
    productionQty: z.number().positive(),
    // 複数原料(2種類以上)。materialUsedKg は materials があればサーバで Σ 再計算する(後方互換のため残す)。
    materials: z
      .array(
        z.object({
          materialId: z.string().nullish(),
          materialName: z.string().min(1, "原料名を入力してください"),
          usedKg: z.number().nonnegative(),
          lotNumber: z.string().max(120).nullish(),
          expiryDate: isoDate.nullish(),
          mixRatio: z.number().nullish(),
        }),
      )
      .optional(),
    materialUsedKg: z.number().nonnegative().optional(),
    laborFeeRateId: z.string().nullish(),
    note: z.string().nullish(),
    sourceType: z.enum(["manual", "staff_entry", "excel_import", "api_import"]).default("manual"),
    sourceSheetName: z.string().nullish(),
    sourceRowNumber: z.number().int().positive().nullish(),
    approvalStatus: ProductDailyReportApprovalStatusEnum.optional(),
    submittedBy: z.string().max(80).nullish(),
    approvedBy: z.string().max(80).nullish(),
    preCheckExpiryOk: z.boolean().optional(),
    preCheckSealerPressureOk: z.boolean().optional(),
    metalDetectorBeforeFe: z.boolean().optional(),
    metalDetectorBeforeSus: z.boolean().optional(),
    metalDetectorAfterFe: z.boolean().optional(),
    metalDetectorAfterSus: z.boolean().optional(),
    lossRateReasonNote: z.string().max(1000).nullish(),
    labelPhotos: z
      .array(
        z.object({
          name: z.string().max(120),
          type: z.string().max(80).nullish(),
          dataUrl: z.string().startsWith("data:image/", "画像データを選択してください"),
        }),
      )
      .max(4)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.productId && !value.productName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productName"],
        message: "商品を選択するか商品名を入力してください",
      });
    }
    const start = parseHhMmForSchema(value.startTime);
    const end = parseHhMmForSchema(value.endTime);
    if (start == null || end == null || end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "終了時間は開始時間より後にしてください",
      });
      return;
    }
    if (value.breakMinutes >= end - start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakMinutes"],
        message: "休憩時間は開始〜終了の範囲より短くしてください",
      });
    }
  });

// --- Master schemas ---

const validityRange = <T extends { validFrom?: Date | null; validTo?: Date | null }>(data: T) =>
  !data.validFrom || !data.validTo || data.validFrom < data.validTo;
const isoDateRange = <T extends { effectiveFrom?: string | null; effectiveTo?: string | null }>(data: T) =>
  !data.effectiveFrom || !data.effectiveTo || data.effectiveFrom < data.effectiveTo;

function parseHhMmForSchema(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const ProductBaseSchema = z.object({
  productCode: z.string().min(1),
  officialName: z.string().min(1),
  displayName: z.string().nullish(),
  productionType: ProductionTypeEnum,
  forecastMethod: ForecastMethodEnum.default("MANUAL"),
  equivalenceGroupId: z.string().nullish(),
  safetyStockQuantity: z.number().nonnegative().default(0),
  standardProductionLotSize: z.number().nonnegative().default(0),
  rawMaterialLossToleranceRate: z.number().min(0).max(1).default(0.05),
  schedulePriority: z.number().int().nullish(),
  unit: z.string().default("袋"),
  packSizeG: z.number().nonnegative().nullish(),
  packCount: z.number().int().nonnegative().nullish(),
  casePackQty: z.number().nonnegative().nullish(),
  category: z.string().nullish(),
  sourceSystem: z.string().nullish(),
  sourceProductKey: z.string().nullish(),
  sourceSheetName: z.string().nullish(),
  sourceRowNumber: z.number().int().nonnegative().nullish(),
  specification: z.string().nullish(),
  packCountExpression: z.string().nullish(),
  bundleCount: z.string().nullish(),
  brandName: z.string().nullish(),
  bagTrayName: z.string().nullish(),
  cartonName: z.string().nullish(),
  accessoryName: z.string().nullish(),
  sealCount: z.number().nonnegative().nullish(),
  classificationNote: z.string().nullish(),
  rawMaterialNote: z.string().nullish(),
  defaultWorkAreaId: z.string().nullish(),
  billingEnabled: z.boolean().default(true),
  usedAtKitagoya: z.boolean().optional(),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
  aliases: z.array(z.string()).optional(),
});
export const ProductCreateSchema = ProductBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const ProductUpdateSchema = ProductBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const MaterialBaseSchema = z.object({
  materialCode: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().default("kg"),
  standardUnitPrice: z.number().nonnegative().default(0),
  supplierId: z.string().nullish(),
  leadTimeDays: z.number().int().nonnegative().default(0),
  safetyStockQuantity: z.number().nonnegative().default(0),
  orderLotQty: z.number().nonnegative().nullish(),
  minOrderQty: z.number().nonnegative().nullish(),
  shelfLifeManaged: z.boolean().default(false),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const MaterialCreateSchema = MaterialBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const MaterialUpdateSchema = MaterialBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const PackagingBaseSchema = z.object({
  materialCode: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().nullish(),
  unit: z.string().default("枚"),
  casePackQty: z.number().nonnegative().nullish(),
  standardUnitPrice: z.number().nonnegative().default(0),
  supplierId: z.string().nullish(),
  leadTimeDays: z.number().int().nonnegative().default(0),
  safetyStockQuantity: z.number().nonnegative().default(0),
  orderLotQty: z.number().nonnegative().nullish(),
  minOrderQty: z.number().nonnegative().nullish(),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const PackagingCreateSchema = PackagingBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const PackagingUpdateSchema = PackagingBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const WorkAreaBaseSchema = z.object({
  name: z.string().min(1),
  areaType: z.enum(["internal", "external", "warehouse"]).default("internal"),
  defaultStartTime: hhmm.nullish(),
  defaultEndTime: hhmm.nullish(),
  maxPeopleCount: z.number().int().positive().default(4),
  displayOrder: z.number().int().default(0),
  equipmentKind: EquipmentKindEnum.default("ROOM"),
  autoScheduleRole: AutoScheduleRoleEnum.default("SHARED"),
  concurrentOperationAllowed: z.boolean().default(true),
  active: z.boolean().default(true),
  externalFlag: z.boolean().default(false),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const WorkAreaCreateSchema = WorkAreaBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const WorkAreaUpdateSchema = WorkAreaBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

export const EmployeeCreateSchema = z.object({
  name: z.string().min(1),
  employmentType: z.enum(["own", "temp", "other"]).default("own"),
  affiliation: z.string().nullish(),
  defaultStartTime: hhmm.default("09:00"),
  defaultEndTime: hhmm.default("17:00"),
  defaultBreakMinutes: z.number().int().min(0).default(60),
  active: z.boolean().default(true),
  shiftEntryEnabled: z.boolean().default(true),
  note: z.string().nullish(),
});
export const EmployeeUpdateSchema = EmployeeCreateSchema.partial();

export const ShiftStatusEnum = z.enum(["draft", "confirmed", "off"]);
const ShiftPatternBaseSchema = z.object({
  name: z.string().min(1),
  startTime: strictHhmm,
  endTime: strictHhmm,
  overtimeAllowed: z.boolean().default(false),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const ShiftPatternCreateSchema = ShiftPatternBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const ShiftPatternUpdateSchema = ShiftPatternBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const ShiftBreakBaseSchema = z.object({
  shiftPatternId: z.string().nullish(),
  startTime: strictHhmm,
  endTime: strictHhmm,
  label: z.string().nullish(),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
});
export const ShiftBreakCreateSchema = ShiftBreakBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const ShiftBreakUpdateSchema = ShiftBreakBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

export const EmployeeDefaultWorkTimeSchema = z.object({
  employeeId: z.string().min(1),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.number().int().min(0).default(60),
});
export const ShiftBulkReplaceSchema = z.object({
  date: isoDate,
  employeeDefaults: z.array(EmployeeDefaultWorkTimeSchema).optional(),
  shifts: z.array(
    z.object({
      employeeId: z.string().min(1),
      startTime: hhmm,
      endTime: hhmm,
      breakMinutes: z.number().int().min(0).default(60),
      status: ShiftStatusEnum.default("confirmed"),
      shiftPatternId: z.string().nullish(),
    }),
  ),
});

// 月単位の一括登録。クライアントは「その月に出勤するセル」だけ列挙して送る。
// 送られなかった (employeeId, day) ペアはその月から削除する (オフ扱い)。
// 個別に時刻を変えたい場合は startTime/endTime/breakMinutes をセル毎に渡せる。
// 渡されなかった場合は defaults を使う。
export const ShiftMonthCellSchema = z.object({
  employeeId: z.string().min(1),
  day: z.number().int().min(1).max(31),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  breakMinutes: z.number().int().min(0).optional(),
  status: ShiftStatusEnum.optional(),
  shiftPatternId: z.string().nullish(),
});
export const ShiftMonthReplaceSchema = z.object({
  yearMonth,
  defaults: z.object({
    startTime: hhmm.default("09:00"),
    endTime: hhmm.default("17:00"),
    breakMinutes: z.number().int().min(0).default(60),
    status: ShiftStatusEnum.default("confirmed"),
  }),
  employeeDefaults: z.array(EmployeeDefaultWorkTimeSchema).optional(),
  cells: z.array(ShiftMonthCellSchema),
});

export const StaffShiftEntrySaveSchema = z.object({
  yearMonth,
  days: z.array(
    z.object({
      day: z.number().int().min(1).max(31),
      startTime: hhmm,
      endTime: hhmm,
      breakMinutes: z.number().int().min(0).default(60),
    }),
  ),
});

export const ShiftChangeRequestReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewedBy: z.string().max(80).nullish(),
  reviewNote: z.string().max(1000).nullish(),
});

const SupplierBaseSchema = z.object({
  name: z.string().min(1),
  contact: z.string().nullish(),
  orderingUnit: z.string().nullish(),
  closingInfo: z.string().nullish(),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
});
export const SupplierCreateSchema = SupplierBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const SupplierUpdateSchema = SupplierBaseSchema.partial().refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const BomItemBaseSchema = z.object({
  itemType: ItemTypeEnum,
  itemId: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  unit: z.string().min(1),
  lossRate: z.number().min(0).default(0),
  mixRatio: z.number().nullish(),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const BomItemSchema = BomItemBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const BomReplaceSchema = z.object({ items: z.array(BomItemSchema) });

const CapacityBaseSchema = z.object({
  productId: z.string().min(1),
  workAreaId: z.string().min(1),
  unitsPerPersonHour: z.number().positive(),
  standardPeople: z.number().positive().default(1),
  standardBreakMinutes: z.number().int().min(0).default(0),
  candidatePriority: z.number().int().min(1).max(99).nullish(),
  note: z.string().nullish(),
  sourceType: CapacitySourceTypeEnum.default("MANUAL"),
  locked: z.boolean().default(false),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  reviewStatus: z.enum(["unreviewed", "confirmed", "needs_review"]).optional(),
  reviewMemo: z.string().nullish(),
});
export const CapacityUpsertSchema = CapacityBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});

const BillingPriceFieldsSchema = z.object({
  workAreaId: z.string().nullish(),
  workAreaNameSnapshot: z.string().max(120).nullish(),
  unitPrice: z.number().nonnegative(),
  unit: z.string().min(1),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullish(),
  billingTarget: z.boolean().default(true),
  externalCode: z.string().nullish(),
  note: z.string().nullish(),
});
export const BillingPriceCreateSchema = BillingPriceFieldsSchema.extend({
  productId: z.string().min(1),
}).refine(isoDateRange, {
  message: "effectiveFrom must be before effectiveTo",
  path: ["effectiveTo"],
});
export const BillingPriceUpdateSchema = BillingPriceFieldsSchema.refine(isoDateRange, {
  message: "effectiveFrom must be before effectiveTo",
  path: ["effectiveTo"],
});

export const ProductDemandCreateSchema = z.object({
  productId: z.string().min(1),
  dueDate: isoDate,
  demandType: z.enum(["order", "shipment", "forecast"]).default("order"),
  quantity: z.number().positive(),
  status: z.enum(["open", "fulfilled", "cancelled"]).default("open"),
  customerName: z.string().nullish(),
  externalRef: z.string().nullish(),
  note: z.string().nullish(),
});
export const ProductDemandUpdateSchema = ProductDemandCreateSchema.partial();

export const ProductMonthlyActualUpsertSchema = z.object({
  productId: z.string().min(1),
  yearMonth,
  actualQuantity: z.number().nonnegative(),
  sourceType: z.enum(["manual", "import", "daily_report"]).default("manual"),
  note: z.string().nullish(),
});
export const ProductMonthlyActualUpdateSchema = ProductMonthlyActualUpsertSchema.partial();

const ProductEquivalenceGroupBaseSchema = z.object({
  name: z.string().min(1),
  calculationMode: EquivalenceCalculationModeEnum.default("SUM_AS_SAME_PRODUCT"),
  active: z.boolean().default(true),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  note: z.string().nullish(),
});
export const ProductEquivalenceGroupCreateSchema = ProductEquivalenceGroupBaseSchema.refine(
  validityRange,
  {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  },
);
export const ProductEquivalenceGroupUpdateSchema = ProductEquivalenceGroupBaseSchema.partial().refine(
  validityRange,
  {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  },
);

const ProductEquivalenceGroupItemBaseSchema = z.object({
  groupId: z.string().min(1),
  productId: z.string().min(1),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
});
export const ProductEquivalenceGroupItemCreateSchema =
  ProductEquivalenceGroupItemBaseSchema.refine(validityRange, {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  });
export const ProductEquivalenceGroupItemUpdateSchema =
  ProductEquivalenceGroupItemBaseSchema.partial().refine(validityRange, {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  });

const SpecialDemandEventBaseSchema = z.object({
  productId: z.string().min(1),
  productionPlanCandidate: z.string().nullish(),
  customerLabel: z.string().nullish(),
  targetYearMonth: yearMonth,
  qty: z.number().positive(),
  eventType: SpecialDemandEventTypeEnum,
  includeInNormalForecast: z.boolean().default(false),
  status: SpecialDemandEventStatusEnum.default("DRAFT"),
  note: z.string().nullish(),
  validFrom: z.coerce.date().nullish(),
  validTo: z.coerce.date().nullish(),
  active: z.boolean().default(true),
});
export const SpecialDemandEventCreateSchema = SpecialDemandEventBaseSchema.refine(validityRange, {
  message: "validFrom must be before validTo",
  path: ["validTo"],
});
export const SpecialDemandEventUpdateSchema = SpecialDemandEventBaseSchema.partial().refine(
  validityRange,
  {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  },
);

export const PurchaseOrderStatusEnum = z.enum([
  "candidate",
  "draft",
  "ordered_unconfirmed",
  "confirmed",
  "received",
  "cancelled",
]);
export const PurchaseOrderUrgencyEnum = z.enum(["CRITICAL", "WARNING", "INFO", "NONE"]);

export const PurchaseOrderUpdateSchema = z.object({
  supplierId: z.string().nullish(),
  orderedQuantity: z.number().positive().optional(),
  confirmedQuantity: z.number().positive().nullish(),
  expectedArrivalDate: isoDate.nullish(),
  shortageDate: isoDate.nullish(),
  recommendedOrderDate: isoDate.nullish(),
  urgency: PurchaseOrderUrgencyEnum.optional(),
  status: PurchaseOrderStatusEnum.optional(),
  receivedQuantity: z.number().positive().nullish(),
  receivedDate: isoDateOrDateTime.nullish(),
  note: z.string().nullish(),
});

export const PurchaseOrderReceiveSchema = z.object({
  receivedQuantity: z.number().positive(),
  receivedDate: isoDateOrDateTime.optional(),
});

// --- Production plan ---

export const ProductionPlanCreateSchema = z.object({
  date: isoDate,
  productId: z.string().min(1),
  productionType: PlanProductionTypeEnum,
  plannedQuantity: z.number().positive(),
  unit: z.string().min(1),
  workAreaId: z.string().min(1),
  plannedStartTime: hhmm,
  desiredEndTime: hhmm.nullish(),
  breakMinutes: z.number().int().min(0).default(0),
  plannedPeopleCount: z.number().positive(),
  status: PlanStatusEnum.default("draft"),
  baselineEndTime: hhmm.default("17:00"),
  note: z.string().nullish(),
});
export const ProductionPlanUpdateSchema = ProductionPlanCreateSchema.partial();

// 一括削除。`ids` か `filter` のどちらかを指定する。両方あれば ids を優先。
// filter は dateFrom と dateTo の両方必須 (期間指定なしの一括削除は誤操作リスクが高いため禁止)。
export const ProductionPlanBulkDeleteSchema = z
  .object({
    ids: z.array(z.string().min(1)).optional(),
    filter: z
      .object({
        dateFrom: isoDate,
        dateTo: isoDate,
        status: PlanStatusEnum.optional(),
        workAreaId: z.string().min(1).optional(),
      })
      .optional(),
  })
  .refine((v) => (v.ids && v.ids.length > 0) || v.filter, {
    message: "ids または filter のいずれかが必要です",
  });

export const ProductionPlanBulkConfirmSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const ProductionPlanAssignmentSchema = z.object({
  employeeId: z.string().min(1),
  startTime: hhmm,
  endTime: hhmm,
  moveAfterPlanId: z.string().nullish(),
});
export const ProductionPlanAssignmentsReplaceSchema = z.object({
  assignments: z.array(ProductionPlanAssignmentSchema),
});

export const AutoScheduleModeEnum = z.enum(["duration", "max_quantity", "required_people"]);
export const AutoScheduleCreateSchema = z.object({
  date: isoDate,
  mode: AutoScheduleModeEnum.default("max_quantity"),
  startTime: hhmm.default("09:00"),
  desiredEndTime: hhmm.default("17:00"),
  baselineEndTime: hhmm.default("17:00"),
  breakMinutes: z.number().int().min(0).default(0),
  status: PlanStatusEnum.default("draft"),
  replaceExistingDrafts: z.boolean().default(false),
  persist: z.boolean().default(false),
  overrides: z
    .array(
      z.object({
        tempId: z.string().min(1),
        workAreaId: z.string().min(1).optional(),
        employeeIds: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
  selectedTempIds: z.array(z.string().min(1)).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        productionType: PlanProductionTypeEnum.default("stock"),
      }),
    )
    .min(1),
});

export const DayAllocationSchema = z.object({
  date: isoDate,
  dayStart: hhmm.default("09:00"),
  dayEnd: hhmm.default("17:00"),
  stepMinutes: z.number().int().min(1).max(60).default(5),
  /** 対象とする生産予定のステータス */
  planStatuses: z.array(PlanStatusEnum).default(["draft", "confirmed"]),
  /** true なら割り当て結果を ProductionPlanAssignment に保存する */
  persist: z.boolean().default(false),
  /** 手動ピン留め（ドラッグ微調整）。指定の人・時間帯を固定配置する。 */
  pinnedAssignments: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        workAreaId: z.string().min(1),
        startTime: hhmm,
        endTime: hhmm,
      }),
    )
    .default([]),
  /** 商品（生産予定）単位の作業場所変更。保存時は ProductionPlan.workAreaId に反映する。 */
  planWorkAreaOverrides: z
    .array(
      z.object({
        planId: z.string().min(1),
        workAreaId: z.string().min(1),
      }),
    )
    .default([]),
});

export const MonthlyProductionScheduleCreateSchema = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
  productionLeadDays: z.number().int().min(0).max(14).default(1),
  planningBasis: z.enum(["historical_actual", "inventory_shortage"]).default("historical_actual"),
  defaultStartTime: hhmm.default("09:00"),
  baselineEndTime: hhmm.default("17:00"),
  replaceExistingDrafts: z.boolean().default(false),
  replaceGeneratedDraftsOnly: z.boolean().default(false),
});

// --- Calculation requests ---

export const CalcDurationSchema = z.object({
  productId: z.string().optional(),
  workAreaId: z.string().optional(),
  unitsPerPersonHour: z.number().positive().optional(),
  quantity: z.number().positive(),
  peopleCount: z.number().positive(),
  startTime: hhmm,
  breakMinutes: z.number().int().min(0).default(0),
  baselineEndTime: hhmm.default("17:00"),
});

export const CalcMaxQuantitySchema = z.object({
  productId: z.string().optional(),
  workAreaId: z.string().optional(),
  unitsPerPersonHour: z.number().positive().optional(),
  peopleCount: z.number().positive(),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.number().int().min(0).default(0),
  requestedQuantity: z.number().positive().optional(),
});

export const CalcRequiredPeopleSchema = z.object({
  productId: z.string().optional(),
  workAreaId: z.string().optional(),
  unitsPerPersonHour: z.number().positive().optional(),
  quantity: z.number().positive(),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.number().int().min(0).default(0),
  availablePeople: z.number().int().positive().optional(),
});

export const CalcMaterialRequirementsSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  asOfDate: isoDate.optional(),
});
