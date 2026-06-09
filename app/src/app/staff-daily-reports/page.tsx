import { prisma } from "@/lib/prisma";
import { loadProductDailyReportSnapshots } from "@/lib/product-daily-report-service";
import StaffDailyReportForm, {
  type StaffDailyReportLaborRateOption,
  type StaffDailyReportMaterialOption,
  type StaffDailyReportPlanSuggestion,
  type StaffDailyReportProductOption,
  type StaffDailyReportStaffOption,
} from "./staff-daily-report-form";

export const dynamic = "force-dynamic";

export default async function StaffDailyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date = normalizeDate(sp.date ?? new Date().toISOString().slice(0, 10));
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const [products, materialMaster, bomRows, laborRates, plans, shifts] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { aliases: true },
      orderBy: [{ usedAtKitagoya: "desc" }, { productCode: "asc" }],
    }),
    prisma.material.findMany({
      where: { active: true },
      orderBy: [{ materialCode: "asc" }],
      select: { id: true, materialCode: true, name: true, standardUnitPrice: true, unit: true },
    }),
    prisma.productBomItem.findMany({
      where: { itemType: "raw_material", active: true },
      orderBy: [{ productId: "asc" }],
      select: { productId: true, itemId: true, quantityPerUnit: true },
    }),
    prisma.laborFeeRate.findMany({
      where: { active: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.productionPlan.findMany({
      where: { date: { gte: dayStart, lte: dayEnd }, status: { not: "cancelled" } },
      include: { product: true, workArea: true },
      orderBy: [{ workArea: { displayOrder: "asc" } }, { plannedStartTime: "asc" }],
    }),
    prisma.shift.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        status: { not: "off" },
        employee: { active: true },
      },
      include: { employee: true },
      orderBy: [{ startTime: "asc" }],
    }),
  ]);

  const materialById = new Map(materialMaster.map((m) => [m.id, m]));
  const bomByProduct = new Map<string, StaffDailyReportProductOption["bomMaterials"]>();
  for (const row of bomRows) {
    const material = materialById.get(row.itemId);
    if (!material) continue;
    const list = bomByProduct.get(row.productId) ?? [];
    list.push({
      materialId: row.itemId,
      materialName: material.name,
      unitPrice: material.standardUnitPrice,
      quantityPerUnit: row.quantityPerUnit,
    });
    bomByProduct.set(row.productId, list);
  }

  const productOptions: StaffDailyReportProductOption[] = await Promise.all(
    products.map(async (product) => {
      const snapshot = await loadProductDailyReportSnapshots(product.id, dayStart);
      return {
        id: product.id,
        productCode: product.productCode,
        officialName: product.officialName,
        displayName: product.displayName,
        aliases: product.aliases.map((alias) => alias.aliasName),
        specification: product.specification,
        brandName: product.brandName,
        unit: product.unit,
        capacityG: snapshot.capacityG,
        materialUnitCostPerKg: snapshot.materialUnitCostPerKg,
        packageCostPerUnit: snapshot.packageCostPerUnit,
        unitPrice: snapshot.unitPrice,
        bomMaterials: bomByProduct.get(product.id) ?? [],
      };
    }),
  );

  const materialOptions: StaffDailyReportMaterialOption[] = materialMaster.map((m) => ({
    id: m.id,
    materialCode: m.materialCode,
    name: m.name,
    standardUnitPrice: m.standardUnitPrice,
    unit: m.unit,
  }));
  const laborRateOptions: StaffDailyReportLaborRateOption[] = laborRates.map((rate) => ({
    id: rate.id,
    code: rate.code,
    name: rate.name,
    hourlyRate: rate.hourlyRate,
  }));
  const planSuggestions: StaffDailyReportPlanSuggestion[] = plans.map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    productName: plan.product.displayName || plan.product.officialName,
    productCode: plan.product.productCode,
    plannedQuantity: plan.plannedQuantity,
    unit: plan.unit,
    workAreaName: plan.workArea.name,
    plannedStartTime: plan.plannedStartTime,
    plannedEndTime: plan.plannedEndTime,
    plannedPeopleCount: plan.plannedPeopleCount,
  }));
  const staffOptions: StaffDailyReportStaffOption[] = shifts.map((shift) => ({
    id: shift.employeeId,
    name: shift.employee.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
  }));

  return (
    <>
      <h1>スタッフ日報</h1>
      <StaffDailyReportForm
        date={date}
        plans={planSuggestions}
        staffOptions={staffOptions}
        products={productOptions}
        materialOptions={materialOptions}
        laborRates={laborRateOptions}
      />
    </>
  );
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
