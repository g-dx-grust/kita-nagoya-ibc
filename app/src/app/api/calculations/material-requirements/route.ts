import { computeMaterialRequirements } from "@/lib/calculations";
import { handleError, ok, parseJson } from "@/lib/http";
import { getInventoryFor } from "@/lib/inventory";
import { loadProductBom } from "@/lib/plan-engine";
import { CalcMaterialRequirementsSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, CalcMaterialRequirementsSchema);
    const asOf = body.asOfDate ? new Date(body.asOfDate) : new Date();
    const bom = await loadProductBom(body.productId, asOf);

    const rmIds = bom.filter((b) => b.itemType === "raw_material").map((b) => b.itemId);
    const pkIds = bom.filter((b) => b.itemType === "packaging").map((b) => b.itemId);
    const [rm, pk] = await Promise.all([
      getInventoryFor("raw_material", rmIds, asOf),
      getInventoryFor("packaging", pkIds, asOf),
    ]);
    const inventory: Record<
      string,
      { onHand: number; confirmedInbound: number; unconfirmedInbound: number }
    > = { ...rm, ...pk };

    const lines = computeMaterialRequirements({ quantity: body.quantity, bom, inventory });
    return ok({ items: lines });
  } catch (e) {
    return handleError(e);
  }
}
