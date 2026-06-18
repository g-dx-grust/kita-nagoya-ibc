import { HelpTooltip } from "@/components/ui/help-tooltip";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import { loadProductDailyReportSnapshotsForProducts } from "@/lib/product-daily-report-service";
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
  const date = normalizeDate(sp.date ?? toDateInputValue(new Date()));
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const today = toDateInputValue(new Date());
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

  const snapshotsByProduct = await loadProductDailyReportSnapshotsForProducts(products, dayStart);
  const productOptions: StaffDailyReportProductOption[] = products.map((product) => {
    const snapshot = snapshotsByProduct.get(product.id) ?? {
      capacityG: product.packSizeG,
      materialUnitCostPerKg: 0,
      packageCostPerUnit: 0,
      unitPrice: 0,
    };
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
  });

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
      <div className="page-title-row">
        <h1>スタッフ日報</h1>
        <div className="page-title-actions">
          <HelpTooltip text="現場スタッフが当日の予定を選び、生産数・原料使用量・ラベル写真を提出します。提出後は日報画面で管理者が計上します。" />
        </div>
      </div>
      <div className="staff-report-top-panel">
        <div className="staff-report-date-nav">
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/staff-daily-reports?date=${previousDate}`)}>
            <ChevronLeft className="h-4 w-4" />
            前日
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/staff-daily-reports?date=${today}`)}>
            今日
          </Link>
          <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`/staff-daily-reports?date=${nextDate}`)}>
            翌日
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <form className="staff-report-date-form" method="GET">
          <label>
            <span>対象日</span>
            <input name="date" type="date" defaultValue={date} />
          </label>
          <button type="submit" className="secondary">
            表示
          </button>
        </form>
        <div className="staff-report-overview-grid">
          <Metric label="当日の予定" value={`${planSuggestions.length}件`} />
          <Metric label="出勤者" value={`${staffOptions.length}人`} />
          <Metric label="商品候補" value={`${productOptions.length}件`} />
          <Metric label="原料候補" value={`${materialOptions.length}件`} />
        </div>
      </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toDateInputValue(new Date());
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00`);
  target.setDate(target.getDate() + days);
  return toDateInputValue(target);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
