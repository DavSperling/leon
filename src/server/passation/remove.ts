import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';

// Retirer une note de passation : la règle (auteur, ou administrateur pour un ancien membre) est dans
// supprimer_passation (0043). Ses éléments et ses liens partent en cascade.
export async function removePassation(ctx: TenantContext, sourceId: string): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(
      sql`select supprimer_passation(${sourceId}::uuid) as ok`,
    );
    return rows[0]?.ok === true;
  });
}
