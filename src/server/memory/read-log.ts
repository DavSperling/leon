import { and, eq, inArray } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lecons, readLog, sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';

// Journal : qui a lu quelle source (et quel passage), ou quelle leçon (0066), avec quel assistant, quel outil, et dans
// quelle session quand elle est connue. Pas encore d'écran qui le lise ; sous la RLS, une lecture dont l'ACL (celle de
// la source au moment de la lecture) n'est pas visible est omise.

export type ReadTool = (typeof readLog.tool.enumValues)[number];

// Note qu'un assistant a reçu ces sources (et ces passages), une ligne par lecture distincte, chacune avec l'accès qu'a sa
// source à cet instant : seuls ceux qui la voient voient la lecture. Rend les sources notées ; une source que le
// lecteur ne voit pas (inconnue, privée à un autre, devenue invisible entre sa lecture et ce journal) n'est pas
// notée, et l'appelant ne rend alors pas ce qu'il en a lu. `whole` : tout ou rien, pour une lecture qui ne se rend
// qu'entière (le point du matin) ; une seule source invisible et rien n'est noté. Une leçon se note par `lecon_id`,
// avec son accès ; celle d'un autre n'est pas notée.
export async function recordReads(
  ctx: TenantContext,
  input: {
    tool: ReadTool;
    client: string;
    session?: string | null;
    reads: ReadonlyArray<{ sourceId: string; passageId?: string | null } | { leconId: string }>;
    whole?: boolean;
  },
): Promise<Set<string>> {
  if (input.reads.length === 0) return new Set();
  // Une ligne par paire (source, passage), ou par leçon : une source lue deux fois dans un appel (entrée de deux états)
  // ne multiplie pas le journal, que l'état du modèle relit (sources_lues_pendant).
  const reads = [
    ...new Map(
      input.reads.map((read) => [
        'leconId' in read ? `lecon:${read.leconId}` : `${read.sourceId}/${read.passageId ?? ''}`,
        read,
      ]),
    ).values(),
  ];
  const idOf = (read: (typeof reads)[number]) => ('leconId' in read ? read.leconId : read.sourceId);
  const sourceIds = [
    ...new Set(reads.flatMap((read) => ('leconId' in read ? [] : [read.sourceId]))),
  ];
  const leconIds = [...new Set(reads.flatMap((read) => ('leconId' in read ? [read.leconId] : [])))];
  return withTenant(ctx, async (tx) => {
    const visible = [
      ...(sourceIds.length > 0
        ? await tx
            .select({ id: sources.id, acl: sources.acl })
            .from(sources)
            .where(inArray(sources.id, sourceIds))
        : []),
      // Une leçon ne se lit que par son auteur (C13), en plus de la RLS.
      ...(leconIds.length > 0
        ? await tx
            .select({ id: lecons.id, acl: lecons.acl })
            .from(lecons)
            .where(and(inArray(lecons.id, leconIds), eq(lecons.ownerUserId, ctx.userId)))
        : []),
    ];
    const aclOf = new Map(visible.map((row) => [row.id, row.acl]));
    if (input.whole && aclOf.size < sourceIds.length + leconIds.length) return new Set<string>();
    const rows = reads.flatMap((read) => {
      const acl = aclOf.get(idOf(read));
      return acl
        ? [
            {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              client: input.client,
              tool: input.tool,
              session: input.session ?? null,
              ...('leconId' in read
                ? { leconId: read.leconId }
                : { sourceId: read.sourceId, passageId: read.passageId ?? null }),
              acl,
            },
          ]
        : [];
    });
    if (rows.length > 0) await tx.insert(readLog).values(rows);
    return new Set(aclOf.keys());
  });
}
