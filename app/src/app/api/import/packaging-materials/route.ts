import { audit } from "@/lib/audit";
import { parseCsvWithHeader } from "@/lib/csv";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { resolveSupplierId } from "@/lib/supplier-resolution";

// Columns: material_code,name,kind,unit,standard_unit_price,lead_time_days,note
// Extension columns: case_pack_qty,supplier_name|supplier_code,
//                    safety_stock_quantity,order_lot_qty,min_order_qty,valid_from,valid_to
export async function POST(req: Request) {
  try {
    const text = await req.text();
    const { rows } = parseCsvWithHeader(text);
    const suppliers = await prisma.supplier.findMany({ where: { active: true } });
    const supplierByName = new Map(suppliers.map((s) => [s.name, s.id]));
    const results: { material_code: string; action: "created" | "updated" }[] = [];
    const errors: { row: number; material_code?: string; message: string }[] = [];
    const warnings: { row: number; material_code?: string; message: string }[] = [];

    for (const [index, r] of rows.entries()) {
      const row = index + 2;
      const code = r.material_code?.trim();
      if (!code) continue;
      const validation = validateExtensionRow(r);
      if (validation.error) {
        errors.push({ row, material_code: code, message: validation.error });
        continue;
      }
      const supplier = resolveSupplierId(r.supplier_name ?? r.supplier_code, supplierByName);
      if (supplier.warning) warnings.push({ row, material_code: code, message: supplier.warning });
      const data = {
        materialCode: code,
        name: (r.name ?? "").trim(),
        kind: (r.kind ?? "").trim() || null,
        unit: (r.unit || "枚").trim(),
        standardUnitPrice: Number(r.standard_unit_price ?? 0) || 0,
        leadTimeDays: Number(r.lead_time_days ?? 0) || 0,
        note: (r.note ?? "").trim() || null,
        // case_pack_qty 列が無い旧CSVでは既存値を温存する (undefined のとき触らない)。
        ...(r.case_pack_qty !== undefined ? { casePackQty: emptyToNum(r.case_pack_qty) } : {}),
        ...(supplier.supplierId !== undefined ? { supplierId: supplier.supplierId } : {}),
        ...validation.data,
      };
      const existing = await prisma.packagingMaterial.findUnique({
        where: { materialCode: code },
      });
      if (existing) {
        await prisma.packagingMaterial.update({ where: { id: existing.id }, data });
        results.push({ material_code: code, action: "updated" });
      } else {
        await prisma.packagingMaterial.create({ data });
        results.push({ material_code: code, action: "created" });
      }
    }

    await audit({
      action: "import_packaging_materials",
      entityType: "PackagingMaterial",
      after: { count: results.length, errors: errors.length, warnings: warnings.length },
    });
    return ok({ imported: results.length, results, errors, warnings });
  } catch (e) {
    return handleError(e);
  }
}

function emptyToNum(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateExtensionRow(r: Record<string, string | undefined>): {
  data: {
    safetyStockQuantity?: number;
    orderLotQty?: number | null;
    minOrderQty?: number | null;
    validFrom?: Date | null;
    validTo?: Date | null;
  };
  error?: string;
} {
  const data: {
    safetyStockQuantity?: number;
    orderLotQty?: number | null;
    minOrderQty?: number | null;
    validFrom?: Date | null;
    validTo?: Date | null;
  } = {};

  for (const [column, key] of [
    ["safety_stock_quantity", "safetyStockQuantity"],
    ["order_lot_qty", "orderLotQty"],
    ["min_order_qty", "minOrderQty"],
  ] as const) {
    const parsed = parseOptionalNonnegativeNumber(r[column]);
    if (parsed.error) return { data, error: `invalid ${column}` };
    if (parsed.value === undefined) continue;
    if (key === "safetyStockQuantity") {
      if (parsed.value !== null) data.safetyStockQuantity = parsed.value;
    } else {
      data[key] = parsed.value;
    }
  }

  const validFrom = parseOptionalDate(r.valid_from);
  if (validFrom.error) return { data, error: "invalid valid_from" };
  if (validFrom.value !== undefined) data.validFrom = validFrom.value;

  const validTo = parseOptionalDate(r.valid_to);
  if (validTo.error) return { data, error: "invalid valid_to" };
  if (validTo.value !== undefined) data.validTo = validTo.value;

  if (data.validFrom && data.validTo && data.validFrom >= data.validTo) {
    return { data, error: "valid_from must be before valid_to" };
  }
  return { data };
}

function parseOptionalNonnegativeNumber(v: string | undefined): {
  value?: number | null;
  error?: true;
} {
  if (v === undefined) return {};
  const s = v.trim();
  if (s === "") return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: true };
  return { value: n };
}

function parseOptionalDate(v: string | undefined): { value?: Date | null; error?: true } {
  if (v === undefined) return {};
  const s = v.trim();
  if (s === "") return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: true };
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { error: true };
  return { value: d };
}
