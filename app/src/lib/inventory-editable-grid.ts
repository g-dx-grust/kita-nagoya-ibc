// Excelライクのセル編集グリッド用モデル。
// 在庫表を「自動(日報・確定など)」と「手入力(grid)」に分けて持ち、手入力分を加算オーバーレイとして扱う。
// 編集セル = 手入力分。残・合計は auto + grid から自動計算(読取専用)。

export type EditableGridItem = {
  id: string;
  code: string;
  name: string;
  supplierName?: string | null;
  unit: string;
};

// grid管理(編集対象)の種別。auto(自動)の行は gridKind 未指定。
export type EditableGridKind = "inbound" | "usage" | "opening";

export type EditableGridMovement = {
  itemId: string;
  effectiveDate: string; // YYYY-MM-DD
  quantity: number; // 符号付き(＋入荷/−使用)
  gridKind?: EditableGridKind | null; // null/未指定 = 自動
  gridMonth?: string | null; // openingの対象月(YYYY-MM)。openingのみ使用
  expiryDate?: string | null;
  shippingDeadline?: string | null;
};

export type EditableGridDay = {
  date: string;
  autoInbound: number;
  autoUsage: number;
  gridInbound: number; // 手入力入荷(編集初期値)
  gridUsage: number; // 手入力使用量(編集初期値, 正の量)
  gridExpiry: string | null;
  gridShipping: string | null;
};

export type EditableGridRow = {
  itemId: string;
  rowNo: number;
  code: string;
  name: string;
  supplierName: string;
  unit: string;
  openingAuto: number; // 自動の前月繰越(他月のgrid期首も含む)
  gridOpening: number; // 当月の手入力期首(編集初期値)
  days: EditableGridDay[];
};

export type EditableGrid = {
  month: string;
  monthLabel: string;
  dateFrom: string;
  dateTo: string;
  days: string[];
  rows: EditableGridRow[];
};

export function buildEditableGrid(input: {
  month: string;
  items: EditableGridItem[];
  movements: EditableGridMovement[];
}): EditableGrid {
  const dateFrom = `${input.month}-01`;
  const dateTo = endOfMonth(input.month);
  const days = eachDay(dateFrom, dateTo);

  type Acc = {
    openingAuto: number;
    gridOpening: number;
    byDate: Map<string, EditableGridDay>;
  };
  const acc = new Map<string, Acc>();
  const ensure = (itemId: string): Acc => {
    let a = acc.get(itemId);
    if (!a) {
      a = { openingAuto: 0, gridOpening: 0, byDate: new Map() };
      acc.set(itemId, a);
    }
    return a;
  };
  const ensureDay = (a: Acc, date: string): EditableGridDay => {
    let d = a.byDate.get(date);
    if (!d) {
      d = {
        date,
        autoInbound: 0,
        autoUsage: 0,
        gridInbound: 0,
        gridUsage: 0,
        gridExpiry: null,
        gridShipping: null,
      };
      a.byDate.set(date, d);
    }
    return d;
  };

  for (const m of input.movements) {
    const date = m.effectiveDate.slice(0, 10);
    if (date > dateTo) continue;
    const a = ensure(m.itemId);

    if (date < dateFrom) {
      // 繰越: 当月の手入力期首だけ gridOpening、それ以外(自動・他月のgrid期首)は openingAuto。
      if (m.gridKind === "opening" && m.gridMonth === input.month) {
        a.gridOpening = round4(a.gridOpening + m.quantity);
      } else {
        a.openingAuto = round4(a.openingAuto + m.quantity);
      }
      continue;
    }

    const day = ensureDay(a, date);
    if (m.gridKind === "inbound") {
      day.gridInbound = round4(day.gridInbound + m.quantity);
      if (m.expiryDate) day.gridExpiry = earlierDate(day.gridExpiry, m.expiryDate.slice(0, 10));
      if (m.shippingDeadline)
        day.gridShipping = earlierDate(day.gridShipping, m.shippingDeadline.slice(0, 10));
    } else if (m.gridKind === "usage") {
      day.gridUsage = round4(day.gridUsage + Math.abs(m.quantity));
    } else {
      // 自動(日報実績など)。符号で入荷/使用に振り分ける。
      if (m.quantity > 0) day.autoInbound = round4(day.autoInbound + m.quantity);
      else if (m.quantity < 0) day.autoUsage = round4(day.autoUsage + Math.abs(m.quantity));
    }
  }

  const rows = [...input.items]
    .sort((a, b) => a.code.localeCompare(b.code, "ja") || a.name.localeCompare(b.name, "ja"))
    .map((item, index) => {
      const a = acc.get(item.id);
      const dayCells = days.map(
        (date): EditableGridDay =>
          a?.byDate.get(date) ?? {
            date,
            autoInbound: 0,
            autoUsage: 0,
            gridInbound: 0,
            gridUsage: 0,
            gridExpiry: null,
            gridShipping: null,
          },
      );
      return {
        itemId: item.id,
        rowNo: index + 1,
        code: item.code,
        name: item.name,
        supplierName: item.supplierName ?? "",
        unit: item.unit,
        openingAuto: a?.openingAuto ?? 0,
        gridOpening: a?.gridOpening ?? 0,
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

// 残・合計を auto+grid から算出する純関数。クライアントの初期表示にも、編集中のライブ再計算にも使う。
export function computeGridBalances(input: {
  openingAuto: number;
  gridOpening: number;
  days: { autoInbound: number; autoUsage: number; gridInbound: number; gridUsage: number }[];
}): {
  opening: number;
  balances: number[];
  monthEnd: number;
  usageTotal: number;
  inboundTotal: number;
} {
  const opening = round4(input.openingAuto + input.gridOpening);
  let balance = opening;
  let usageTotal = 0;
  let inboundTotal = 0;
  const balances = input.days.map((d) => {
    const inbound = (d.autoInbound || 0) + (d.gridInbound || 0);
    const usage = (d.autoUsage || 0) + (d.gridUsage || 0);
    inboundTotal += inbound;
    usageTotal += usage;
    balance = round4(balance + inbound - usage);
    return balance;
  });
  return {
    opening,
    balances,
    monthEnd: balance,
    usageTotal: round4(usageTotal),
    inboundTotal: round4(inboundTotal),
  };
}

// grid期首movementの日付(対象月の前日 = 前月末)。前月繰越として算入させる。
export function openingEffectiveDate(month: string): string {
  return addDays(`${month}-01`, -1);
}

function eachDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) days.push(date);
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

function earlierDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
