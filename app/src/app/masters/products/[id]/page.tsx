import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { kitagoyaPath } from "@/lib/paths";
import ProductEditor from "./product-editor";

export const dynamic = "force-dynamic";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, workAreas, materials, packagingMaterials] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        aliases: true,
        bomItems: true,
        capacities: true,
        billingPrices: { orderBy: { effectiveFrom: "desc" } },
      },
    }),
    prisma.workArea.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
    prisma.material.findMany({ where: { active: true }, orderBy: { materialCode: "asc" } }),
    prisma.packagingMaterial.findMany({
      where: { active: true },
      orderBy: { materialCode: "asc" },
    }),
  ]);
  if (!product) notFound();

  return (
    <>
      <div className="toolbar">
        <Link href={kitagoyaPath("/masters/products")}>← 一覧へ</Link>
      </div>
      <h1>
        {product.productCode} ・ {product.officialName}
      </h1>
      <ProductEditor
        product={{
          id: product.id,
          productCode: product.productCode,
          officialName: product.officialName,
          displayName: product.displayName,
          productionType: product.productionType,
          forecastMethod: product.forecastMethod,
          safetyStockQuantity: product.safetyStockQuantity,
          standardProductionLotSize: product.standardProductionLotSize,
          schedulePriority: product.schedulePriority,
          unit: product.unit,
          packSizeG: product.packSizeG,
          packCount: product.packCount,
          casePackQty: product.casePackQty,
          sourceSystem: product.sourceSystem,
          sourceProductKey: product.sourceProductKey,
          sourceSheetName: product.sourceSheetName,
          sourceRowNumber: product.sourceRowNumber,
          specification: product.specification,
          packCountExpression: product.packCountExpression,
          bundleCount: product.bundleCount,
          brandName: product.brandName,
          bagTrayName: product.bagTrayName,
          cartonName: product.cartonName,
          accessoryName: product.accessoryName,
          sealCount: product.sealCount,
          classificationNote: product.classificationNote,
          rawMaterialNote: product.rawMaterialNote,
          defaultWorkAreaId: product.defaultWorkAreaId,
          validFrom: product.validFrom ? product.validFrom.toISOString().slice(0, 10) : null,
          validTo: product.validTo ? product.validTo.toISOString().slice(0, 10) : null,
          billingEnabled: product.billingEnabled,
          usedAtKitagoya: product.usedAtKitagoya,
          active: product.active,
          aliases: product.aliases.map((a) => a.aliasName),
          note: product.note,
        }}
        bom={product.bomItems.map((b) => ({
          itemType: b.itemType as "raw_material" | "packaging",
          itemId: b.itemId,
          quantityPerUnit: b.quantityPerUnit,
          unit: b.unit,
          lossRate: b.lossRate,
        }))}
        capacities={product.capacities.map((c) => ({
          id: c.id,
          workAreaId: c.workAreaId,
          unitsPerPersonHour: c.unitsPerPersonHour,
          standardPeople: c.standardPeople,
          standardBreakMinutes: c.standardBreakMinutes,
        }))}
        billingPrices={product.billingPrices.map((price) => ({
          id: price.id,
          unitPrice: price.unitPrice,
          unit: price.unit,
          effectiveFrom: price.effectiveFrom.toISOString().slice(0, 10),
          effectiveTo: price.effectiveTo ? price.effectiveTo.toISOString().slice(0, 10) : null,
          billingTarget: price.billingTarget,
        }))}
        workAreas={workAreas}
        materials={materials.map((m) => ({ id: m.id, code: m.materialCode, name: m.name, unit: m.unit }))}
        packaging={packagingMaterials.map((m) => ({
          id: m.id,
          code: m.materialCode,
          name: m.name,
          unit: m.unit,
        }))}
      />
    </>
  );
}
