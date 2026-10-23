import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import {
  atlassianAccess,
  atlassianHosts,
  oauthAccount,
  oauthShape,
  requireFields,
  siteSchema,
} from './access';
import { type Comment, type Issue, type JiraClient, jiraClient } from './client';
import { updatedSinceJql } from './jql';
import { toItem } from './map';
import { atlassianOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ (spécification OpenAPI :
//     dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json), recherche GET /rest/api/3/search/jql
//   https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/
//   https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
//   https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
//   https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/ (et nodes/mention, inlineCard, emoji)
//   https://support.atlassian.com/jira-software-cloud/docs/jql-fields/ (champ « Updated » : date à la minute)
//   https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/
// Choix qui diffèrent du plan, d'après la doc : l'élément porte l'id du ticket (« issue:10001 ») et non
// sa clé, qui change quand le ticket change de projet ; la recherche exige un fuseau, lu par
// GET /myself à chaque passage (jql.ts) ; le jeton doit être un jeton d'API ordinaire, un jeton « avec
// portées » ne passe que par api.atlassian.com ; le champ `created` n'est pas demandé (inutile).
// Un 403 sur les commentaires d'un ticket (page de rattrapage) est attrapé : le ticket sort avec les
// commentaires que la recherche a rendus. Un ticket sans texte sort sans tours (le socle l'écarte).
// Le curseur retient les tickets rendus dans les deux minutes qui précèdent le dernier, avec l'instant
// de leur modification : la recherche relit depuis une minute avant le curseur, et un ticket que l'index
// n'avait pas encore (retard de moins d'une minute) est rendu au passage suivant, les autres sont ignorés.
//
// Le bouton (OAuth, voir oauth.ts) appelle les mêmes points d'accès par api.atlassian.com/ex/jira/<cloudId>,
// en Bearer, avec les droits classiques read:jira-work (recherche, commentaires) et read:jira-user (/myself),
// d'après la spec OpenAPI lue le 15/10/2026.
//
// Non vérifié : si les commentaires de la recherche sont tronqués au-delà d'un nombre (la doc ne le dit
// pas : on compare `total` aux commentaires rendus et on lit le reste par /issue/{id}/comment) ; que le
// fuseau de la date JQL est bien celui de `myself.timeZone` (la doc dit « your configured time zone ») ;
// le code exact d'un site mal orthographié (404 ou redirection : les deux sont traités) ; l'index de
// recherche est « cohérent à terme » (secondes à minutes) : un ticket qui n'apparaît qu'après plus d'une
// minute de retard sur un ticket plus récent, déjà passé, n'est repris qu'à sa prochaine modification ;
// l'heure d'automne, où une heure locale se répète, peut faire manquer jusqu'à une heure de tickets.

// Une clé (site, e-mail, jeton d'API) ou le bouton (jetons, site et identifiant du site choisis chez
// Atlassian) : `requireFields` exige les champs de la forme choisie par `authMode`.
const ConfigSchema = z
  .object({
    ...oauthShape,
    // Un seul sous-domaine : ni point, ni chemin, ni port (l'adresse appelée est fixée par ce champ).
    site: siteSchema.optional(),
    email: z.string().trim().max(320).pipe(z.email()).optional(),
    apiToken: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine(requireFields);
type Config = z.infer<typeof ConfigSchema>;

const RESCAN_MS = 60_000; // la date de la requête est à la minute : on relit depuis une minute avant le curseur
// La recherche part de la minute pleine qui précède « curseur moins une minute » : elle peut rendre un
// ticket jusqu'à deux minutes avant le curseur. On retient donc les tickets rendus sur ce temps-là.
const KEEP_MS = 2 * RESCAN_MS;

// L'instant du dernier ticket lu, et les tickets déjà rendus dans les deux minutes qui précèdent, avec
// l'instant de leur modification (un ticket modifié de nouveau est rendu de nouveau).
const CursorSchema = z.object({
  at: z.iso.datetime(),
  seen: z.array(z.object({ id: z.string(), at: z.iso.datetime() })),
});
type Mark = z.infer<typeof CursorSchema>;

function readCursor(text: string | null): Mark | undefined {
  if (text === null) return undefined;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Déjà rendu : le curseur contient ce ticket, dans cet état ou dans un état plus récent. Un ticket plus
// ancien que le curseur mais pas rendu (la recherche l'a montré en retard) est rendu. Un ticket plus
// ancien que ce que le curseur retient n'a pas pu être oublié : la recherche ne le rend que par la marge
// de douze heures d'un compte sans fuseau, et il a été rendu depuis longtemps.
function isDone(mark: Mark | undefined, issue: Issue): boolean {
  if (mark === undefined) return false;
  const updated = Date.parse(issue.fields.updated);
  if (updated < Date.parse(mark.at) - KEEP_MS) return true;
  return mark.seen.some((row) => row.id === issue.id && Date.parse(row.at) >= updated);
}

function advance(mark: Mark | undefined, issue: Issue): Mark {
  const at = new Date(issue.fields.updated).toISOString();
  const latest = mark !== undefined && Date.parse(mark.at) > Date.parse(at) ? mark.at : at;
  const limit = Date.parse(latest) - KEEP_MS;
  const seen = [...(mark?.seen ?? []).filter((row) => row.id !== issue.id), { id: issue.id, at }];
  return { at: latest, seen: seen.filter((row) => Date.parse(row.at) >= limit) };
}

// La recherche rend les commentaires d'un ticket ; s'il y en a plus (`total`), on lit la liste entière.
async function allComments(jira: JiraClient, issue: Issue): Promise<Comment[]> {
  const found = issue.fields.comment;
  const inSearch = found?.comments ?? [];
  if (!found || found.total <= inSearch.length) return inSearch;
  try {
    const rows = await jira.comments(issue.id);
    return rows.length > inSearch.length ? rows : inSearch;
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) return inSearch;
    throw error;
  }
}

async function* syncIssues(
  jira: JiraClient,
  site: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let mark = readCursor(state.cursor);
  const { timeZone } = await jira.myself();
  const from = mark ? new Date(Date.parse(mark.at) - RESCAN_MS) : state.since;
  for await (const issues of jira.search(updatedSinceJql(from, timeZone))) {
    const items: ConnectorItem[] = [];
    for (const issue of issues) {
      if (isDone(mark, issue)) continue;
      items.push(toItem(site, issue, await allComments(jira, issue)));
      mark = advance(mark, issue);
    }
    if (items.length > 0) yield { items, cursor: JSON.stringify(mark) };
  }
}

// Un site mal écrit répond 404 ou renvoie vers une page de connexion.
function isUnknownSite(error: unknown): boolean {
  if (!(error instanceof ConnectorHttpError) || error.status === null) return false;
  return error.status === 404 || (error.status >= 300 && error.status < 400);
}

export const jiraConnector: Connector<Config> = {
  id: 'jira',
  configSchema: ConfigSchema,
  secretFields: ['apiToken'],
  hosts: atlassianHosts,
  oauth: atlassianOAuth([
    'read:jira-work',
    'read:jira-user',
    'write:jira-work', // Leon n'écrit pas encore : l'accès est demandé d'avance
    'offline_access',
  ]),

  async verify(config: Config, http: ConnectorHttp) {
    try {
      const me = await jiraClient(config, http).myself();
      const key = me.accountId
        ? { accountKey: `${me.accountId}:${config.cloudId ?? config.site}` }
        : {};
      if (config.authMode === 'oauth') return { account: oauthAccount(config), ...key };
      const name = me.displayName || me.emailAddress || config.email;
      return { account: `${name} (${config.site})`, ...key };
    } catch (error) {
      // Un 404 de la passerelle ne dit rien du nom d'un site : seule une adresse saisie peut être fausse.
      if (config.authMode === 'oauth' || !isUnknownSite(error)) throw error;
      throw new ConnectorHttpError(
        (error as ConnectorHttpError).status,
        'Site Jira introuvable : vérifiez le nom du site',
      );
    }
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncIssues(jiraClient(config, http), atlassianAccess(config, 'jira').site, state);
  },
};
