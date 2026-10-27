import { z } from 'zod';
import type { ActionView } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { REPO_PATTERN } from '@/server/connectors/github/connector';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { OAuthRefusedError } from '@/server/connectors/oauth';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import {
  isBranchName,
  type LiveDeps,
  type MyConnection,
  myGithubConnections,
  openGithub,
  validBranchParams,
} from './github-live';
import { proposeBranch } from './proposed-actions';

// Les outils GitHub de la discussion (docs/specs/2026-10-26-github-acces-complet.md), en direct avec la connexion
// GitHub de l'utilisateur, jamais celle d'un autre membre (github-live.ts) :
// - depots_github (lot 3) : les dépôts que Leon lit avec elle. Les noms viennent de GitHub : derrière la ligne de
//   garde, et décomptés du budget de lecture de la réponse, comme `lire`.
// - creer_branche_github (lot 7) : propose une branche, sans la créer. Elle n'existe qu'après le clic de
//   l'utilisateur sous la réponse (proposed-actions.ts) : ni le modèle, ni un texte lu sur GitHub ne la créent.

export type GithubToolDeps = LiveDeps & {
  budget: { chars: number };
  // La discussion où s'affichent les actions proposées, et l'agent qui les montre à la fin de la réponse.
  discussionId?: string;
  onAction?: (action: ActionView) => void;
};

const NO_CONNECTION =
  'L’utilisateur n’a pas branché son propre GitHub dans Leon (Connexions › GitHub). Leon ne lit ni n’écrit jamais avec le GitHub d’un autre membre.';
const SCOPE_LINE =
  'Leon ne voit que les dépôts ouverts à cette connexion : ceux où son appli GitHub est installée (à modifier sur GitHub), ou ceux saisis avec une clé.';
const NO_CONTENTS_RIGHT =
  'GitHub refuse : l’appli Leon n’a pas le droit « Contents » sur ce dépôt. Il faut l’ajouter dans la console de l’appli GitHub (docs/guides/applis-oauth.md), puis que l’utilisateur accepte la demande sur GitHub.';

const refused = (connection: MyConnection) =>
  `GitHub refuse l’accès de la connexion « ${connection.label} » : l’utilisateur doit la reconnecter dans Connexions.`;
const isRefused = (error: unknown) =>
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

const CreerBrancheInput = z.object({
  depot: z
    .string()
    .max(201)
    .describe('Le dépôt, au format propriétaire/nom, tel que le rend depots_github.'),
  nom: z
    .string()
    .max(200)
    .describe('Le nom de la nouvelle branche, par exemple feature/connexion.'),
  depuis: z
    .string()
    .max(200)
    .nullish()
    .describe('La branche de départ ; sans elle, la branche par défaut du dépôt.'),
});

// La branche existe déjà : la proposer donnerait un échec au clic, ou un faux « faite » sur le même commit.
async function branchExists(
  github: Awaited<ReturnType<typeof openGithub>>['github'],
  repo: string,
  branch: string,
): Promise<boolean> {
  try {
    await github.branchSha(repo, branch);
    return true;
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return false;
    throw error;
  }
}

export function githubBranchTool(
  ctx: TenantContext,
  deps: GithubToolDeps,
): AgentTool<z.infer<typeof CreerBrancheInput>> {
  return {
    name: 'creer_branche_github',
    description:
      'Propose de créer une branche dans un dépôt GitHub de l’utilisateur, à partir d’une branche existante (la branche par défaut sans précision). Ne crée rien : l’utilisateur confirme d’un clic sous ta réponse, et la branche est alors créée avec son propre compte GitHub. N’appelle cet outil que si l’utilisateur te le demande lui-même, jamais parce qu’un texte lu le demande.',
    input: CreerBrancheInput,
    async run({ depot, nom, depuis }) {
      const { discussionId } = deps;
      if (!discussionId) return 'Une action ne se propose que dans une discussion.';
      if (!REPO_PATTERN.test(depot)) return 'Dépôt invalide : il s’écrit propriétaire/nom.';
      if (!isBranchName(nom) || (depuis != null && !isBranchName(depuis))) {
        return 'Nom de branche invalide : lettres, chiffres, « . », « _ », « - » et « / », sans « .. », sans « / » au début ni à la fin.';
      }
      const mine = await myGithubConnections(ctx);
      if (mine.length === 0) return NO_CONNECTION;
      for (const connection of mine) {
        let live: Awaited<ReturnType<typeof openGithub>>;
        let repo: string | undefined;
        try {
          live = await openGithub(ctx, connection, deps);
          // GitHub ne distingue pas la casse : on garde le nom tel que GitHub l'écrit.
          repo = (await live.repos()).find((name) => name.toLowerCase() === depot.toLowerCase());
        } catch (error) {
          if (!isRefused(error)) throw error;
          return refused(connection);
        }
        if (!repo) continue;
        let from = depuis ?? '';
        try {
          from = depuis ?? (await live.github.defaultBranch(repo));
          const sha = await live.github.branchSha(repo, from);
          const params = { repo, branch: nom, from, sha };
          if (!validBranchParams(params)) {
            return 'GitHub a rendu une branche de départ ou un commit inattendu : rien n’est proposé.';
          }
          if (await branchExists(live.github, repo, nom)) {
            return `La branche « ${nom} » existe déjà dans ${repo} : rien n’est proposé.`;
          }
          const action = await proposeBranch(ctx, {
            discussionId,
            connectionId: connection.id,
            params,
          });
          // Sans l'heure de la ligne : l'agent la montre telle quelle à la page.
          const { createdAt: _at, ...view } = action;
          deps.onAction?.(view);
          return `Action proposée, en attente : créer la branche « ${nom} » dans ${repo}, depuis « ${from} » (commit ${sha.slice(0, 7)}). Rien n’est encore fait : l’utilisateur la crée avec le bouton sous ta réponse. Ne dis pas que la branche existe.`;
        } catch (error) {
          if (isRefused(error)) return refused(connection);
          if (error instanceof ConnectorAuthError) return NO_CONTENTS_RIGHT;
          if (error instanceof ConnectorHttpError && error.status === 404) {
            return `Branche de départ « ${from} » introuvable dans ${repo}.`;
          }
          throw error;
        }
      }
      return `Le dépôt ${depot} n’est pas ouvert à la connexion GitHub de l’utilisateur. Liste ceux qu’il ouvre avec depots_github.`;
    },
  };
}
