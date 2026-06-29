import { refreshCumulativeMaterialRequirements } from "./material-forecast";
import { syncPlanBackingStatuses } from "./plan-backing";
import { enqueuePurchaseOrderReplanEvents } from "./replan-service";

export type PurchaseOrderRefreshFields = {
  id?: string | null;
  status?: string | null;
  itemType?: string | null;
  itemId?: string | null;
  shortageDate: Date | null;
  expectedArrivalDate: Date | null;
  recommendedOrderDate: Date | null;
  receivedDate?: Date | null;
};

export async function refreshAroundPurchaseOrder(
  before: PurchaseOrderRefreshFields,
  after?: PurchaseOrderRefreshFields,
) {
  const dates = [
    before.shortageDate,
    before.expectedArrivalDate,
    before.recommendedOrderDate,
    before.receivedDate,
    after?.shortageDate,
    after?.expectedArrivalDate,
    after?.recommendedOrderDate,
    after?.receivedDate,
  ].filter((date): date is Date => !!date);
  const replanEvents = await enqueuePurchaseOrderReplanEvents({ before, after });
  if (dates.length === 0) return { replanEvents };

  const dateFrom = new Date(Math.min(...dates.map((date) => date.getTime())));
  const dateTo = new Date(Math.max(...dates.map((date) => date.getTime())));
  dateTo.setDate(dateTo.getDate() + 90);
  const forecast = await refreshCumulativeMaterialRequirements({ dateFrom, dateTo });
  const affectedPlanIds = [...new Set(forecast.lines.map((line) => line.productionPlanId))];
  const backingStatusSync = await syncPlanBackingStatuses(affectedPlanIds);
  return { forecast, backingStatusSync, replanEvents };
}
