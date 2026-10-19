import { and, desc, eq, lt } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { readLog, sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { clientLabel } from './labels';

// Journal : qui a lu quelle source (et quel passage), avec quel assistant. Lu sous la RLS du lecteur :
// une lecture dont l'ACL (celle de la source au moment de la lecture) ou la source ne lui est pas
// visible est omise.

export type ReadLogEntry = {
  id: string;
  at: Date;
  client: string;
  clientLabel: string;
  readerName: string;
  sourceId: string;
  sourceTitle: string | null;
  passageId: string | null;
};

const DEFAULT_LIMIT = 50;

export async function listReadLog(
  ctx: TenantContext,
  input: { sourceId?: string; before?: Date; limit?: number },
): Promise<ReadLogEntry[]> {
  const filters = [
    input.sourceId ? eq(readLog.sourceId, input.sourceId) : undefined,
    input.before ? lt(readLog.at, input.before) : undefined,
  ];
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: readLog.id,
        at: readLog.at,
        client: readLog.client,
        readerName: users.name,
        sourceId: readLog.sourceId,
        sourceTitle: sources.title,
        passageId: readLog.passageId,
      })
      .from(readLog)
      .innerJoin(users, eq(users.id, readLog.userId))
      .innerJoin(sources, eq(sources.id, readLog.sourceId))
      .where(and(...filters))
      .orderBy(desc(readLog.at), desc(readLog.id))
      .limit(input.limit ?? DEFAULT_LIMIT),
  );
  return rows.map((row) => ({ ...row, clientLabel: clientLabel(row.client) }));
}
