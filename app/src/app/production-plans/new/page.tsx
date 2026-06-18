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
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import PlanForm from "../plan-form";

export const dynamic = "force-dynamic";

export default async function NewProductionPlanPage() {
  const [products, workAreas] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { capacities: true },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const today = toDateInputValue(new Date());
  const missingDefaultAreaCount = products.filter((product) => !product.defaultWorkAreaId).length;
  const missingCapacityCount = products.filter((product) => product.capacities.length === 0).length;
  const readyProductCount = products.filter(
    (product) => product.defaultWorkAreaId && product.capacities.length > 0,
  ).length;
  const readinessIssues =
    (products.length === 0 ? 1 : 0) +
    (workAreas.length === 0 ? 1 : 0) +
    missingCapacityCount;
  const readinessTone = readinessIssues > 0 ? "warn" : "success";
  const nextAction =
    products.length === 0
      ? { label: "商品を登録", href: kitagoyaPath("/masters/products") }
      : workAreas.length === 0
        ? { label: "作業場所を登録", href: kitagoyaPath("/masters/work-areas") }
        : missingCapacityCount > 0
          ? { label: "能力未登録を確認", href: kitagoyaPath("/capacity-review") }
          : missingDefaultAreaCount > 0
            ? { label: "標準作業場所を確認", href: kitagoyaPath("/masters/products") }
            : { label: "入力を開始", href: "#production-plan-form" };
  const flowCards: {
    label: string;
    count: number | string;
    detail: string;
    href: string;
    tone: "info" | "warn" | "danger" | "success";
    Icon: LucideIcon;
  }[] = [
    {
      label: "生産日",
      count: today.slice(5).replace("-", "/"),
      detail: "初期値は今日",
      href: "#production-plan-form",
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "商品",
      count: products.length,
      detail: `準備済み ${readyProductCount}`,
      href: products.length > 0 ? "#production-plan-form" : kitagoyaPath("/masters/products"),
      tone: products.length > 0 ? "success" : "warn",
      Icon: PackageCheck,
    },
    {
      label: "作業場所",
      count: workAreas.length,
      detail: `標準未設定 ${missingDefaultAreaCount}`,
      href: workAreas.length > 0 ? "#production-plan-form" : kitagoyaPath("/masters/work-areas"),
      tone: workAreas.length > 0 ? "success" : "warn",
      Icon: Users,
    },
    {
      label: "能力登録",
      count: missingCapacityCount,
      detail: "未登録商品",
      href: missingCapacityCount > 0 ? kitagoyaPath("/capacity-review") : "#production-plan-form",
      tone: missingCapacityCount > 0 ? "danger" : "success",
      Icon: ListChecks,
    },
    {
      label: "自動作成",
      count: "任意",
      detail: "複数商品を一括",
      href: kitagoyaPath("/production-plans/auto"),
      tone: "info",
      Icon: ClipboardList,
    },
  ];

  const productOptions = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    officialName: p.officialName,
    specification: p.specification,
    brandName: p.brandName,
    unit: p.unit,
    casePackQty: p.casePackQty,
    defaultWorkAreaId: p.defaultWorkAreaId,
    capacities: p.capacities.map((c) => ({
      workAreaId: c.workAreaId,
      unitsPerPersonHour: c.unitsPerPersonHour,
      standardPeople: c.standardPeople,
      standardBreakMinutes: c.standardBreakMinutes,
    })),
  }));
  const workAreaOptions = workAreas.map((workArea) => ({
    id: workArea.id,
    name: workArea.name,
  }));

  return (
    <>
      <div className="page-title-row">
        <h1>生産予定を新規登録</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans/auto")}>
            <ClipboardList size={16} aria-hidden="true" />
            自動作成
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/capacity-review")}>
            <ListChecks size={16} aria-hidden="true" />
            能力確認
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans")}>
            <Table2 size={16} aria-hidden="true" />
            一覧へ戻る
          </Link>
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
          <strong>手入力の準備フロー</strong>
          <span className="subtext">
            商品 {products.length}件 / 作業場所 {workAreas.length}件 / 能力未登録 {missingCapacityCount}件
          </span>
        </div>
        <Link className="production-plans-overview-next" href={nextAction.href}>
          次: {nextAction.label}
        </Link>
      </div>
      <div className="production-plans-overview-grid" aria-label="生産予定手入力の準備フロー">
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
      <section id="production-plan-form" className="anchor-offset">
        <PlanForm products={productOptions} workAreas={workAreaOptions} />
      </section>
    </>
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
