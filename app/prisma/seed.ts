// Seed the DB with a minimal, realistic dataset that satisfies the Phase 1
// acceptance scenarios in docs/14_acceptance_tests.md.

import { PrismaClient } from "@prisma/client";
import { computeProductDailyReportMetrics } from "../src/lib/product-daily-report-calculations";
import { normalizeForSearch } from "../src/lib/search";

const prisma = new PrismaClient();
const MONTHLY_ACTUAL_SEED_PRODUCT_LIMIT = readPositiveInt("MONTHLY_ACTUAL_SEED_PRODUCT_LIMIT", 5);
const MONTHLY_ACTUAL_SEED_INSUFFICIENT_INDEX = 3;
const MONTHLY_ACTUAL_SEED_MONTHS = [
  "2024-12",
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
] as const;

const LEGACY_MONTHLY_ACTUAL_OVERRIDES: Record<string, Record<string, number>> = {
  P001: {
    "2025-03": 800,
    "2025-04": 900,
    "2025-05": 1000,
    "2026-03": 1000,
    "2026-04": 950,
  },
  P002: {
    "2025-03": 160,
    "2025-04": 180,
    "2025-05": 200,
    "2026-03": 240,
    "2026-04": 220,
  },
};

type MonthlyActualSeedProduct = {
  id: string;
  productCode: string;
};

