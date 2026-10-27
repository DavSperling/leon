import type { BranchParams } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { githubConnector, liveGithub, REPO_PATTERN } from '@/server/connectors/github/connector';
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

// Un nom de branche que git accepte, en plus étroit : lettres, chiffres, « . », « _ », « - » et « / », sans « .. »
// ni « // », sans « / », « . » ou « - » au début, ni « / », « . » ou « .lock » à la fin.
const BRANCH_NAME =
  /^(?![/.-])(?!.*\.\.)(?!.*\/\/)(?!.*\/\.)(?!.*(?:\/|\.|\.lock)$)[A-Za-z0-9._/-]{1,200}$/;
export const isBranchName = (name: string) => BRANCH_NAME.test(name);

// Un commit tel que GitHub l'écrit : 40 caractères hexadécimaux (64 pour un dépôt en SHA-256).
export const COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// Les paramètres d'une branche, revérifiés à la proposition et à l'exécution : ils viennent en partie de GitHub et
// finissent dans une adresse de l'API, sur la carte et devant le modèle.
export const validBranchParams = (params: BranchParams) =>
  REPO_PATTERN.test(params.repo) &&
  isBranchName(params.branch) &&
  isBranchName(params.from) &&
  COMMIT_SHA.test(params.sha);
