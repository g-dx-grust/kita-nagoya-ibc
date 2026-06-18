import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  PackageCheck,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import AutoScheduleForm from "./auto-schedule-form";

export const dynamic = "force-dynamic";

export default async function AutoSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const initialDate = sp.date ?? toDateInputValue(new Date());
  const autoLoadSuggestions = sp.loadSuggestions === "1";
  const [dayStart, dayEnd] = dayRange(initialDate);
  const [products, workAreas, shifts, employeeCount] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { defaultWorkArea: true, capacities: { include: { workArea: true } } },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({
      where: { active: true, areaType: "internal", externalFlag: false },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.shift.findMany({
      where: {
        date: { gte: dayStart, lt: dayEnd },
        employee: { active: true },
      },
      select: { status: true },
    }),
    prisma.employee.count({ where: { active: true } }),
  ]);
  const missingDefaultAreaCount = products.filter((product) => !product.defaultWorkAreaId).length;
  const missingCapacityCount = products.filter((product) => product.capacities.length === 0).length;
  const availableShiftCount = shifts.filter((shift) => shift.status !== "off").length;
  const draftShiftCount = shifts.filter((shift) => shift.status === "draft").length;
  const confirmedShiftCount = shifts.filter((shift) => shift.status === "confirmed").length;
  const readinessIssues =
    (products.length === 0 ? 1 : 0) +
    (workAreas.length === 0 ? 1 : 0) +
    (availableShiftCount === 0 ? 1 : 0) +
    missingCapacityCount;
  const readinessTone = readinessIssues > 0 ? "warn" : "success";
  const nextAction =
    products.length === 0
      ? { label: "商品を登録", href: kitagoyaPath("/masters/products") }
      : missingCapacityCount > 0
        ? { label: "能力未登録を確認", href: kitagoyaPath("/capacity-review") }
        : workAreas.length === 0
          ? { label: "作業場所を登録", href: kitagoyaPath("/masters/work-areas") }
          : availableShiftCount === 0
            ? { label: "シフトを登録", href: kitagoyaPath(`/shifts?date=${initialDate}`) }
            : autoLoadSuggestions
              ? { label: "商品候補を確認", href: "#auto-schedule-items" }
              : { label: "不足候補を読込", href: kitagoyaPath(`/production-plans/auto?date=${initialDate}&loadSuggestions=1`) };
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
      count: initialDate.slice(5).replace("-", "/"),
      detail: initialDate,
      href: "#auto-schedule-control",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "商品候補",
      count: products.length,
      detail: `標準場所なし ${missingDefaultAreaCount}`,
      href: kitagoyaPath(`/production-plans/auto?date=${initialDate}&loadSuggestions=1`),
      tone: products.length > 0 ? "success" : "warn",
      Icon: PackageCheck,
    },
    {
      label: "能力登録",
      count: missingCapacityCount,
      detail: "未登録商品",
      href: missingCapacityCount > 0 ? kitagoyaPath("/capacity-review") : "#auto-schedule-control",
      tone: missingCapacityCount > 0 ? "danger" : "success",
      Icon: ListChecks,
    },
    {
      label: "出勤シフト",
      count: availableShiftCount,
      detail: `確定 ${confirmedShiftCount} / 仮 ${draftShiftCount} / ${employeeCount}名`,
      href: kitagoyaPath(`/shifts?date=${initialDate}`),
      tone: availableShiftCount > 0 ? "success" : "warn",
      Icon: Users,
    },
    {
      label: "プレビュー",
      count: readinessIssues > 0 ? "要確認" : "開始",
      detail: `${workAreas.length} 作業場所`,
      href: readinessIssues > 0 ? nextAction.href : "#auto-schedule-control",
      tone: readinessIssues > 0 ? "warn" : "info",
      Icon: ClipboardList,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>生産スケジュール自動作成</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans")}>
            <Table2 size={16} aria-hidden="true" />
            生産予定
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?date=${initialDate}`)}>
            <Users size={16} aria-hidden="true" />
            シフト
          </Link>
          <Link className="button-link" href={kitagoyaPath(`/production-plans/auto?date=${initialDate}&loadSuggestions=1`)}>
            <PackageCheck size={16} aria-hidden="true" />
            不足候補読込
          </Link>
          <HelpTooltip text="今日作る商品を選ぶと、対象日の出勤シフトに合わせて作業順、作業場所、スタッフ配置を自動作成します。受注生産を先に、在庫生産を後工程に配置します。休みまたはシフト未登録のスタッフは配置・印刷対象に含めません。" />
        </div>
      </div>
      <div className={`production-plans-overview-command ${readinessTone}`}>
        <div className="production-plans-overview-title">
          {readinessTone === "success" ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span className={`badge ${readinessTone}`}>
            {readinessIssues > 0 ? `準備確認 ${readinessIssues}件` : "準備OK"}
          </span>
          <strong>自動作成の準備フロー</strong>
          <span className="subtext">
            {initialDate} / 商品 {products.length}件 / 社内部屋 {workAreas.length}件 / 出勤 {availableShiftCount}名
          </span>
        </div>
        <Link className="production-plans-overview-next" href={nextAction.href}>
          次: {nextAction.label}
        </Link>
      </div>
      <div className="production-plans-overview-grid" aria-label="自動作成の準備フロー">
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
      <AutoScheduleForm
        initialDate={initialDate}
        autoLoadSuggestions={autoLoadSuggestions}
        workAreas={workAreas.map((workArea) => ({
          id: workArea.id,
          name: workArea.name,
        }))}
        products={products.map((product) => ({
          id: product.id,
          productCode: product.productCode,
          officialName: product.officialName,
          specification: product.specification,
          brandName: product.brandName,
          unit: product.unit,
          casePackQty: product.casePackQty,
          productionType: product.productionType,
          standardProductionLotSize: product.standardProductionLotSize,
          defaultWorkAreaName: product.defaultWorkArea?.name ?? null,
          capacitySummary: capacitySummary(product.capacities, product.unit),
        }))}
      />
    </>
  );
}

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end] as const;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capacitySummary(
  capacities: { unitsPerPersonHour: number; workArea: { name: string } }[],
  unit: string,
) {
  if (capacities.length === 0) return null;
  const shown = capacities
    .slice(0, 2)
    .map((capacity) => `${capacity.workArea.name} ${formatCapacity(capacity.unitsPerPersonHour)}${unit}/人時`);
  const rest = capacities.length > shown.length ? ` 他${capacities.length - shown.length}件` : "";
  return `${shown.join(" / ")}${rest}`;
}

function formatCapacity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
