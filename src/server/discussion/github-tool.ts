import { z } from 'zod';
import type { ActionView } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ConnectorAuthError } from '@/server/connectors/http';
import { OAuthRefusedError } from '@/server/connectors/oauth';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { type LiveDeps, type MyConnection, myGithubConnections, openGithub } from './github-live';

// Les outils GitHub de la discussion (docs/specs/2026-10-26-github-acces-complet.md), en direct avec la connexion
// GitHub de l'utilisateur, jamais celle d'un autre membre (github-live.ts) :
// - depots_github (lot 3) : les dépôts que Leon lit avec elle. Les noms viennent de GitHub : derrière la ligne de
//   garde, et décomptés du budget de lecture de la réponse, comme `lire`.
// Les outils qui écrivent (lots 7 à 10) sont dans github-actions.ts : ils proposent, l'utilisateur confirme d'un clic.

export type GithubToolDeps = LiveDeps & {
  budget: { chars: number };
  // La discussion où s'affichent les actions proposées, et l'agent qui les montre à la fin de la réponse.
  discussionId?: string;
  onAction?: (action: ActionView) => void;
  // La question de l'utilisateur dans cette réponse : les actions proposées en gardent un extrait, montré sur la carte.
  asked?: string;
};

export const NO_CONNECTION =
  'L’utilisateur n’a pas branché son propre GitHub dans Leon (Connexions › GitHub). Leon ne lit ni n’écrit jamais avec le GitHub d’un autre membre.';
const SCOPE_LINE =
  'Leon ne voit que les dépôts ouverts à cette connexion : ceux où son appli GitHub est installée (à modifier sur GitHub), ou ceux saisis avec une clé.';
export const missingRight = (right: string) =>
  `GitHub refuse : l’appli Leon n’a pas le droit ${right} sur ce dépôt. Il faut l’ajouter dans la console de l’appli GitHub (docs/guides/applis-oauth.md), puis que l’utilisateur accepte la demande sur GitHub.`;

export const refused = (connection: MyConnection) =>
  `GitHub refuse l’accès de la connexion « ${connection.label} » : l’utilisateur doit la reconnecter dans Connexions.`;
export const isRefused = (error: unknown) =>
  error instanceof OAuthRefusedError ||
  (error instanceof ConnectorAuthError && error.status === 401);

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
      const mine = await myGithubConnections(ctx);
      if (mine.length === 0) return NO_CONNECTION;
      const lines = [DATA_GUARD_LINE];
      for (const connection of mine) {
        try {
          const repos = await (await openGithub(ctx, connection, deps)).repos();
          lines.push(...renderRepos(connection.label, repos, deps.budget));
        } catch (error) {
          if (!(isRefused(error) || error instanceof ConnectorAuthError)) throw error;
          lines.push(refused(connection));
        }
      }
      return [...lines, SCOPE_LINE].join('\n');
    },
  };
}
