import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type GithubClient, githubClient, type Issue } from './client';
import { type Discussion, toItem } from './map';
import { githubOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://docs.github.com/en/rest/issues/issues#list-repository-issues
//   https://docs.github.com/en/rest/issues/comments#list-issue-comments
//   https://docs.github.com/en/rest/pulls/pulls#list-pull-requests
//   https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request
//   https://docs.github.com/en/rest/pulls/comments#list-review-comments-on-a-pull-request
//   https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
//   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
//   https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
//   https://docs.github.com/en/rest/about-the-rest-api/api-versions
//   https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
// Choix qui diffèrent du plan, d'après la doc : l'en-tête User-Agent est obligatoire (une requête
// sans lui est refusée) ; le curseur garde aussi les numéros vus à l'instant du dernier élément.
// Version d'API 2022-11-28, prise en charge jusqu'au 10/03/2028 ; la 2026-03-10 existe et ne change
// aucun champ lu ici.
// Un 403 sur les commentaires, les avis ou les commentaires de revue (jeton sans « Pull requests »
// ou « Issues ») est attrapé : l'élément sort sans ces tours. Un avis en brouillon est ignoré.
// Un ticket sans texte sort sans tours (le socle l'écarte) pour que le curseur avance.
// Un dépôt dont les tickets sont désactivés : un 410 sur la liste des tickets fait lire les PR seules
// (GET /repos/{repo}/pulls, de la plus récente à la plus ancienne, arrêt à la première plus ancienne
// que le curseur : cette liste n'a pas de paramètre `since`), puis les mêmes lectures de commentaires
// et d'avis. Les autres erreurs de la liste des tickets restent remontées. `verify` ne regarde pas
// `has_issues` : un dépôt sans tickets est valide, il n'y a rien à refuser.
//
// Non vérifié : que GET /repos/{repo}/issues répond bien 410 quand les tickets sont désactivés (la
// doc de cette route ne liste que 200, 301, 404 et 422 ; seule la création d'un ticket documente ce
// 410 ; la réponse supposée est {"message":"Issues are disabled for this repo","status":"410"}, sans
// appel réel) ; que les commentaires d'une PR (/issues/{n}/comments) se lisent encore sur un dépôt
// sans tickets (sinon l'erreur remonte pour tout le dépôt) ; si `since` inclut l'instant donné (la
// doc dit seulement « mis à jour après » : on recule d'une seconde et on écarte les éléments déjà
// vus) ; que GET /user répond à un jeton à grain fin sans autre permission que Metadata (la doc ne
// le dit pas) ; la forme des liens `next` (adresses /repositories/<id>/… dans les fixtures,
// construites d'après la doc, sans exemple).
// Limite connue : un élément modifié pendant que les pages d'un même dépôt sont lues peut décaler
// les pages et en faire manquer un autre, qui ne reviendra qu'à sa prochaine modification.

const REPOS_MAX = 20;
const REPO_PATTERN = /^(?!\.{1,2}\/)(?!.*\/\.{1,2}$)[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// Deux façons de se brancher : une clé collée (`token`) ou le bouton (`accessToken`, `refreshToken`,
// `expiresAt`, voir `oauth.ts`). Une connexion enregistrée avant le bouton n'a pas d'`authMode` : elle
// est à clé. Les deux jetons du bouton ne sont pas dans `secretFields` : le socle les scelle avec lui.
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).max(500).optional(),
    accessToken: z.string().trim().min(1).max(500).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    // Propriétaire/nom ; ni « . » ni « .. » seuls, qui changeraient l'adresse appelée. Obligatoires
    // avec une clé ; avec le bouton, vide veut dire « les dépôts où l'appli est installée ».
    repos: z.array(z.string().trim().regex(REPO_PATTERN)).max(REPOS_MAX).default([]),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
    if (config.authMode === 'key' && config.repos.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['repos'], message: 'Required' });
    }
  });
type Config = z.infer<typeof ConfigSchema>;

// Le jeton de GitHub s'envoie de la même façon, clé collée ou jeton d'accès du bouton.
const bearerOf = (config: Config): string =>
  (config.authMode === 'oauth' ? config.accessToken : config.token) ?? '';

