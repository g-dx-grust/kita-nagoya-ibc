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
        unit: product.unit,
        standardProductionLotSize: product.standardProductionLotSize,
        defaultWorkAreaName: product.defaultWorkArea?.name ?? null,
        workAreaId: workArea.id,
        workAreaName: workArea.name,
        capacityId: capacity?.id ?? null,
        unitsPerPersonHour: capacity?.unitsPerPersonHour ?? null,
        standardPeople: capacity?.standardPeople ?? 1,
        standardBreakMinutes: capacity?.standardBreakMinutes ?? 0,
        reviewStatus: reviewStatus(capacity?.reviewStatus),
        reviewMemo: capacity?.reviewMemo ?? "",
        reviewedAt: capacity?.reviewedAt?.toISOString() ?? null,
        missingCapacity: !capacity,
        productHasAnyCapacity,
        isPrimaryReviewRow: workArea.id === primaryWorkAreaId,
      };
    });
  });

  return (
    <>
      <h1>生産能力チェック</h1>
      <p className="section-note">
        訪問時に、商品ごとの「普段何人で、何時間で、何袋作れるか」を聞きながら、
        1時間1人あたり生産量を確認・修正する画面です。
      </p>
      <CapacityReviewTable rows={rows} />
    </>
  );
}

function reviewStatus(value: string | null | undefined): CapacityReviewRow["reviewStatus"] {
  if (value === "confirmed" || value === "needs_review") return value;
  return "unreviewed";
}
