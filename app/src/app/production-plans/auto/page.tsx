import Link from "next/link";
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
  const initialDate = sp.date ?? new Date().toISOString().slice(0, 10);
  const autoLoadSuggestions = sp.loadSuggestions === "1";
  const [products, workAreas] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { defaultWorkArea: true, capacities: { include: { workArea: true } } },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({
      where: { active: true, areaType: "internal", externalFlag: false },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <div className="toolbar">
        <h1>生産スケジュール自動作成</h1>
        <div className="spacer" />
        <Link href={kitagoyaPath(`/shifts?date=${initialDate}`)}>シフトを確認</Link>
      </div>
      <p className="section-note">
        今日作る商品を選ぶと、対象日の出勤シフトに合わせて作業順、作業場所、スタッフ配置を自動作成します。休みまたはシフト未登録のスタッフは配置・印刷対象に含めません。
      </p>
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
