import { handleError, ok } from "@/lib/http";
import {
  loadInventoryVisibilityDashboard,
  type InventoryVisibilityItemType,
} from "@/lib/inventory-visibility";
import { normalizeYearMonth } from "@/lib/monthly-flow-progress";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const targetMonth = normalizeYearMonth(url.searchParams.get("targetMonth") ?? url.searchParams.get("month"));
    const itemType = parseItemType(url.searchParams.get("itemType") ?? url.searchParams.get("tab"));
    const dashboard = await loadInventoryVisibilityDashboard({ targetMonth, itemType });
    return ok({ rowCount: dashboard.rows.length, ...dashboard });
  } catch (e) {
    return handleError(e);
  }
}

function parseItemType(value: string | null): InventoryVisibilityItemType {
  if (value === "raw" || value === "raw_material") return "raw_material";
  if (value === "packaging") return "packaging";
  return "product";
}
