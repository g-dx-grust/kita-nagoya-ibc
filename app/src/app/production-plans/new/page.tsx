import { prisma } from "@/lib/prisma";
import PlanForm from "../plan-form";

export const dynamic = "force-dynamic";

export default async function NewProductionPlanPage() {
  const [products, workAreas] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { capacities: true, defaultWorkArea: true },
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

  return (
    <>
      <h1>生産予定を新規登録</h1>
      <PlanForm products={productOptions} workAreas={workAreas} />
    </>
  );
}
