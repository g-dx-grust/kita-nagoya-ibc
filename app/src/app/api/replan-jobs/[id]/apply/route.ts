import { z } from "zod";

import { audit } from "@/lib/audit";
import { handleError, HttpError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ReplanJobApplySchema = z.object({
  action: z.enum(["apply", "ignore"]).default("apply"),
  note: z.string().nullish(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = ReplanJobApplySchema.parse(await req.json().catch(() => ({})));
    const before = await prisma.replanJob.findUnique({ where: { id }, include: { event: true } });
    if (!before) throw new HttpError(404, "replan_job_not_found");
    if (before.status !== "pending" && before.status !== "planned") {
      throw new HttpError(409, "replan_job_already_consumed", { status: before.status });
    }

    const jobStatus = body.action === "ignore" ? "rejected" : "applied";
    const eventStatus = body.action === "ignore" ? "ignored" : "processed";
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.replanJob.update({
        where: { id },
        data: {
          status: jobStatus,
          appliedAt: new Date(),
          diffJson: mergeDiffJson(before.diffJson, {
            sprint5ReviewAction: body.action,
            note: body.note ?? null,
            consumedAt: new Date().toISOString(),
            message:
              body.action === "ignore"
                ? "差分適用は行わず、再計画待ちから見送りました。"
                : "差分適用アルゴリズムは未実装のため、確認済みとして再計画待ちから外しました。",
          }),
        },
        include: { event: true },
      });
      const remaining = await tx.replanJob.count({
        where: { eventId: before.eventId, status: { in: ["pending", "planned"] } },
      });
      if (remaining === 0) {
        await tx.replanEvent.update({ where: { id: before.eventId }, data: { status: eventStatus } });
      }
      await audit(
        {
          action: body.action === "ignore" ? "replan_job_ignore" : "replan_job_mark_reviewed",
          entityType: "ReplanJob",
          entityId: id,
          before,
          after: updated,
        },
        tx,
      );
      return updated;
    });

    return ok({ job: after, action: body.action, status: after.status });
  } catch (e) {
    return handleError(e);
  }
}

function mergeDiffJson(diffJson: string | null, patch: Record<string, unknown>) {
  const current = parseObject(diffJson);
  return JSON.stringify({ ...current, ...patch });
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
