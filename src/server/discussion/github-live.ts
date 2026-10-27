import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { githubConnector, liveGithub } from '@/server/connectors/github/connector';
import { ensureFreshTokens } from '@/server/connectors/oauth';
import { connectorHttp } from '@/server/connectors/pipedream';

// GitHub en direct, avec la connexion de l'utilisateur : pour les outils de la discussion et les actions qu'il
// confirme. Jamais la connexion d'un autre membre (décision 3 de docs/specs/2026-10-26-github-acces-complet.md) :
// loadMyConnections ne rend que celles qu'il a branchées lui-même, hors pause.
// shortcut: le jeton est renouvelé ici comme pendant un passage ; si les deux le renouvellent à la même seconde,
// GitHub refuse le second (jeton de rafraîchissement à usage unique) et il faut « Reconnecter ». À verrouiller
// quand les appels en direct se multiplieront.

export type LiveDeps = { fetchImpl?: typeof fetch };
export type MyConnection = Awaited<ReturnType<typeof loadMyConnections>>[number];

export const myGithubConnections = (ctx: TenantContext) => loadMyConnections(ctx, 'github');

export async function openGithub(ctx: TenantContext, connection: MyConnection, deps: LiveDeps) {
  const config = await ensureFreshTokens(ctx, connection, githubConnector, deps);
  return liveGithub(config, connectorHttp('github', githubConnector, config, deps));
}