async function main() {
  const existingActiveProductCount = await prisma.product.count({ where: { active: true } });
  if (existingActiveProductCount >= MONTHLY_ACTUAL_SEED_PRODUCT_LIMIT && process.env.SEED_FORCE_SAMPLE_RESET !== "1") {
    await prisma.productMonthlyActual.deleteMany();
    await seedLaborFeeRates();
    const seededMonthlyActuals = await seedTrialMonthlyActuals();
    // eslint-disable-next-line no-console
    console.log("Seeded:", {
      mode: "existing_products_monthly_actuals",
      products: existingActiveProductCount,
      monthlyActuals: seededMonthlyActuals,
    });
    return;
  }

  await prisma.auditLog.deleteMany();
  await prisma.productionDailyReportEntry.deleteMany();
  await prisma.dailyReportConsumption.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.productionPlanAssignment.deleteMany();
  await prisma.productionPlanRequirement.deleteMany();
  await prisma.productionPlan.deleteMany();
  await prisma.productDemand.deleteMany();
  await prisma.productMonthlyActual.deleteMany();
  await prisma.specialDemandEvent.deleteMany();
  await prisma.productEquivalenceGroupItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.laborFeeRate.deleteMany();
  await prisma.billingPrice.deleteMany();
  await prisma.productBomItem.deleteMany();
  await prisma.productionCapacity.deleteMany();
  await prisma.productAlias.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productEquivalenceGroup.deleteMany();
  await prisma.packagingMaterial.deleteMany();
  await prisma.material.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.shiftBreak.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.shiftPattern.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.workArea.deleteMany();
  await prisma.user.deleteMany();

  // Users
  await prisma.user.createMany({
    data: [
      { name: "管理者", email: "admin@example.com", role: "admin" },
      { name: "製造管理", email: "mgr@example.com", role: "production_mgr" },
      { name: "現場", email: "floor@example.com", role: "floor" },
    ],
  });

  // Work areas — names are user-editable per docs/15
  const general = await prisma.workArea.create({
    data: {
      name: "一般部屋",
      areaType: "internal",
      maxPeopleCount: 6,
      displayOrder: 1,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
      equipmentKind: "ROOM",
      concurrentOperationAllowed: true,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });
  const machine = await prisma.workArea.create({
    data: {
      name: "機械部屋",
      areaType: "internal",
      maxPeopleCount: 4,
      displayOrder: 2,
      defaultStartTime: "09:00",
      defaultEndTime: "17:30",
      equipmentKind: "MACHINE",
      concurrentOperationAllowed: false,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });
  await prisma.workArea.create({
    data: {
      name: "仕上げ部屋",
      areaType: "internal",
      maxPeopleCount: 3,
      displayOrder: 3,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
      equipmentKind: "ROOM",
      concurrentOperationAllowed: true,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });
  await prisma.workArea.create({
    data: {
      name: "外注先A",
      areaType: "external",
      externalFlag: true,
      maxPeopleCount: 1,
      displayOrder: 9,
      equipmentKind: "ROOM",
      concurrentOperationAllowed: true,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });

  // Suppliers
  const supplier = await prisma.supplier.create({
    data: { name: "デフォルト仕入先", orderingUnit: "kg", validFrom: new Date("2026-01-01"), validTo: null },
  });

  // Materials
  const rmX = await prisma.material.create({
    data: {
      materialCode: "RM001",
      name: "原料X",
      unit: "kg",
      standardUnitPrice: 200,
      supplierId: supplier.id,
      leadTimeDays: 3,
      safetyStockQuantity: 5,
      orderLotQty: 10, // 10kg単位で発注（発注推奨数量はこの倍数に切り上げ）
      minOrderQty: 10,
    },
  });
  await prisma.material.create({
    data: {
      materialCode: "RM002",
      name: "原料Y",
      unit: "kg",
      standardUnitPrice: 150,
      supplierId: supplier.id,
      safetyStockQuantity: 2,
    },
  });

  const pkBag = await prisma.packagingMaterial.create({
    data: {
      materialCode: "PK001",
      name: "標準袋",
      kind: "bag",
      unit: "枚",
      casePackQty: 2000, // 2000枚/ケース
      standardUnitPrice: 5,
      supplierId: supplier.id,
      safetyStockQuantity: 500,
      orderLotQty: 2000, // 1ケース(2000枚)単位で発注
      minOrderQty: 2000,
    },
  });

  // Products
  const productA = await prisma.product.create({
    data: {
      productCode: "P001",
      officialName: "サンプル商品A",
      displayName: "商品A",
      productionType: "stock",
      forecastMethod: "YEAR_RATIO",
      safetyStockQuantity: 200,
      standardProductionLotSize: 500,
      unit: "袋",
      packSizeG: 50,
      packCount: 24,
      casePackQty: 24, // 24袋/ケース
      defaultWorkAreaId: general.id,
      billingEnabled: true,
      validFrom: new Date("2026-01-01"),
      validTo: null,
      aliases: { create: [{ aliasName: "旧A" }] },
    },
  });
  const productB = await prisma.product.create({
    data: {
      productCode: "P002",
      officialName: "サンプル商品B",
      displayName: "商品B",
      productionType: "make_to_order",
      forecastMethod: "NONE",
      safetyStockQuantity: 0,
      standardProductionLotSize: 0,
      unit: "袋",
      defaultWorkAreaId: machine.id,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });

  // BOM for product A: 50g raw + 1 bag per piece
  await prisma.productBomItem.createMany({
    data: [
      {
        productId: productA.id,
        itemType: "raw_material",
        itemId: rmX.id,
        quantityPerUnit: 0.05,
        unit: "kg",
        lossRate: 0,
        validFrom: new Date("2026-01-01"),
        validTo: null,
      },
      {
        productId: productA.id,
        itemType: "packaging",
        itemId: pkBag.id,
        quantityPerUnit: 1,
        unit: "枚",
        lossRate: 0,
        validFrom: new Date("2026-01-01"),
        validTo: null,
      },
    ],
  });

  // Capacity: 100袋/人時 in 一般部屋
  await prisma.productionCapacity.create({
    data: {
      productId: productA.id,
      workAreaId: general.id,
      unitsPerPersonHour: 100,
      standardPeople: 5,
      standardBreakMinutes: 0,
      sourceType: "MANUAL",
      locked: false,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });
  await prisma.productionCapacity.create({
    data: {
      productId: productB.id,
      workAreaId: machine.id,
      unitsPerPersonHour: 80,
      standardPeople: 3,
      standardBreakMinutes: 0,
      sourceType: "MANUAL",
      locked: false,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });

  // Billing prices
  await prisma.billingPrice.create({
    data: {
      productId: productA.id,
      unitPrice: 12,
      unit: "袋",
      effectiveFrom: new Date("2026-01-01"),
      billingTarget: true,
    },
  });
  const laborRates = await seedLaborFeeRates();

  await seedProductionDailyReportEntries({
    productId: productA.id,
    productName: productA.displayName ?? productA.officialName,
    laborFeeRateId: laborRates.standard.id,
    capacityG: productA.packSizeG ?? 0,
    materialUnitCostPerKg: rmX.standardUnitPrice,
    packageCostPerUnit: pkBag.standardUnitPrice,
    unitPrice: 12,
  });

  // Opening stock: 原料X 20kg, 袋 5000枚 — matches "原料不足" acceptance test.
  // Product stock is intentionally lower than demand so the auto-planning screen
  // can propose a production quantity.
  await prisma.stockMovement.createMany({
    data: [
      {
        itemType: "raw_material",
        itemId: rmX.id,
        movementType: "opening",
        quantity: 20,
        effectiveDate: new Date("2026-05-01"),
        status: "CONFIRMED",
      },
      {
        itemType: "packaging",
        itemId: pkBag.id,
        movementType: "opening",
        quantity: 5000,
        effectiveDate: new Date("2026-05-01"),
        status: "CONFIRMED",
      },
      {
        itemType: "product",
        itemId: productA.id,
        movementType: "opening",
        quantity: 200,
        effectiveDate: new Date("2026-05-01"),
        status: "CONFIRMED",
      },
    ],
  });

  await prisma.productDemand.createMany({
    data: [
      {
        productId: productA.id,
        dueDate: new Date("2026-05-25"),
        demandType: "shipment",
        quantity: 1100,
        customerName: "サンプル出荷先",
        status: "open",
      },
      {
        productId: productB.id,
        dueDate: new Date("2026-05-24"),
        demandType: "order",
        quantity: 240,
        customerName: "受注生産サンプル",
        status: "open",
      },
    ],
  });

  const seededMonthlyActuals = await seedTrialMonthlyActuals();

  // Employees
  const employees = await Promise.all(
    [
      { name: "山田太郎", defaultStartTime: "09:00", defaultEndTime: "17:00", defaultBreakMinutes: 60 },
      { name: "佐藤花子", defaultStartTime: "09:00", defaultEndTime: "16:00", defaultBreakMinutes: 45 },
      { name: "鈴木一郎", defaultStartTime: "09:00", defaultEndTime: "17:00", defaultBreakMinutes: 60 },
      { name: "高橋次郎", defaultStartTime: "10:00", defaultEndTime: "17:00", defaultBreakMinutes: 45 },
      { name: "田中三郎", defaultStartTime: "09:00", defaultEndTime: "15:00", defaultBreakMinutes: 45 },
    ].map((data) => prisma.employee.create({ data })),
  );

  const standardPattern = await prisma.shiftPattern.create({
    data: {
      name: "標準（平日）",
      startTime: "08:00",
      endTime: "17:00",
      overtimeAllowed: true,
      validFrom: new Date("2026-01-01"),
      validTo: null,
    },
  });

  await prisma.shiftBreak.createMany({
    data: [
      { shiftPatternId: null, startTime: "12:00", endTime: "13:00", label: "昼休憩" },
      { shiftPatternId: null, startTime: "15:00", endTime: "15:15", label: "午後休憩" },
    ],
  });

  for (const employee of employees) {
    await prisma.shift.create({
      data: {
        employeeId: employee.id,
        date: new Date("2026-05-20"),
        startTime: employee.defaultStartTime,
        endTime: employee.defaultEndTime,
        breakMinutes: employee.defaultBreakMinutes,
        status: "confirmed",
        shiftPatternId: standardPattern.id,
      },
    });
  }

  // 当月(2026-06)分のシフトもseedする。これにより、今日(2026-06上旬)時点で
  // 「月間生産スケジュールを当月で生成 → 当日割り当て → 日報 → 予実 → 発注」の
  // 一連のフローを実画面で頭から流せる。前月15日に出るシフト表の取り込みを
  // 模した固定データ(平日 6/1〜6/5)。
  const TARGET_MONTH_SHIFT_DATES = [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
  ] as const;
  for (const employee of employees) {
    for (const date of TARGET_MONTH_SHIFT_DATES) {
      await prisma.shift.create({
        data: {
          employeeId: employee.id,
          date: new Date(date),
          startTime: employee.defaultStartTime,
          endTime: employee.defaultEndTime,
          breakMinutes: employee.defaultBreakMinutes,
          status: "confirmed",
          shiftPatternId: standardPattern.id,
        },
      });
    }
  }

  // Sample production plan with staff assignments for print-output verification.
  const samplePlan = await prisma.productionPlan.create({
    data: {
      date: new Date("2026-05-20"),
      productId: productA.id,
      productionType: "stock",
      plannedQuantity: 1000,
      unit: "袋",
      workAreaId: general.id,
      plannedStartTime: "09:00",
      plannedEndTime: "11:00",
      desiredEndTime: "17:00",
      breakMinutes: 0,
      plannedPeopleCount: 5,
      status: "draft",
      overtimeMinutes: 0,
      estUnitsPerPersonHour: 100,
      estLaborCost: 12000,
      estMaterialCost: 10000,
      estPackagingCost: 5000,
      estTotalCost: 27000,
      baselineEndTime: "17:00",
      note: "印刷確認用サンプル",
    },
  });

  await prisma.productionPlanRequirement.createMany({
    data: [
      {
        productionPlanId: samplePlan.id,
        itemType: "raw_material",
        itemId: rmX.id,
        itemName: rmX.name,
        unit: "kg",
        plannedQuantity: 50,
        onHandQuantity: 20,
        confirmedInbound: 0,
        unconfirmedInbound: 0,
        shortageQuantity: 30,
        shortageType: "hard_shortage",
        unitPriceSnapshot: 200,
      },
      {
        productionPlanId: samplePlan.id,
        itemType: "packaging",
        itemId: pkBag.id,
        itemName: pkBag.name,
        unit: "枚",
        plannedQuantity: 1000,
        onHandQuantity: 5000,
        confirmedInbound: 0,
        unconfirmedInbound: 0,
        shortageQuantity: 0,
        shortageType: "none",
        unitPriceSnapshot: 5,
      },
    ],
  });

  await prisma.productionPlanAssignment.createMany({
    data: employees.map((employee) => ({
      productionPlanId: samplePlan.id,
      employeeId: employee.id,
      startTime: "09:00",
      endTime: "11:00",
    })),
  });

  // eslint-disable-next-line no-console
  console.log("Seeded:", {
    products: 2,
    materials: 2,
    packaging: 1,
    workAreas: 4,
    employees: 5,
    shiftPatterns: 1,
    shiftBreaks: 2,
    productionPlans: 1,
    productionDailyReportEntries: 2,
    monthlyActuals: seededMonthlyActuals,
  });
}

async function seedLaborFeeRates() {
  const standard = await prisma.laborFeeRate.upsert({
    where: { code: "standard_1200" },
    update: {
      name: "標準",
      hourlyRate: 1200,
      active: true,
      note: "製造日報の1袋手間賃計算に使う標準係数",
    },
    create: {
      code: "standard_1200",
      name: "標準",
      hourlyRate: 1200,
      active: true,
      validFrom: new Date("2026-01-01"),
      note: "製造日報の1袋手間賃計算に使う標準係数",
    },
  });
  const hearing = await prisma.laborFeeRate.upsert({
    where: { code: "hearing_1100" },
    update: {
      name: "要確認区分",
      hourlyRate: 1100,
      active: true,
      note: "Excel Z列相当の区分条件はヒアリング後に確定",
    },
    create: {
      code: "hearing_1100",
      name: "要確認区分",
      hourlyRate: 1100,
      active: true,
      validFrom: new Date("2026-01-01"),
      note: "Excel Z列相当の区分条件はヒアリング後に確定",
    },
  });
  return { standard, hearing };
}

async function seedProductionDailyReportEntries(input: {
  productId: string;
  productName: string;
  laborFeeRateId: string;
  capacityG: number;
  materialUnitCostPerKg: number;
  packageCostPerUnit: number;
  unitPrice: number;
}) {
  const rows = [
    {
      reportDate: "2026-06-02",
      expiryDate: "2026-08-02",
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 0,
      workerCount: 4,
      productionQty: 800,
      materialUsedKg: 40,
      note: "日報蓄積サンプル1",
    },
    {
      reportDate: "2026-06-03",
      expiryDate: "2026-08-03",
      startTime: "13:00",
      endTime: "16:00",
      breakMinutes: 15,
      workerCount: 3,
      productionQty: 720,
      materialUsedKg: 36.8,
      note: "日報蓄積サンプル2",
    },
  ];
  for (const row of rows) {
    const metrics = computeProductDailyReportMetrics({
      startTime: row.startTime,
      endTime: row.endTime,
      breakMinutes: row.breakMinutes,
      workerCount: row.workerCount,
      productionQty: row.productionQty,
      materialUsedKg: row.materialUsedKg,
      capacityG: input.capacityG,
      materialUnitCostPerKg: input.materialUnitCostPerKg,
      packageCostPerUnit: input.packageCostPerUnit,
      unitPrice: input.unitPrice,
      laborHourlyRate: 1200,
    });
    await prisma.productionDailyReportEntry.create({
      data: {
        reportDate: new Date(row.reportDate),
        productId: input.productId,
        productName: input.productName,
        normalizedProductName: normalizeForSearch(input.productName),
        productMatchStatus: "product_id",
        expiryDate: new Date(row.expiryDate),
        startTime: row.startTime,
        endTime: row.endTime,
        breakMinutes: row.breakMinutes,
        workerCount: row.workerCount,
        productionQty: row.productionQty,
        materialUsedKg: row.materialUsedKg,
        laborFeeRateId: input.laborFeeRateId,
        note: row.note,
        sourceType: "manual",
        capacityGSnapshot: input.capacityG,
        materialUnitCostSnapshot: input.materialUnitCostPerKg,
        packageCostPerUnitSnapshot: input.packageCostPerUnit,
        unitPriceSnapshot: input.unitPrice,
        laborHourlyRateSnapshot: 1200,
        operatingMinutes: metrics.operatingMinutes,
        totalOperatingMinutes: metrics.totalOperatingMinutes,
        perHourQty: metrics.perHourQty,
        perUnitTimeMinutes: metrics.perUnitTimeMinutes,
        laborFeePerUnit: metrics.laborFeePerUnit,
        bagWeightG: metrics.bagWeightG,
        lossRate: metrics.lossRate,
        materialCost: metrics.materialCost,
        packageCost: metrics.packageCost,
        totalCost: metrics.totalCost,
        sales: metrics.sales,
        profitRate: metrics.profitRate,
        calculationWarnings: JSON.stringify(metrics.warnings),
      },
    });
  }
}

async function seedTrialMonthlyActuals() {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ productCode: "asc" }],
    take: MONTHLY_ACTUAL_SEED_PRODUCT_LIMIT,
    select: { id: true, productCode: true },
  });
  const rows = buildMonthlyActualSeedRows(products);
  if (rows.length === 0) return 0;
  await prisma.productMonthlyActual.createMany({ data: rows });
  return rows.length;
}

function buildMonthlyActualSeedRows(products: MonthlyActualSeedProduct[]) {
  return products.flatMap((product, productIndex) => {
    const overrides = LEGACY_MONTHLY_ACTUAL_OVERRIDES[product.productCode] ?? {};
    const missingMonth =
      productIndex === MONTHLY_ACTUAL_SEED_INSUFFICIENT_INDEX ? "2025-03" : null;

    return MONTHLY_ACTUAL_SEED_MONTHS.flatMap((yearMonth, monthIndex) => {
      if (yearMonth === missingMonth) return [];
      return {
        productId: product.id,
        yearMonth,
        actualQuantity: overrides[yearMonth] ?? generatedMonthlyActualQuantity(productIndex, monthIndex),
        sourceType: "manual",
        note: "月間予測トライアルseed",
      };
    });
  });
}

function generatedMonthlyActualQuantity(productIndex: number, monthIndex: number) {
  const seasonalPattern = [-40, -20, 0, 30, 70, 110, 90, 50, 20, -10, -20, 20, 60, 90, 120, 150, 130, 170];
  const base = 650 + productIndex * 170;
  const trend = monthIndex * (18 + productIndex * 4);
  const seasonal = seasonalPattern[monthIndex] ?? 0;
  return Math.max(0, Math.round((base + trend + seasonal) / 10) * 10);
}

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
