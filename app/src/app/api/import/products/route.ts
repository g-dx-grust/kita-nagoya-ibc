import { audit } from "@/lib/audit";
import { parseCsvWithHeader } from "@/lib/csv";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// Accepts text/csv body (raw). Columns:
// product_code, official_name, display_name, production_type,
// safety_stock_quantity, standard_production_lot_size,
// unit, pack_size_g, pack_count, case_pack_qty, category, default_work_area_name,
// billing_enabled, note, aliases (pipe-separated),
// source_system, source_product_key, source_sheet_name, source_row_number,
// specification, pack_count_expression, bundle_count, brand_name, bag_tray_name,
// carton_name, accessory_name, seal_count, classification_note, raw_material_note
//
// Existing products (matched by product_code) are updated. Missing ones inserted.
export async function POST(req: Request) {
  try {
    const text = await req.text();
    const { rows } = parseCsvWithHeader(text);
    const workAreas = await prisma.workArea.findMany();
    const waByName = new Map(workAreas.map((w) => [w.name, w.id]));
    const groups = await prisma.productEquivalenceGroup.findMany({ where: { active: true } });
    const groupByName = new Map(groups.map((group) => [group.name, group.id]));

    const results: { product_code: string; action: "created" | "updated"; id: string }[] = [];
    const errors: { row: number; product_code?: string; message: string }[] = [];
    const warnings: { row: number; product_code?: string; message: string }[] = [];

    for (const [index, r] of rows.entries()) {
      const row = index + 2;
      const code = r.product_code?.trim();
      if (!code) continue;
      const validation = validateProductExtensionRow(r);
      if (validation.error) {
        errors.push({ row, product_code: code, message: validation.error });
        continue;
      }
      const packCount = emptyToInt(r.pack_count);
      const casePackQty = emptyToNum(r.case_pack_qty) ?? packCount;
      const data = {
        productCode: code,
        officialName: (r.official_name ?? "").trim(),
        displayName: emptyToNull(r.display_name),
        productionType: (r.production_type || "stock").trim(),
        safetyStockQuantity: emptyToNum(r.safety_stock_quantity) ?? 0,
        standardProductionLotSize: emptyToNum(r.standard_production_lot_size) ?? 0,
        unit: (r.unit || "袋").trim(),
        packSizeG: emptyToNum(r.pack_size_g),
        packCount,
        casePackQty,
        category: emptyToNull(r.category),
        sourceSystem: emptyToNull(r.source_system),
        sourceProductKey: emptyToNull(r.source_product_key),
        sourceSheetName: emptyToNull(r.source_sheet_name),
        sourceRowNumber: emptyToInt(r.source_row_number),
        specification: emptyToNull(r.specification),
        packCountExpression: emptyToNull(r.pack_count_expression),
        bundleCount: emptyToNull(r.bundle_count),
        brandName: emptyToNull(r.brand_name),
        bagTrayName: emptyToNull(r.bag_tray_name),
        cartonName: emptyToNull(r.carton_name),
        accessoryName: emptyToNull(r.accessory_name),
        sealCount: emptyToNum(r.seal_count),
        classificationNote: emptyToNull(r.classification_note),
        rawMaterialNote: emptyToNull(r.raw_material_note),
        defaultWorkAreaId: r.default_work_area_name ? waByName.get(r.default_work_area_name.trim()) ?? null : null,
        billingEnabled: r.billing_enabled ? r.billing_enabled.trim() !== "false" : true,
        note: emptyToNull(r.note),
        ...validation.data,
      };
      const groupName = emptyToNull(r.equivalence_group_name);
      if (groupName) {
        const groupId = groupByName.get(groupName);
        if (groupId) {
          data.equivalenceGroupId = groupId;
        } else {
          warnings.push({
            row,
            product_code: code,
            message: `equivalence_group_name not found: ${groupName}`,
          });
          data.equivalenceGroupId = null;
        }
      }

      const existing = await prisma.product.findUnique({ where: { productCode: code } });
      const aliases = (r.aliases ?? "").split("|").map((s) => s.trim()).filter(Boolean);

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: existing.id }, data });
          await tx.productAlias.deleteMany({ where: { productId: existing.id } });
          if (aliases.length > 0) {
            await tx.productAlias.createMany({
              data: aliases.map((a) => ({ productId: existing.id, aliasName: a })),
            });
          }
        });
        results.push({ product_code: code, action: "updated", id: existing.id });
      } else {
        const created_ = await prisma.product.create({
          data: { ...data, aliases: { create: aliases.map((a) => ({ aliasName: a })) } },
        });
        results.push({ product_code: code, action: "created", id: created_.id });
      }
    }
    await audit({
      action: "import_products",
      entityType: "Product",
      after: { count: results.length, errors: errors.length, warnings: warnings.length },
    });
    return ok({ imported: results.length, results, errors, warnings });
  } catch (e) {
    return handleError(e);
  }
}

function emptyToNull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function emptyToNum(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function emptyToInt(v: string | undefined): number | null {
  const n = emptyToNum(v);
  return n == null ? null : Math.trunc(n);
}

const FORECAST_METHODS = new Set(["MANUAL", "YEAR_RATIO", "SALES_INPUT", "NONE"]);

function validateProductExtensionRow(r: Record<string, string | undefined>): {
  data: {
    forecastMethod?: string;
    validFrom?: Date | null;
    validTo?: Date | null;
    equivalenceGroupId?: string | null;
  };
  error?: string;
} {
  const data: {
    forecastMethod?: string;
    validFrom?: Date | null;
    validTo?: Date | null;
    equivalenceGroupId?: string | null;
  } = {};
  const forecastMethod = emptyToNull(r.forecast_method);
  if (forecastMethod) {
    if (!FORECAST_METHODS.has(forecastMethod)) return { data, error: "invalid forecast_method" };
    data.forecastMethod = forecastMethod;
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

function parseOptionalDate(v: string | undefined): { value?: Date | null; error?: true } {
  if (v === undefined) return {};
  const s = v.trim();
  if (s === "") return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: true };
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { error: true };
  return { value: d };
}
