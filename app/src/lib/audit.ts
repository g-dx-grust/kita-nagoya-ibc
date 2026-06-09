import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// 監査ログ書き込み先。トランザクション内で呼ぶ場合は tx クライアントを渡すと、
// データ変更と監査ログを同一トランザクションで原子的に確定できる。
type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function audit(
  opts: {
    action: string;
    entityType: string;
    entityId?: string;
    actorId?: string;
    before?: unknown;
    after?: unknown;
  },
  client: AuditClient = prisma,
) {
  await client.auditLog.create({
    data: {
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actorId: opts.actorId,
      beforeJson: opts.before === undefined ? null : JSON.stringify(opts.before),
      afterJson: opts.after === undefined ? null : JSON.stringify(opts.after),
    },
  });
}
