import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";
import { CASE_UNIT, quantityToCases } from "@/lib/units";

export type PurchaseOrderDocumentInput = {
  purchaseOrder: {
    id: string;
    code: string;
    status: string;
    urgency: string;
    orderedQuantity: number;
    receivedQuantity?: number | null;
    unitPrice?: number | null;
    totalAmount?: number | null;
    shortageDate?: Date | null;
    recommendedOrderDate?: Date | null;
    note?: string | null;
    createdAt: Date;
  };
  item: {
    code: string;
    name: string;
    unit: string;
    // ケース入数 (1ケース=何基本単位か)。資材のみ設定、原料(kg)等は null。
    casePackQty?: number | null;
  };
  supplier: {
    name: string;
    contact?: string | null;
    orderingUnit?: string | null;
  };
  generatedAt: Date;
  isProvisional: boolean;
};

export type PurchaseOrderDocumentFormat = "xlsx" | "pdf";

export type PurchaseOrderDocumentRows = {
  title: string;
  header: { label: string; value: string }[];
  itemTable: { columns: string[]; rows: string[][] };
  footer: { label: string; value: string }[];
};

export function buildDocumentRows(input: PurchaseOrderDocumentInput): PurchaseOrderDocumentRows {
  const unitPrice = input.purchaseOrder.unitPrice ?? 0;
  const totalAmount =
    input.purchaseOrder.totalAmount ?? roundCurrency(input.purchaseOrder.orderedQuantity * unitPrice);

  // 業務ルール「発注は全てケース数で表記」。ケース入数のある資材だけケース数列を追加する。
  // 基本単位の数量は計算・台帳と整合させるため必ず残し、ケース数は表示用の切り上げ整数。
  const cases =
    input.item.casePackQty != null && input.item.casePackQty > 0
      ? quantityToCases(input.purchaseOrder.orderedQuantity, input.item.casePackQty)
      : null;
  const hasCases = cases != null;

  const baseColumns = ["品目コード", "品目名", "数量", "単位"];
  const baseValues = [
    input.item.code,
    input.item.name,
    formatNumber(input.purchaseOrder.orderedQuantity),
    input.item.unit,
  ];
  const caseColumns = hasCases ? [`ケース数(${CASE_UNIT})`] : [];
  const caseValues = hasCases ? [formatNumber(cases)] : [];
  const priceColumns = ["単価", "金額"];
  const priceValues = [formatCurrency(unitPrice), formatCurrency(totalAmount)];

  return {
    title: input.isProvisional ? "仮発注書" : "発注書",
    header: [
      { label: "仕入先名", value: input.supplier.name },
      { label: "発注日", value: formatDate(input.generatedAt) },
      { label: "希望納期", value: formatDate(input.purchaseOrder.shortageDate) },
      { label: "PO番号", value: input.purchaseOrder.code },
      { label: "緊急度", value: urgencyLabel(input.purchaseOrder.urgency) },
      { label: "連絡先", value: input.supplier.contact || "—" },
    ],
    itemTable: {
      columns: [...baseColumns, ...caseColumns, ...priceColumns],
      rows: [[...baseValues, ...caseValues, ...priceValues]],
    },
    footer: [
      { label: "推奨発注日", value: formatDate(input.purchaseOrder.recommendedOrderDate) },
      { label: "備考", value: input.purchaseOrder.note || "—" },
      { label: "発行元", value: "（自社名）" },
    ],
  };
}

