import { handleError, ok } from "@/lib/http";
import { getInventoryFor } from "@/lib/inventory";
import { INVENTORY_LEDGER_STATUS } from "@/lib/inventory-types";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const itemType = (url.searchParams.get("itemType") ?? "raw_material") as
      | "product"
      | "raw_material"
      | "packaging";
    const dateParam = url.searchParams.get("date");
    const asOf = dateParam ? new Date(dateParam) : new Date();

    const items =
      itemType === "product"
        ? await prisma.product.findMany({ where: { active: true } })
        : itemType === "raw_material"
          ? await prisma.material.findMany({ where: { active: true } })
          : await prisma.packagingMaterial.findMany({ where: { active: true } });

    const inv = await getInventoryFor(
      itemType,
      items.map((i) => i.id),
      asOf,
    );
    return ok(
      items.map((i) => ({
        id: i.id,
        materialCode: "materialCode" in i ? i.materialCode : i.productCode,
        productCode: "productCode" in i ? i.productCode : undefined,
        name: "name" in i ? i.name : i.officialName,
        officialName: "officialName" in i ? i.officialName : undefined,
        unit: i.unit,
        status: INVENTORY_LEDGER_STATUS.CONFIRMED,
        ...inv[i.id],
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}