// Relu à chaque passage : un dépôt ajouté ou retiré sur GitHub est pris en compte sans reconnexion.
const reposToRead = (github: GithubClient, config: Config): Promise<string[]> =>
  config.repos.length > 0 ? Promise.resolve(config.repos) : github.installedRepos(REPOS_MAX);

// Par dépôt : l'instant du dernier élément lu et les numéros déjà lus à cet instant.
const CursorSchema = z.record(
  z.string(),
  z.object({ at: z.iso.datetime(), seen: z.array(z.number()) }),
);
type Cursor = z.infer<typeof CursorSchema>;
type Mark = Cursor[string];

function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// Déjà lu : plus ancien que le curseur, ou lu à l'instant même du curseur.
function isDone(mark: Mark | undefined, issue: Issue): boolean {
  if (mark === undefined) return false;
  const elapsed = Date.parse(issue.updated_at) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(issue.number));
}

function advance(mark: Mark | undefined, issue: Issue): Mark {
  const elapsed = mark === undefined ? 1 : Date.parse(issue.updated_at) - Date.parse(mark.at);
  if (mark === undefined || elapsed > 0) return { at: issue.updated_at, seen: [issue.number] };
  if (elapsed < 0 || mark.seen.includes(issue.number)) return mark;
  return { at: mark.at, seen: [...mark.seen, issue.number] };
}

// GitHub veut AAAA-MM-JJTHH:MM:SSZ, sans millisecondes.
const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

async function optional<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) return [];
    throw error;
  }
}

async function readItem(github: GithubClient, repo: string, issue: Issue): Promise<ConnectorItem> {
  const { number } = issue;
  const discussion: Discussion = { comments: [], reviews: [], reviewComments: [] };
  if (issue.comments !== 0) {
    discussion.comments = await optional(() => github.issueComments(repo, number));
  }
  if (issue.pull_request) {
    discussion.reviews = await optional(() => github.reviews(repo, number));
    discussion.reviewComments = await optional(() => github.reviewComments(repo, number));
  }
  return toItem(repo, issue, discussion);
}

// GitHub répond 410 « Issues are disabled for this repo » à la liste des tickets d'un dépôt qui les a
// désactivés (les PR, elles, existent toujours).
function isIssuesDisabled(error: unknown): boolean {
  return error instanceof ConnectorHttpError && error.status === 410;
}

// Les tickets et PR modifiés depuis `from`, du plus ancien au plus récent ; les PR seules quand les
// tickets du dépôt sont désactivés.
async function* changed(github: GithubClient, repo: string, from: Date): AsyncGenerator<Issue[]> {
  const since = apiTime(from);
  try {
    yield* github.issues(repo, since);
  } catch (error) {
    if (!isIssuesDisabled(error)) throw error;
    yield* github.pullRequests(repo, since);
  }
}

async function* syncRepos(
  github: GithubClient,
  repos: string[],
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const cursor = readCursor(state.cursor);
  for (const repo of repos) {
    const mark = cursor[repo];
    const from = mark ? new Date(Date.parse(mark.at) - 1000) : state.since;
    for await (const issues of changed(github, repo, from)) {
      const items: ConnectorItem[] = [];
      for (const issue of issues) {
        if (!isDone(cursor[repo], issue)) items.push(await readItem(github, repo, issue));
        cursor[repo] = advance(cursor[repo], issue);
      }
      if (items.length > 0) yield { items, cursor: JSON.stringify(cursor) };
    }
  }
}

export const githubConnector: Connector<Config> = {
  id: 'github',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.github.com'],
  oauth: githubOAuth,

  async verify(config: Config, http: ConnectorHttp) {
    const github = githubClient(bearerOf(config), http);
    const { id, login } = await github.account();
    for (const repo of config.repos) await github.checkRepo(repo);
    return { account: login, accountKey: String(id) };
  },

  async *sync(config: Config, state: SyncState, http: ConnectorHttp) {
    const github = githubClient(bearerOf(config), http);
    yield* syncRepos(github, await reposToRead(github, config), state);
  },
};