export function renderPurchaseOrderXlsx(input: PurchaseOrderDocumentInput): Buffer {
  const rows = buildDocumentRows(input);
  const amount = rows.itemTable.rows[0]?.[rows.itemTable.columns.length - 1] ?? "0";
  // 合計行を金額列に揃える(数量〜単価の列数ぶん空ける)。
  const totalRow = rows.itemTable.columns.map((_, idx) =>
    idx === rows.itemTable.columns.length - 2
      ? "合計"
      : idx === rows.itemTable.columns.length - 1
        ? amount
        : "",
  );
  const sheetRows: string[][] = [
    [rows.title],
    [],
    ...rows.header.map((row) => [row.label, row.value]),
    [],
    rows.itemTable.columns,
    ...rows.itemTable.rows,
    totalRow,
    [],
    ...rows.footer.map((row) => [row.label, row.value]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet["!cols"] = rows.itemTable.columns.map(() => ({ wch: 16 }));
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: rows.title,
    Subject: input.purchaseOrder.code,
    CreatedDate: input.generatedAt,
  };
  XLSX.utils.book_append_sheet(workbook, sheet, "発注書");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

// CJKフォント(NotoSansJP)のバイト列をモジュールスコープでキャッシュし、
// ダウンロードのたびにディスクから再読込しないようにする。
let regularFontBytes: Uint8Array | null = null;
let boldFontBytes: Uint8Array | null = null;

function loadFontBytes(fileName: string): Uint8Array {
  const filePath = path.join(process.cwd(), "src", "assets", "fonts", fileName);
  return new Uint8Array(readFileSync(filePath));
}

function getRegularFontBytes(): Uint8Array {
  if (!regularFontBytes) regularFontBytes = loadFontBytes("NotoSansJP-Regular.ttf");
  return regularFontBytes;
}

function getBoldFontBytes(): Uint8Array {
  if (!boldFontBytes) boldFontBytes = loadFontBytes("NotoSansJP-Bold.ttf");
  return boldFontBytes;
}

export async function renderPurchaseOrderPdf(
  input: PurchaseOrderDocumentInput,
): Promise<Uint8Array> {
  const rows = buildDocumentRows(input);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // CJKグリフを描画するため日本語フォントを埋め込む。
  // subset:false で埋め込む — subset:true は NotoSansJP で日本語グリフが大量に欠落し
  // 発注書が文字化けするため(目視確認済み)。容量は増えるが正確さを優先する。
  // 埋め込み時にバッファが消費/detachされる場合に備え、キャッシュのコピーを毎回渡す。
  const font = await pdf.embedFont(new Uint8Array(getRegularFontBytes()), { subset: false });
  const bold = await pdf.embedFont(new Uint8Array(getBoldFontBytes()), { subset: false });

  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const left = 56;
  // CJKグリフは横幅が広いため行間を広めに取り、上から下へ素直に積む。
  let y = height - 64;

  drawText(page, rows.title, { x: left, y, size: 22, font: bold });
  y -= 40;

  for (const row of rows.header) {
    drawText(page, `${row.label}：${row.value}`, { x: left, y, size: 11, font });
    y -= 22;
  }

  y -= 12;
  // 列幅は内容に応じて配分する(品目名を広めに)。
  const colWidths = computeColumnWidths(rows.itemTable.columns, width - left * 2);
  drawTableRow(page, rows.itemTable.columns, { x: left, y, size: 10, font: bold, colWidths });
  y -= 22;
  for (const row of rows.itemTable.rows) {
    drawTableRow(page, row, { x: left, y, size: 10, font, colWidths });
    y -= 22;
  }

  y -= 16;
  for (const row of rows.footer) {
    drawText(page, `${row.label}：${row.value}`, { x: left, y, size: 10, font });
    y -= 20;
  }

  drawText(page, `生成日時 ${formatDateTime(input.generatedAt)}`, {
    x: left,
    y: 48,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return pdf.save();
}

type DrawOpts = {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
};

function drawText(page: PDFPage, text: string, opts: DrawOpts) {
  page.drawText(text, {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
}

function computeColumnWidths(columns: string[], totalWidth: number): number[] {
  // 品目名(2列目)を広く、その他は均等寄りに配分する。
  const weights = columns.map((_, idx) => (idx === 1 ? 3 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * totalWidth);
}

function drawTableRow(
  page: PDFPage,
  cells: string[],
  opts: { x: number; y: number; size: number; font: PDFFont; colWidths: number[] },
) {
  let cx = opts.x;
  cells.forEach((cell, idx) => {
    drawText(page, cell, { x: cx, y: opts.y, size: opts.size, font: opts.font });
    cx += opts.colWidths[idx] ?? 80;
  });
}

function urgencyLabel(value: string) {
  switch (value) {
    case "CRITICAL":
      return "緊急";
    case "WARNING":
      return "注意";
    case "INFO":
      return "余裕あり";
    case "NONE":
      return "—";
    default:
      return value || "—";
  }
}

function formatDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "—";
}

function formatDateTime(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function formatCurrency(value: number) {
  return formatNumber(roundCurrency(value));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
