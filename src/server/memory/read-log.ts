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

// Note qu'un assistant a lu cette source (et ce passage), avec l'accès qu'a la source à cet instant : seuls
// ceux qui la voient voient la lecture. Rend false, sans rien écrire, quand la source n'est pas visible du
// lecteur (inconnue, privée à un autre, devenue invisible entre sa lecture et ce journal) : l'appelant ne
// rend alors pas ce qu'il a lu.
export async function recordRead(
  ctx: TenantContext,
  input: { sourceId: string; passageId?: string | null; client: string },
): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    const [source] = await tx
      .select({ acl: sources.acl })
      .from(sources)
      .where(eq(sources.id, input.sourceId));
    if (!source) return false;
    await tx.insert(readLog).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      client: input.client,
      sourceId: input.sourceId,
      passageId: input.passageId ?? null,
      acl: source.acl,
    });
    return true;
  });
}

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
