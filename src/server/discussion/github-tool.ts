import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { githubConnector, readableRepos } from '@/server/connectors/github/connector';
import { ConnectorAuthError } from '@/server/connectors/http';
import { ensureFreshTokens, OAuthRefusedError } from '@/server/connectors/oauth';
import { connectorHttp } from '@/server/connectors/pipedream';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';

// L'outil « depots_github » de la discussion (lot 3 de docs/specs/2026-10-26-github-acces-complet.md) : les
// dépôts que Leon lit avec la connexion GitHub de l'utilisateur, demandés à GitHub au moment de la question.
// Jamais avec la connexion d'un autre membre (décision 3 de la spec). Les noms viennent de GitHub : derrière la
// ligne de garde, et décomptés du budget de lecture de la réponse, comme `lire`.
// shortcut: le jeton est renouvelé ici comme pendant un passage ; si les deux le renouvellent à la même seconde,
// GitHub refuse le second (jeton de rafraîchissement à usage unique) et il faut « Reconnecter ». À verrouiller
// quand les lectures en direct se multiplieront (lot 5).

export type GithubToolDeps = { budget: { chars: number }; fetchImpl?: typeof fetch };

const NO_CONNECTION =
  'L’utilisateur n’a pas branché son propre GitHub dans Leon (Connexions › GitHub) : aucun dépôt à lister. Leon ne lit jamais le GitHub d’un autre membre.';
const SCOPE_LINE =
  'Leon ne voit que les dépôts ouverts à cette connexion : ceux où son appli GitHub est installée (à modifier sur GitHub), ou ceux saisis avec une clé.';

type Connection = Awaited<ReturnType<typeof loadMyConnections>>[number];

// Les dépôts d'une connexion, ou la phrase qui dit pourquoi GitHub les refuse.
async function reposOf(
  ctx: TenantContext,
  connection: Connection,
  deps: GithubToolDeps,
): Promise<string[] | string> {
  try {
    const config = await ensureFreshTokens(ctx, connection, githubConnector, deps);
    return await readableRepos(config, connectorHttp('github', githubConnector, config, deps));
  } catch (error) {
    if (error instanceof ConnectorAuthError || error instanceof OAuthRefusedError) {
      return `GitHub refuse l’accès de la connexion « ${connection.label} » : l’utilisateur doit la reconnecter dans Connexions.`;
    }
    throw error;
  }
}

// Une ligne par dépôt tant que le budget le permet ; la suite est comptée, jamais tue.
function renderRepos(label: string, repos: string[], budget: { chars: number }): string[] {
  const shown: string[] = [];
  for (const repo of repos) {
    if (budget.chars < repo.length + 1) break;
    shown.push(repo);
    budget.chars -= repo.length + 1;
  }
  const left = repos.length - shown.length;
  return [
    `Compte GitHub « ${label} » : ${repos.length} dépôt${repos.length > 1 ? 's' : ''}, lus à l’instant sur GitHub (adresse : https://github.com/<propriétaire>/<nom>).`,
    ...shown,
    ...(left > 0
      ? [
          `Liste coupée : ${left} dépôt${left > 1 ? 's non affichés' : ' non affiché'} (budget de lecture atteint).`,
        ]
      : []),
  ];
}

export function githubReposTool(
  ctx: TenantContext,
  deps: GithubToolDeps,
): AgentTool<Record<string, never>> {
  return {
    name: 'depots_github',
    description:
      'Liste en direct, depuis GitHub, les dépôts que Leon lit avec le compte GitHub de l’utilisateur (ceux où l’appli Leon est installée, ou ceux saisis avec sa clé) : pour « quels dépôts vois-tu ? » ou « liste mes dépôts GitHub ». Ne passe jamais par le compte d’un autre membre. Les noms décomptent le budget de lecture.',
    input: z.object({}),
    async run() {
      const mine = await loadMyConnections(ctx, 'github');
      if (mine.length === 0) return NO_CONNECTION;
      const lines = [DATA_GUARD_LINE];
      for (const connection of mine) {
        const repos = await reposOf(ctx, connection, deps);
        lines.push(
          ...(typeof repos === 'string'
            ? [repos]
            : renderRepos(connection.label, repos, deps.budget)),
        );
      }
      return [...lines, SCOPE_LINE].join('\n');
    },
  };
}
