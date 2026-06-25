import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PackageCheck,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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

  const [products, materialMaster, bomRows, laborRates, plans, shifts, submittedReports] = await Promise.all([
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
      include: {
        product: true,
        workArea: true,
        assignments: {
          include: { employee: true },
          orderBy: [{ startTime: "asc" }],
        },
      },
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
    prisma.productionDailyReportEntry.findMany({
      where: { active: true, reportDate: { gte: dayStart, lte: dayEnd } },
      select: { id: true, approvalStatus: true, inventoryReflected: true },
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
      lossToleranceRate: product.rawMaterialLossToleranceRate,
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
      rawMaterialLossToleranceRate: snapshot.lossToleranceRate,
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
    workAreaId: plan.workAreaId,
    workAreaName: plan.workArea.name,
    plannedStartTime: plan.plannedStartTime,
    plannedEndTime: plan.plannedEndTime,
    plannedPeopleCount: plan.plannedPeopleCount,
    assignedStaffNames: Array.from(
      new Set(plan.assignments.map((assignment) => assignment.employee.name)),
    ),
  }));
  const staffOptions: StaffDailyReportStaffOption[] = shifts.map((shift) => ({
    id: shift.employeeId,
    name: shift.employee.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
  }));
  const month = date.slice(0, 7);
  const uniqueStaffCount = new Set(staffOptions.map((staff) => staff.id)).size;
  const plannedWorkAreaCount = new Set(planSuggestions.map((plan) => plan.workAreaName)).size;
  const submittedCount = submittedReports.filter((report) => report.approvalStatus === "submitted").length;
  const approvedCount = submittedReports.filter((report) => report.approvalStatus === "approved").length;
  const reflectedCount = submittedReports.filter((report) => report.inventoryReflected).length;
  const productionPlansHref = kitagoyaPath(`/production-plans?dateFrom=${date}&dateTo=${date}`);
  const shiftsHref = kitagoyaPath(`/shifts?date=${date}`);
  const adminDailyReportsHref = kitagoyaPath(`/production-daily-reports?month=${month}&review=1#daily-report-review`);
  const readinessIssues =
    (planSuggestions.length === 0 ? 1 : 0) +
    (uniqueStaffCount === 0 ? 1 : 0) +
    (productOptions.length === 0 ? 1 : 0) +
    (materialOptions.length === 0 ? 1 : 0) +
    (laborRateOptions.length === 0 ? 1 : 0);
  const readinessTone = readinessIssues > 0 ? "warn" : "success";
  const nextAction =
    planSuggestions.length === 0
      ? { label: "生産予定を確認", href: productionPlansHref }
      : uniqueStaffCount === 0
        ? { label: "シフトを確認", href: shiftsHref }
        : productOptions.length === 0
          ? { label: "商品を確認", href: kitagoyaPath("/masters/products") }
          : materialOptions.length === 0
            ? { label: "原料を確認", href: kitagoyaPath("/masters/materials") }
            : { label: "入力を開始", href: "#staff-section-plans" };
  const flowCards: {
    label: string;
    count: number | string;
    detail: string;
    href: string;
    tone: "info" | "warn" | "danger" | "success";
    Icon: LucideIcon;
  }[] = [
    {
      label: "対象日",
      count: date.slice(5).replace("-", "/"),
      detail: date,
      href: "#staff-report-date",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "今日の予定",
      count: planSuggestions.length,
      detail: `${plannedWorkAreaCount} 作業場所`,
      href: planSuggestions.length > 0 ? "#staff-section-plans" : productionPlansHref,
      tone: planSuggestions.length > 0 ? "success" : "warn",
      Icon: ClipboardList,
    },
    {
      label: "出勤者",
      count: uniqueStaffCount,
      detail: `シフト ${staffOptions.length}`,
      href: uniqueStaffCount > 0 ? "#staff-section-basic" : shiftsHref,
      tone: uniqueStaffCount > 0 ? "success" : "warn",
      Icon: Users,
    },
    {
      label: "マスター",
      count: productOptions.length,
      detail: `原料 ${materialOptions.length} / 手間賃 ${laborRateOptions.length}`,
      href: productOptions.length > 0 && materialOptions.length > 0 ? "#staff-section-basic" : kitagoyaPath("/masters/products"),
      tone: productOptions.length > 0 && materialOptions.length > 0 && laborRateOptions.length > 0 ? "success" : "warn",
      Icon: PackageCheck,
    },
    {
      label: "提出済み",
      count: submittedReports.length,
      detail: `未計上 ${submittedCount} / 計上済 ${approvedCount}`,
      href: submittedReports.length > 0 ? adminDailyReportsHref : "#staff-section-confirm",
      tone: submittedCount > 0 ? "warn" : submittedReports.length > 0 ? "success" : "info",
      Icon: submittedCount > 0 ? AlertTriangle : Send,
    },
    {
      label: "管理確認",
      count: reflectedCount,
      detail: "在庫反映済み",
      href: adminDailyReportsHref,
      tone: submittedCount > 0 ? "warn" : "info",
      Icon: BarChart3,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>スタッフ日報</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link gap-2" href={productionPlansHref}>
            <ClipboardList className="h-4 w-4" />
            生産予定
          </Link>
          <Link className="button-link secondary-link gap-2" href={shiftsHref}>
            <Users className="h-4 w-4" />
            シフト
          </Link>
          <Link className="button-link secondary-link gap-2" href={adminDailyReportsHref}>
            <BarChart3 className="h-4 w-4" />
            管理確認
          </Link>
          <HelpTooltip text="現場スタッフが当日の予定を選び、生産数・原料使用量・ラベル写真を提出します。提出後は日報画面で管理者が計上します。" />
        </div>
      </div>
      <CollapsiblePanel
        title="確認・操作"
        summary={`${readinessIssues > 0 ? `準備確認 ${readinessIssues}件` : "入力準備OK"} / ${date} / 予定 ${planSuggestions.length}件`}
        className="top-flow-accordion"
      >
        <div className={`production-plans-overview-command ${readinessTone}`}>
          <div className="production-plans-overview-title">
            {readinessTone === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span className={`badge ${readinessTone}`}>
              {readinessIssues > 0 ? `準備確認 ${readinessIssues}件` : "入力準備OK"}
            </span>
            <strong>{date} のスタッフ日報フロー</strong>
            <span className="subtext">
              予定 {planSuggestions.length.toLocaleString()}件 / 出勤 {uniqueStaffCount.toLocaleString()}人 / 提出済み{" "}
              {submittedReports.length.toLocaleString()}件
            </span>
          </div>
          <Link className="production-plans-overview-next" href={nextAction.href}>
            次: {nextAction.label}
          </Link>
        </div>
        <div className="production-plans-overview-grid" aria-label="スタッフ日報の入力フロー">
          {flowCards.map(({ label, count, detail, href, tone, Icon }) => (
            <Link key={label} className={`production-plans-overview-card ${tone}`} href={href}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
        <section id="staff-report-date" className="staff-report-top-panel anchor-offset">
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
        </section>
      </CollapsiblePanel>
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
