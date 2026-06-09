import { prisma } from "@/lib/prisma";
import ProductCreateForm from "./product-create-form";
import ProductsMasterTable, { type ProductRow } from "./products-master-table";
import CsvImport from "../csv-import";
import { kitagoyaApiPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, workAreas, bomGroups, capacityGroups, billingGroups] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: {
        aliases: true,
        defaultWorkArea: true,
        capacities: { include: { workArea: true } },
        bomItems: true,
      },
      orderBy: { productCode: "asc" },
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
    // 登録状況バッジ用に「設定有無」だけを1クエリずつ集計する(商品ごとのN回問い合わせを避ける)。
    prisma.productBomItem.groupBy({ by: ["productId"] }),
    prisma.productionCapacity.groupBy({ by: ["productId"] }),
    prisma.billingPrice.groupBy({ by: ["productId"] }),
  ]);

  const bomSet = new Set(bomGroups.map((g) => g.productId));
  const capacitySet = new Set(capacityGroups.map((g) => g.productId));
  const billingSet = new Set(billingGroups.map((g) => g.productId));

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    officialName: p.officialName,
    displayName: p.displayName,
    aliases: p.aliases.map((a) => a.aliasName),
    packSizeG: p.packSizeG,
    casePackQty: p.casePackQty,
    packCount: p.packCount,
    specification: p.specification,
    packCountExpression: p.packCountExpression,
    bundleCount: p.bundleCount,
    brandName: p.brandName,
    bagTrayName: p.bagTrayName,
    cartonName: p.cartonName,
    accessoryName: p.accessoryName,
    sealCount: p.sealCount,
    sourceSheetName: p.sourceSheetName,
    sourceRowNumber: p.sourceRowNumber,
    unit: p.unit,
    productionType: p.productionType,
    forecastMethod: p.forecastMethod,
    category: p.category,
    safetyStockQuantity: p.safetyStockQuantity,
    standardProductionLotSize: p.standardProductionLotSize,
    defaultWorkAreaName: p.defaultWorkArea?.name ?? null,
    bomItemCount: p.bomItems.length,
    capacitySummary: capacitySummary(p.capacities, p.unit),
    billingEnabled: p.billingEnabled,
    usedAtKitagoya: p.usedAtKitagoya,
    hasBom: bomSet.has(p.id),
    hasCapacity: capacitySet.has(p.id),
    hasBilling: billingSet.has(p.id),
    validFromLabel: formatDate(p.validFrom),
    validToLabel: formatDate(p.validTo),
  }));

  return (
    <>
      <h1>商品マスター</h1>
      <ProductCreateForm workAreas={workAreas} />
      <ProductsMasterTable products={rows} />

      <div className="panel after-table">
        <strong>CSV取り込み</strong>
        <CsvImport endpoint={kitagoyaApiPath("/import/products")} templateType="products" />
      </div>
    </>
  );
}

function capacitySummary(
  capacities: { unitsPerPersonHour: number; workArea: { name: string } }[],
  unit: string,
) {
  if (capacities.length === 0) return "未登録";
  const shown = capacities
    .slice(0, 2)
    .map((capacity) => `${capacity.workArea.name} ${formatCapacity(capacity.unitsPerPersonHour)}${unit}/人時`);
  const rest = capacities.length > shown.length ? ` 他${capacities.length - shown.length}件` : "";
  return `${shown.join(" / ")}${rest}`;
}

function formatCapacity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "-";
}
