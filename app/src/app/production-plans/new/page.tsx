import Link from "next/link";
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
          <Link className="button-link secondary-link" href={kitagoyaPath("/production-plans")}>
            一覧へ戻る
          </Link>
        </div>
      </div>
      <PlanForm products={productOptions} workAreas={workAreaOptions} />
    </>
  );
}
