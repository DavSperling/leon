import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { canInvite } from '@/server/auth/members';
import type { TenantContext } from '@/server/auth/tenant-context';
import { connections, depotsEquipe } from '@/server/db/schema/connections';
import { withTenant } from '@/server/db/with-tenant';
import { REPO_PATTERN } from './connector';

// Les dépôts d'équipe (décision D, D14), tels que l'administrateur les coche dans les réglages. `depot` :
// propriétaire/dépôt en minuscules ; en base (0047), la clé de projet d'une session, `github.com/` devant.
export type DepotEquipe = { depot: string; coche: boolean };

const PREFIX = 'github.com/';
const CursorSchema = z.record(z.string(), z.unknown());

// Les dépôts que marque le curseur d'une connexion GitHub (connector.ts : une clé par dépôt). Un curseur illisible
// n'en marque aucun.
function markedRepos(cursor: string | null): string[] {
  if (cursor === null) return [];
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(cursor));
    return parsed.success ? Object.keys(parsed.data).filter((repo) => REPO_PATTERN.test(repo)) : [];
  } catch {
    return [];
  }
}

// Les candidats : les dépôts marqués dans le curseur des connexions GitHub du lecteur lui-même (toute l'équipe lit
// les connexions : le filtre sur le créateur écarte les dépôts des autres membres), et les dépôts déjà cochés.
export async function listDepotsEquipe(ctx: TenantContext): Promise<DepotEquipe[]> {
  const { mine, chosen } = await withTenant(ctx, async (tx) => ({
    mine: await tx
      .select({ cursor: connections.cursor })
      .from(connections)
      .where(and(eq(connections.provider, 'github'), eq(connections.createdBy, ctx.userId))),
    chosen: await tx.select({ project: depotsEquipe.project }).from(depotsEquipe),
  }));
  const coches = new Set(chosen.map(({ project }) => project.slice(PREFIX.length)));
  const marked = mine
    .flatMap(({ cursor }) => markedRepos(cursor))
    .map((repo) => repo.toLowerCase());
  return [...new Set([...coches, ...marked])]
    .sort()
    .map((depot) => ({ depot, coche: coches.has(depot) }));
}

// Cocher ajoute le dépôt (sans effet s'il y est déjà), décocher le retire. `depot` s'écrit propriétaire/dépôt, en
// casse libre. La base refuse l'écriture à qui n'est ni propriétaire ni administrateur ; le test d'avant ne sert qu'à
// le dire au lecteur.
export async function setDepotEquipe(
  ctx: TenantContext,
  depot: string,
  coche: boolean,
): Promise<'ok' | 'invalide' | 'refuse'> {
  const repo = depot.trim();
  if (!REPO_PATTERN.test(repo)) return 'invalide';
  if (!(await canInvite(ctx))) return 'refuse';
  const project = `${PREFIX}${repo.toLowerCase()}`;
  await withTenant(ctx, async (tx) => {
    await (coche
      ? tx
          .insert(depotsEquipe)
          .values({ tenantId: ctx.tenantId, project, acl: [ctx.tenantId], choisiPar: ctx.userId })
          .onConflictDoNothing()
      : tx.delete(depotsEquipe).where(eq(depotsEquipe.project, project)));
    // T12 : les sources GitHub déjà relevées suivent la liste, dans la même transaction (0048).
    await tx.execute(sql`select aligner_sources_github()`);
  });
  return 'ok';
}
