import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  PackageCheck,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { kitagoyaPath } from "@/lib/paths";
import { prisma } from "@/lib/prisma";
import CapacityReviewTable, { type CapacityReviewRow } from "./capacity-review-table";

export const dynamic = "force-dynamic";

export default async function CapacityReviewPage() {
  const [products, workAreas] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: {
        defaultWorkArea: true,
        capacities: {
          include: { workArea: true },
        },
      },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({
      where: { active: true, areaType: "internal", externalFlag: false },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: CapacityReviewRow[] = products.flatMap((product) => {
    const internalCapacities = product.capacities.filter(
      (capacity) =>
        capacity.workArea.active &&
        capacity.workArea.areaType === "internal" &&
        !capacity.workArea.externalFlag,
    );
    const byWorkArea = new Map(internalCapacities.map((capacity) => [capacity.workAreaId, capacity]));
    const productHasAnyCapacity = internalCapacities.length > 0;
    const primaryWorkAreaId =
      product.defaultWorkAreaId && workAreas.some((workArea) => workArea.id === product.defaultWorkAreaId)
        ? product.defaultWorkAreaId
        : workAreas[0]?.id ?? null;

    return workAreas.map((workArea) => {
      const capacity = byWorkArea.get(workArea.id);
      return {
        productId: product.id,
        productCode: product.productCode,
        productName: product.officialName,
        productionType: product.productionType,
        unit: product.unit,
        standardProductionLotSize: product.standardProductionLotSize,
        defaultWorkAreaId: product.defaultWorkAreaId,
        defaultWorkAreaName: product.defaultWorkArea?.name ?? null,
        workAreaId: workArea.id,
        workAreaName: workArea.name,
        capacityId: capacity?.id ?? null,
        unitsPerPersonHour: capacity?.unitsPerPersonHour ?? null,
        standardPeople: capacity?.standardPeople ?? 1,
        standardBreakMinutes: capacity?.standardBreakMinutes ?? 0,
        candidatePriority: capacity?.candidatePriority ?? candidatePriorityFor(product.defaultWorkAreaId, workAreas, workArea.id),
        reviewStatus: reviewStatus(capacity?.reviewStatus),
        reviewMemo: capacity?.reviewMemo ?? "",
        reviewedAt: capacity?.reviewedAt?.toISOString() ?? null,
        missingCapacity: !capacity,
        productHasAnyCapacity,
        isPrimaryReviewRow: workArea.id === primaryWorkAreaId,
      };
    });
  });
  const registeredCapacityCount = rows.filter((row) => row.unitsPerPersonHour != null).length;
  const defaultMissingCount = products.filter((product) => !product.defaultWorkAreaId).length;
  const primaryMissingCapacityCount = rows.filter((row) => row.isPrimaryReviewRow && row.missingCapacity).length;
  const missingProductCount = rows.filter((row) => !row.productHasAnyCapacity && row.isPrimaryReviewRow).length;
  const unreviewedRegisteredCount = rows.filter(
    (row) => row.unitsPerPersonHour != null && row.reviewStatus === "unreviewed",
  ).length;
  const needsReviewCount = rows.filter((row) => row.reviewStatus === "needs_review").length;
  const suspiciousCapacityCount = rows.filter(hasSuspiciousCapacity).length;
  const actionNeededCount = rows.filter(needsCapacityAction).length;
  const readyProductCount = rows.filter(
    (row) => row.isPrimaryReviewRow && row.defaultWorkAreaId && row.unitsPerPersonHour != null,
  ).length;
  const readinessIssues =
    (products.length === 0 ? 1 : 0) +
    (workAreas.length === 0 ? 1 : 0) +
    (defaultMissingCount > 0 ? 1 : 0) +
    (primaryMissingCapacityCount > 0 ? 1 : 0) +
    (actionNeededCount > 0 ? 1 : 0);
  const readinessTone = readinessIssues > 0 ? "warn" : "success";
  const nextAction =
    products.length === 0
      ? { label: "商品を登録", href: kitagoyaPath("/masters/products") }
      : workAreas.length === 0
        ? { label: "作業場所を登録", href: kitagoyaPath("/masters/work-areas") }
        : defaultMissingCount > 0
          ? { label: "標準作業場所を設定", href: kitagoyaPath("/masters/products") }
          : primaryMissingCapacityCount > 0
            ? { label: "標準能力を確認", href: "#capacity-review-table" }
            : actionNeededCount > 0
              ? { label: "確認待ちを処理", href: "#capacity-review-table" }
              : { label: "生産予定へ進む", href: kitagoyaPath("/production-plans/new") };
  const flowCards: {
    label: string;
    count: number | string;
    detail: string;
    href: string;
    tone: "info" | "warn" | "danger" | "success";
    Icon: LucideIcon;
  }[] = [
    {
      label: "商品",
      count: products.length,
      detail: `準備済み ${readyProductCount.toLocaleString()} / 標準未設定 ${defaultMissingCount.toLocaleString()}`,
      href: defaultMissingCount > 0 ? kitagoyaPath("/masters/products") : "#capacity-review-table",
      tone: products.length === 0 || defaultMissingCount > 0 ? "warn" : "success",
      Icon: PackageCheck,
    },
    {
      label: "作業場所",
      count: workAreas.length,
      detail: "内部作業場所",
      href: workAreas.length > 0 ? "#capacity-review-table" : kitagoyaPath("/masters/work-areas"),
      tone: workAreas.length > 0 ? "success" : "warn",
      Icon: Users,
    },
    {
      label: "標準能力",
      count: primaryMissingCapacityCount,
      detail: `商品能力未登録 ${missingProductCount.toLocaleString()} / 登録済み ${registeredCapacityCount.toLocaleString()}`,
      href: "#capacity-review-table",
      tone: primaryMissingCapacityCount > 0 || missingProductCount > 0 ? "danger" : "success",
      Icon: ListChecks,
    },
    {
      label: "確認待ち",
      count: actionNeededCount,
      detail: `未確認 ${unreviewedRegisteredCount.toLocaleString()} / 要再確認 ${needsReviewCount.toLocaleString()}`,
      href: "#capacity-review-table",
      tone: actionNeededCount > 0 ? "warn" : "success",
      Icon: CheckCircle2,
    },
    {
      label: "生産予定",
      count: suspiciousCapacityCount > 0 ? "確認" : "次へ",
      detail: `異常値候補 ${suspiciousCapacityCount.toLocaleString()}`,
      href: suspiciousCapacityCount > 0 ? "#capacity-review-table" : kitagoyaPath("/production-plans/new"),
      tone: suspiciousCapacityCount > 0 ? "warn" : "info",
      Icon: ClipboardList,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <h1>生産能力チェック</h1>
        <div className="page-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath("/masters/products")}>
            <PackageCheck size={16} aria-hidden="true" />
            商品
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/masters/work-areas")}>
            <Users size={16} aria-hidden="true" />
            作業場所
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans/new")}>
            <Table2 size={16} aria-hidden="true" />
            生産予定
          </Link>
          <HelpTooltip text="商品ごとの普段の人数、時間、生産数量から、1時間1人あたり生産量を確認・修正します。" />
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
          <strong>能力確認の準備フロー</strong>
          <span className="subtext">
            商品 {products.length.toLocaleString()}件 / 社内部屋 {workAreas.length.toLocaleString()}件 / 確認待ち{" "}
            {actionNeededCount.toLocaleString()}件
          </span>
        </div>
        <Link className="production-plans-overview-next" href={nextAction.href}>
          次: {nextAction.label}
        </Link>
      </div>
      <div className="production-plans-overview-grid" aria-label="生産能力チェックの確認フロー">
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
      <section id="capacity-review-table" className="anchor-offset">
        <CapacityReviewTable rows={rows} />
      </section>
    </>
  );
}

function candidatePriorityFor(defaultWorkAreaId: string | null, workAreas: { id: string }[], workAreaId: string) {
  const ordered = [
    ...(defaultWorkAreaId && workAreas.some((workArea) => workArea.id === defaultWorkAreaId)
      ? [defaultWorkAreaId]
      : []),
    ...workAreas.map((workArea) => workArea.id).filter((id) => id !== defaultWorkAreaId),
  ];
  const index = ordered.indexOf(workAreaId);
  return index >= 0 ? index + 1 : null;
}

function reviewStatus(value: string | null | undefined): CapacityReviewRow["reviewStatus"] {
  if (value === "confirmed" || value === "needs_review") return value;
  return "unreviewed";
}

function hasSuspiciousCapacity(row: CapacityReviewRow) {
  return row.unitsPerPersonHour != null && (row.unitsPerPersonHour <= 10 || row.unitsPerPersonHour >= 300);
}

function needsCapacityAction(row: CapacityReviewRow) {
  if (row.reviewStatus === "needs_review") return true;
  if (row.unitsPerPersonHour != null && row.reviewStatus !== "confirmed") return true;
  if (!row.productHasAnyCapacity) return row.isPrimaryReviewRow;
  return hasSuspiciousCapacity(row);
}
