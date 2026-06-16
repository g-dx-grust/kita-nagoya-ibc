import { randomBytes } from "crypto";
import { audit } from "@/lib/audit";
import { handleError, notFound, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) return notFound();

    const after = await prisma.employee.update({
      where: { id },
      data: {
        shiftEntryToken: randomBytes(24).toString("hex"),
        shiftEntryEnabled: true,
      },
    });

    await audit({
      action: "issue_shift_entry_token",
      entityType: "Employee",
      entityId: id,
      before: { shiftEntryToken: before.shiftEntryToken ? "[issued]" : null },
      after: { shiftEntryToken: "[issued]" },
    });

    return ok({ employeeId: after.id, shiftEntryToken: after.shiftEntryToken });
  } catch (e) {
    return handleError(e);
  }
}
