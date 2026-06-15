export type MonthlyInventoryItem = {
  id: string;
  code: string;
  name: string;
  supplierName?: string | null;
  unit: string;
};

export type MonthlyInventoryMovement = {
  itemId: string;
  effectiveDate: string;
  quantity: number;
  movementType?: string | null;
  expiryDate?: string | null;
  shippingDeadline?: string | null;
};

export type MonthlyInventoryDayCell = {
  date: string;
  usageQuantity: number;
  inboundQuantity: number;
  balanceQuantity: number;
  expiryDate: string | null;
  shippingDeadline: string | null;
};

export type MonthlyInventorySheetRow = {
  itemId: string;
  rowNo: number;
  code: string;
  name: string;
  supplierName: string;
  unit: string;
  openingQuantity: number;
  usageTotalQuantity: number;
  inboundTotalQuantity: number;
  monthEndQuantity: number;
  days: MonthlyInventoryDayCell[];
};

export type MonthlyInventorySheet = {
  month: string;
  monthLabel: string;
  dateFrom: string;
  dateTo: string;
  days: string[];
  rows: MonthlyInventorySheetRow[];
};

export function buildMonthlyInventorySheet(input: {
  month: string;
  items: MonthlyInventoryItem[];
  movements: MonthlyInventoryMovement[];
}): MonthlyInventorySheet {
  const dateFrom = `${input.month}-01`;
  const dateTo = endOfMonth(input.month);
  const days = eachDay(dateFrom, dateTo);
  const openingByItemId = new Map<string, number>();
  const movementMap = new Map<
    string,
    { usage: number; inbound: number; expiry: string | null; shipping: string | null }
  >();

  for (const movement of input.movements) {
    const date = movement.effectiveDate.slice(0, 10);
    if (date > dateTo) continue;
    if (date < dateFrom) {
      openingByItemId.set(
        movement.itemId,
        round4((openingByItemId.get(movement.itemId) ?? 0) + movement.quantity),
      );
      continue;
    }
    const key = `${movement.itemId}:${date}`;
    const cell = movementMap.get(key) ?? { usage: 0, inbound: 0, expiry: null, shipping: null };
    if (movement.quantity < 0) cell.usage += Math.abs(movement.quantity);
    if (movement.quantity > 0) cell.inbound += movement.quantity;
    // 同日に複数ロットが入った場合は、最も近い(早い)期限を残す＝制約が一番きつい日付。
    if (movement.expiryDate) cell.expiry = earlierDate(cell.expiry, movement.expiryDate.slice(0, 10));
    if (movement.shippingDeadline)
      cell.shipping = earlierDate(cell.shipping, movement.shippingDeadline.slice(0, 10));
    movementMap.set(key, cell);
  }

  const rows = [...input.items]
    .sort((a, b) => a.code.localeCompare(b.code, "ja") || a.name.localeCompare(b.name, "ja"))
    .map((item, index) => {
      let balance = openingByItemId.get(item.id) ?? 0;
      const openingQuantity = balance;
      let usageTotalQuantity = 0;
      let inboundTotalQuantity = 0;

      const dayCells = days.map((date) => {
        const movement =
          movementMap.get(`${item.id}:${date}`) ?? { usage: 0, inbound: 0, expiry: null, shipping: null };
        usageTotalQuantity += movement.usage;
        inboundTotalQuantity += movement.inbound;
        balance = round4(balance + movement.inbound - movement.usage);
        return {
          date,
          usageQuantity: round4(movement.usage),
          inboundQuantity: round4(movement.inbound),
          balanceQuantity: balance,
          expiryDate: movement.expiry,
          shippingDeadline: movement.shipping,
        };
      });

      return {
        itemId: item.id,
        rowNo: index + 1,
        code: item.code,
        name: item.name,
        supplierName: item.supplierName ?? "",
        unit: item.unit,
        openingQuantity,
        usageTotalQuantity: round4(usageTotalQuantity),
        inboundTotalQuantity: round4(inboundTotalQuantity),
        monthEndQuantity: balance,
        days: dayCells,
      };
    });

  return {
    month: input.month,
    monthLabel: `${Number(input.month.slice(5, 7))}月`,
    dateFrom,
    dateTo,
    days,
    rows,
  };
}

function eachDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

// 2つの日付(YYYY-MM-DD)のうち早い方を返す。null は無視する。
function earlierDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}
