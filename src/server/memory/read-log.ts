import { inArray } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';

// Journal : qui a lu quelle source (et quel passage), avec quel assistant et quel outil MCP. Pas encore d'écran qui
// le lise ; sous la RLS, une lecture dont l'ACL (celle de la source au moment de la lecture) n'est pas visible est
// omise.

export type ReadTool = (typeof readLog.tool.enumValues)[number];

// Note qu'un assistant a reçu ces sources (et ces passages), une ligne par lecture, chacune avec l'accès qu'a sa
// source à cet instant : seuls ceux qui la voient voient la lecture. Rend les sources notées ; une source que le
// lecteur ne voit pas (inconnue, privée à un autre, devenue invisible entre sa lecture et ce journal) n'est pas
// notée, et l'appelant ne rend alors pas ce qu'il en a lu. `whole` : tout ou rien, pour une lecture qui ne se rend
// qu'entière (le point du matin) ; une seule source invisible et rien n'est noté.
export async function recordReads(
  ctx: TenantContext,
  input: {
    tool: ReadTool;
    client: string;
    reads: ReadonlyArray<{ sourceId: string; passageId?: string | null }>;
    whole?: boolean;
  },
): Promise<Set<string>> {
  if (input.reads.length === 0) return new Set();
  const wanted = [...new Set(input.reads.map((read) => read.sourceId))];
  return withTenant(ctx, async (tx) => {
    const visible = await tx
      .select({ id: sources.id, acl: sources.acl })
      .from(sources)
      .where(inArray(sources.id, wanted));
    const aclOf = new Map(visible.map((source) => [source.id, source.acl]));
    if (input.whole && aclOf.size < wanted.length) return new Set<string>();
    const rows = input.reads.flatMap((read) => {
      const acl = aclOf.get(read.sourceId);
      return acl
        ? [
            {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              client: input.client,
              tool: input.tool,
              sourceId: read.sourceId,
              passageId: read.passageId ?? null,
              acl,
            },
          ]
        : [];
    });
    if (rows.length > 0) await tx.insert(readLog).values(rows);
    return new Set(aclOf.keys());
  });
}
