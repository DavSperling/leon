import { and, desc, eq, lt } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { cards, readLog } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { clientLabel } from './labels';

// Journal : qui a lu quelle fiche, avec quel assistant. Lu sous la RLS du lecteur : une lecture dont
// l'ACL (celle de la fiche au moment de la lecture) ou la fiche ne lui est pas visible est omise.

export type ReadLogEntry = {
  id: string;
  at: Date;
  client: string;
  clientLabel: string;
  readerName: string;
  cardId: string;
  cardTitle: string;
};

const DEFAULT_LIMIT = 50;

export async function listReadLog(
  ctx: TenantContext,
  input: { cardId?: string; before?: Date; limit?: number },
): Promise<ReadLogEntry[]> {
  const filters = [
    input.cardId ? eq(readLog.cardId, input.cardId) : undefined,
    input.before ? lt(readLog.at, input.before) : undefined,
  ];
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: readLog.id,
        at: readLog.at,
        client: readLog.client,
        readerName: users.name,
        cardId: readLog.cardId,
        cardTitle: cards.title,
      })
      .from(readLog)
      .innerJoin(users, eq(users.id, readLog.userId))
      .innerJoin(cards, eq(cards.id, readLog.cardId))
      .where(and(...filters))
      .orderBy(desc(readLog.at), desc(readLog.id))
      .limit(input.limit ?? DEFAULT_LIMIT),
  );
  return rows.map((row) => ({ ...row, clientLabel: clientLabel(row.client) }));
}
