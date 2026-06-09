import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { SupplierCreateSchema } from "@/lib/schemas";

export async function GET() {
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return ok(rows);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, SupplierCreateSchema);
    const row = await prisma.supplier.create({ data: body });
    await audit({ action: "create", entityType: "Supplier", entityId: row.id, after: row });
    return created(row);
  } catch (e) {
    return handleError(e);
  }
}
