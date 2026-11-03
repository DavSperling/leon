import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { canInvite } from '@/server/auth/members';
import type { TenantContext } from '@/server/auth/tenant-context';
import { connections, depotsEquipe } from '@/server/db/schema/connections';
import { withTenant } from '@/server/db/with-tenant';
import { type LiveDeps, myGithubConnections, openGithub } from '@/server/discussion/github-live';
import { logError } from '@/server/log';
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
// `githubBranche` : un membre de l'équipe, quel qu'il soit, a une connexion GitHub (sinon, rien n'est à cocher).
export async function listDepotsEquipe(
  ctx: TenantContext,
): Promise<{ depots: DepotEquipe[]; githubBranche: boolean }> {
  const { mine, chosen, team } = await withTenant(ctx, async (tx) => ({
    mine: await tx
      .select({ cursor: connections.cursor })
      .from(connections)
      .where(and(eq(connections.provider, 'github'), eq(connections.createdBy, ctx.userId))),
    chosen: await tx.select({ project: depotsEquipe.project }).from(depotsEquipe),
    team: await tx
      .select({ id: connections.id })
      .from(connections)
      .where(eq(connections.provider, 'github'))
      .limit(1),
  }));
  const coches = new Set(chosen.map(({ project }) => project.slice(PREFIX.length)));
  const marked = mine
    .flatMap(({ cursor }) => markedRepos(cursor))
    .map((repo) => repo.toLowerCase());
  const depots = [...new Set([...coches, ...marked])]
    .sort()
    .map((depot) => ({ depot, coche: coches.has(depot) }));
  return { depots, githubBranche: team.length > 0 };
}

// Cocher partage avec toute l'équipe ce qui est déjà relevé du dépôt (0048), puis ce que la relève de chacun en lit.
// Le nom d'un dépôt ne suffit donc pas (il se lit ailleurs, par exemple dans les dépôts d'une connexion à clé) :
// l'administrateur doit le lire lui-même sur GitHub, par l'une de ses propres connexions, avec la permission que la
// relève demande (canRead). Jamais la connexion d'un autre membre. Une connexion en panne ne lit pas.
async function readableByMe(ctx: TenantContext, repo: string, deps: LiveDeps): Promise<boolean> {
  for (const connection of await myGithubConnections(ctx)) {
    try {
      const { github } = await openGithub(ctx, connection, deps);
      if (await github.canRead(repo)) return true;
    } catch (error) {
      logError('depots_equipe.check_failed', error, { connectionId: connection.id });
    }
  }
  return false;
}

// Cocher ajoute le dépôt (sans effet s'il y est déjà), décocher le retire. `depot` s'écrit propriétaire/dépôt, en
// casse libre. La base refuse l'écriture à qui n'est ni propriétaire ni administrateur ; le test d'avant ne sert qu'à
// le dire au lecteur. Décocher ne demande rien à GitHub.
// shortcut: l'alignement (0048) réécrit, dans la transaction du clic, chaque ligne du dépôt (sources, tours, runs,
// passages, vecteurs, lectures ; environ 0,8 ms par vecteur mesuré) en gardant verrouillées les sources GitHub de
// l'organisation, que la relève attend ; passer à un job pg-boss par lots de sources quand un dépôt dépasse
// 10 000 vecteurs (environ 8 s), ce qui change la promesse « en une transaction » de T12.
export async function setDepotEquipe(
  ctx: TenantContext,
  depot: string,
  coche: boolean,
  deps: LiveDeps = {},
): Promise<'ok' | 'invalide' | 'refuse' | 'illisible'> {
  const repo = depot.trim();
  if (!REPO_PATTERN.test(repo)) return 'invalide';
  if (!(await canInvite(ctx))) return 'refuse';
  if (coche && !(await readableByMe(ctx, repo, deps))) return 'illisible';
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
