import { audit } from "@/lib/audit";
import { created, handleError, ok, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ProductCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const rows = await prisma.product.findMany({
      where: {
        AND: [
          includeInactive ? {} : { active: true },
          q
            ? {
                OR: [
                  { productCode: { contains: q } },
                  { officialName: { contains: q } },
                  { displayName: { contains: q } },
                  { aliases: { some: { aliasName: { contains: q } } } },
                ],
              }
            : {},
        ],
      },
      include: { aliases: true, defaultWorkArea: true },
      orderBy: { productCode: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, ProductCreateSchema);
    const { aliases, ...rest } = body;
    const product = await prisma.product.create({
      data: {
        ...rest,
        aliases: aliases ? { create: aliases.map((a) => ({ aliasName: a })) } : undefined,
      },
      include: { aliases: true },
    });
    await audit({ action: "create", entityType: "Product", entityId: product.id, after: product });
    return created(product);
  } catch (e) {
    return handleError(e);
  }
}
