import { refreshCumulativeMaterialRequirements } from "./material-forecast";

export type PurchaseOrderRefreshFields = {
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
  if (dates.length === 0) return;

  const dateFrom = new Date(Math.min(...dates.map((date) => date.getTime())));
  const dateTo = new Date(Math.max(...dates.map((date) => date.getTime())));
  dateTo.setDate(dateTo.getDate() + 90);
  await refreshCumulativeMaterialRequirements({ dateFrom, dateTo });
}
