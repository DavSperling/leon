import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';

// Journal : qui a lu quelle source (et quel passage), avec quel assistant. Pas encore d'écran qui le lise ; sous
// la RLS, une lecture dont l'ACL (celle de la source au moment de la lecture) n'est pas visible est omise.

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
