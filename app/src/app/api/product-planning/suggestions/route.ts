import { handleError, ok } from "@/lib/http";
import { loadProductPlanningSuggestions } from "@/lib/product-planning-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(url.searchParams.get("dateFrom") ?? today);
    const dateTo = new Date(url.searchParams.get("dateTo") ?? addDays(dateFrom, 30));
    const suggestions = await loadProductPlanningSuggestions({ dateFrom, dateTo });
    return ok({ dateFrom: dateFrom.toISOString().slice(0, 10), dateTo: dateTo.toISOString().slice(0, 10), suggestions });
  } catch (e) {
    return handleError(e);
  }
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
