import { audit } from "@/lib/audit";
import { badRequest, handleError, notFound, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductUpdateSchema } from "@/lib/schemas";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await prisma.product.findUnique({
      where: { id },
      include: { aliases: true, defaultWorkArea: true, bomItems: true, capacities: true },
    });
    if (!row) return notFound();
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(req, ProductUpdateSchema);
    const before = await prisma.product.findUnique({ where: { id }, include: { aliases: true } });
    if (!before) return notFound();

    // 管理コードを変更する場合は重複を分かりやすく弾く(productCode は @unique)。
    if (body.productCode && body.productCode !== before.productCode) {
      const dup = await prisma.product.findUnique({ where: { productCode: body.productCode } });
      if (dup) return badRequest("duplicate_product_code", `管理コード「${body.productCode}」は既に使われています。`);
    }

    const { aliases, ...rest } = body;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.product.update({ where: { id }, data: rest });
      if (aliases) {
        await tx.productAlias.deleteMany({ where: { productId: id } });
        if (aliases.length > 0) {
          await tx.productAlias.createMany({
            data: aliases.map((a) => ({ productId: id, aliasName: a })),
          });
        }
      }
      return tx.product.findUnique({ where: { id }, include: { aliases: true } });
    });

    await audit({
      action: "update",
      entityType: "Product",
      entityId: id,
      before,
      after: updated,
    });
    return ok(updated);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) return notFound();
    // Soft-delete: deactivate rather than remove, to preserve historical plans.
    const after = await prisma.product.update({ where: { id }, data: { active: false } });
    await audit({ action: "deactivate", entityType: "Product", entityId: id, before, after });
    return ok(after);
  } catch (e) {
    return handleError(e);
  }
}
