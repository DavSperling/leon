import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';

// Le partage d'une session Claude Code (spec du 01/11/2026) : la règle (l'auteur seul, une session claude_code liée
// à un dépôt GitHub) et l'écriture sur les cinq tables sont dans regler_partage_session et regler_partage_depot
// (0044). Ce module ne fait que les appeler et relire ce qui a changé.

// La clé d'un dépôt GitHub, telle que la CLI l'envoie (src/cli/project-key.ts) et que depots_prives l'accepte.
export const GITHUB_PROJECT = /^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/;

export type SessionRef = { id: string; title: string | null; at: string };

// Rend la session réglée (titre, date de son dernier échange), ou null si l'appelant n'a pas le droit.
export async function setSessionSharing(
  ctx: TenantContext,
  sourceId: string,
  share: boolean,
): Promise<SessionRef | null> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(
      sql`select regler_partage_session(${sourceId}::uuid, ${share}) as ok`,
    );
    if (rows[0]?.ok !== true) return null;
    const session = await tx.execute<SessionRef>(sql`
      select id, title, coalesce(last_turn_at, created_at)::text as at
      from sources where id = ${sourceId}::uuid`);
    return session.rows[0] ?? null;
  });
}

// Rend le nombre de sessions de l'appelant réglées sur ce dépôt ; ses sessions futures suivent depots_prives.
export async function setRepoSharing(
  ctx: TenantContext,
  project: string,
  share: boolean,
): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`select regler_partage_depot(${project}, ${share}) as n`,
    );
    return rows[0]?.n ?? 0;
  });
}

// La dernière session Claude Code de l'appelant liée à un dépôt GitHub, partagée (`shared`) ou privée.
export async function lastSession(ctx: TenantContext, shared: boolean): Promise<string | null> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from sources
      where owner_user_id = ${ctx.userId} and kind = 'claude_code'
        and metadata ->> 'project' like 'github.com/%'
        and (acl @> array[tenant_id]) = ${shared}
      order by coalesce(last_turn_at, created_at) desc
      limit 1`);
    return rows[0]?.id ?? null;
  });
}
