export type PurchaseOrderUrgency = "CRITICAL" | "WARNING" | "INFO" | "NONE";

export function computeUrgency(input: {
  requiredOrderDate: Date | null;
  asOfDate: Date;
}): PurchaseOrderUrgency {
  if (!input.requiredOrderDate) return "NONE";

  const msPerDay = 24 * 60 * 60 * 1000;
  const requiredDay = startOfDay(input.requiredOrderDate);
  const asOfDay = startOfDay(input.asOfDate);
  const diffDays = Math.floor((requiredDay.getTime() - asOfDay.getTime()) / msPerDay);

  if (diffDays <= 1) return "CRITICAL";
  if (diffDays <= 7) return "WARNING";
  return "INFO";
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
