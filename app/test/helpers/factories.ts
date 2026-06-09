// Test data factories. Each factory creates one entity with sensible defaults
// and accepts a partial override. Use these in integration tests so the test
// body focuses on the behavior under test, not on fixture plumbing.
//
// Pattern (copy this for Phase 1-1 onward):
//
//   import { getTestPrisma } from "../helpers/prisma";
//   import { cleanupAll } from "../helpers/cleanup";
//   import { createTestProduct, createTestWorkArea } from "../helpers/factories";
//
//   describe("...", () => {
//     const prisma = getTestPrisma();
//     beforeEach(async () => { await cleanupAll(prisma); });
//     it("...", async () => {
//       const wa = await createTestWorkArea(prisma);
//       const p  = await createTestProduct(prisma, { defaultWorkAreaId: wa.id });
//       ...
//     });
//   });

import type { Prisma, PrismaClient, ProductionPlan, PurchaseOrder, StockMovement } from "@prisma/client";

let unique = 0;
function nextId(): string {
  unique += 1;
  return `t${Date.now().toString(36)}${unique.toString(36)}`;
}

export async function createTestSupplier(
  prisma: PrismaClient,
  data: Partial<Prisma.SupplierCreateInput> = {},
) {
  return prisma.supplier.create({
    data: { name: `仕入先_${nextId()}`, ...data },
  });
}

export async function createTestWorkArea(
  prisma: PrismaClient,
  data: Partial<Prisma.WorkAreaCreateInput> = {},
) {
  return prisma.workArea.create({
    data: {
      name: `作業場所_${nextId()}`,
      areaType: "internal",
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
      maxPeopleCount: 4,
      displayOrder: 0,
      ...data,
    },
  });
}

export async function createTestProduct(
  prisma: PrismaClient,
  data: Partial<Prisma.ProductCreateInput> & { defaultWorkAreaId?: string } = {},
) {
  const { defaultWorkAreaId, ...rest } = data;
  return prisma.product.create({
    data: {
      productCode: `P_${nextId()}`,
      officialName: `テスト商品_${nextId()}`,
      productionType: "stock",
      unit: "袋",
      ...(defaultWorkAreaId ? { defaultWorkArea: { connect: { id: defaultWorkAreaId } } } : {}),
      ...rest,
    },
  });
}

export async function createTestMaterial(
  prisma: PrismaClient,
  data: Partial<Prisma.MaterialCreateInput> & { supplierId?: string } = {},
) {
  const { supplierId, ...rest } = data;
  return prisma.material.create({
    data: {
      materialCode: `M_${nextId()}`,
      name: `テスト原料_${nextId()}`,
      unit: "kg",
      ...(supplierId ? { supplier: { connect: { id: supplierId } } } : {}),
      ...rest,
    },
  });
}

export async function createTestPackagingMaterial(
  prisma: PrismaClient,
  data: Partial<Prisma.PackagingMaterialCreateInput> & { supplierId?: string } = {},
) {
  const { supplierId, ...rest } = data;
  return prisma.packagingMaterial.create({
    data: {
      materialCode: `PK_${nextId()}`,
      name: `テスト資材_${nextId()}`,
      unit: "枚",
      ...(supplierId ? { supplier: { connect: { id: supplierId } } } : {}),
      ...rest,
    },
  });
}

export async function createTestEmployee(
  prisma: PrismaClient,
  data: Partial<Prisma.EmployeeCreateInput> = {},
) {
  return prisma.employee.create({
    data: {
      name: `従業員_${nextId()}`,
      employmentType: "own",
      ...data,
    },
  });
}

export async function createTestUser(
  prisma: PrismaClient,
  data: Partial<Prisma.UserCreateInput> = {},
) {
  return prisma.user.create({
    data: {
      name: `テストユーザー_${nextId()}`,
      email: `${nextId()}@test.local`,
      role: "admin",
      ...data,
    },
  });
}

export async function createTestStockMovement(
  prisma: PrismaClient,
  data: Partial<Prisma.StockMovementCreateInput> & {
    itemId: string;
    itemType: "product" | "raw_material" | "packaging";
    quantity: number;
    movementType: string;
    movementDate?: Date;
    status?: "PLANNED" | "CONFIRMED" | "CANCELLED";
    sourceType?: string;
    sourceId?: string;
  },
): Promise<StockMovement> {
  const {
    itemId,
    itemType,
    quantity,
    movementType,
    movementDate,
    status,
    sourceType,
    sourceId,
    ...rest
  } = data;

  return prisma.stockMovement.create({
    data: {
      itemId,
      itemType,
      quantity,
      movementType,
      effectiveDate: movementDate ?? new Date(),
      sourceType,
      sourceId,
      ...rest,
      ...(status ? { status } : {}),
    } as Prisma.StockMovementUncheckedCreateInput,
  });
}

export async function createTestPurchaseOrder(
  prisma: PrismaClient,
  data: Partial<Prisma.PurchaseOrderCreateInput> & {
    itemId: string;
    itemType: "raw_material" | "packaging";
    quantity: number;
    status?: "candidate" | "draft" | "ordered_unconfirmed" | "confirmed" | "received" | "cancelled";
  },
): Promise<PurchaseOrder> {
  const { itemId, itemType, quantity, status = "candidate", ...rest } = data;
  return prisma.purchaseOrder.create({
    data: {
      itemId,
      itemType,
      orderedQuantity: quantity,
      status,
      ...rest,
    } as Prisma.PurchaseOrderUncheckedCreateInput,
  });
}

export async function createTestProductionPlan(
  prisma: PrismaClient,
  data: Partial<Prisma.ProductionPlanCreateInput> & {
    productId: string;
    workAreaId: string;
    plannedQuantity: number;
    date: Date;
    plannedStartTime?: string;
    plannedPeopleCount?: number;
  },
): Promise<ProductionPlan> {
  const {
    productId,
    workAreaId,
    plannedQuantity,
    date,
    plannedStartTime = "09:00",
    plannedPeopleCount = 1,
    ...rest
  } = data;

  return prisma.productionPlan.create({
    data: {
      productId,
      workAreaId,
      plannedQuantity,
      date,
      plannedStartTime,
      plannedPeopleCount,
      productionType: "stock",
      unit: "袋",
      ...rest,
    } as Prisma.ProductionPlanUncheckedCreateInput,
  });
}
