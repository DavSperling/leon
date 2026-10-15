import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type GitlabClient, gitlabClient, type Listed, type Stream } from './client';
import { advance, apiTime, cursorKey, isDone, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://docs.gitlab.com/api/issues/                       (liste des tickets d'un projet)
//   https://docs.gitlab.com/api/merge_requests/               (liste des demandes de fusion d'un projet)
//   https://docs.gitlab.com/api/notes/                        (notes d'un ticket ou d'une demande)
//   https://docs.gitlab.com/api/rest/                         (pagination, chemins encodés)
//   https://docs.gitlab.com/api/rest/authentication/          (en-tête PRIVATE-TOKEN, 401 et 403)
//   https://docs.gitlab.com/api/users/                        (GET /user)
//   https://docs.gitlab.com/user/profile/personal_access_tokens/ (création du jeton, expiration)
//   https://docs.gitlab.com/security/tokens/access_token_scopes/ (portée read_api)
//   https://docs.gitlab.com/user/gitlab_com/rate_limits/      (429, Retry-After)
//   https://docs.gitlab.com/user/reserved_names/              (forme des chemins de projet)
// Choix qui diffèrent du plan, d'après la doc : les pages suivantes se lisent par l'en-tête Link ;
// les tickets sont lus par curseur (`pagination=keyset`, avec `order_by=updated_at` : documenté
// depuis GitLab 18.3), les demandes de fusion par décalage faute de mention dans la liste des
// ressources à curseur de la doc ; `scope=all` est explicite ; les sous-groupes
// (groupe/sous-groupe/projet) sont acceptés ; les dates de GitLab sont de l'ISO 8601 en UTC (« Z »),
// sans conversion à faire.
// Les notes système sont écartées (`system: true`) ; l'exemple de la doc marque pourtant `system: true`
// une note qui est un vrai commentaire, ce qui ressemble à une faute de la doc. Un 403 sur les notes
// d'un élément est attrapé : l'élément sort sans elles. Un élément sans texte sort sans tours (le
// socle l'écarte) pour que le curseur avance.
//
// Non vérifié :
//   - si `GET /user` répond à un jeton qui n'a que la portée read_api (la doc dit que read_api
//     donne la lecture de l'API et que read_user vise /user, sans trancher) ;
//   - si `user_notes_count` exclut les notes système (la doc ne le définit pas) : on ne demande
//     les notes d'un élément que si ce nombre n'est pas 0 ;
//   - la réponse de GitLab pour un projet dont les tickets ou les demandes de fusion sont
//     désactivés (la doc ne le dit pas) ;
//   - si `updated_after` accepte les millisecondes (on envoie des secondes) ;
//   - la forme exacte des liens `next` (adresses /projects/<id>/… dans les fixtures, construites
//     d'après la doc).
// Limite connue, pour les demandes de fusion seulement (lues par décalage, curseur non documenté
// pour elles) : une demande modifiée pendant que les pages d'un même projet sont lues peut décaler
// les pages et en faire manquer une autre, qui ne reviendra qu'à sa prochaine modification.

// Segments séparés par « / » (jusqu'à 20 sous-groupes) : lettres, chiffres, « _ », « . » et « - »,
// sans commencer par « . » ou « - », ce qui exclut « . » et « .. » qui changeraient l'adresse appelée.
const SEGMENT = '[A-Za-z0-9_][A-Za-z0-9_.-]*';
const PROJECT_PATTERN = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){1,20}$`);
// L'identifiant d'un élément (« issue:<chemin>#12 ») ne dépasse pas 200 caractères.
const PROJECT_MAX = 150;

const ConfigSchema = z.object({
  token: z.string().trim().min(1).max(500),
  projects: z.array(z.string().trim().max(PROJECT_MAX).regex(PROJECT_PATTERN)).min(1).max(20),
});
type Config = z.infer<typeof ConfigSchema>;

const STREAMS: Stream[] = ['issues', 'merge_requests'];

async function readItem(
  gitlab: GitlabClient,
  project: string,
  stream: Stream,
  listed: Listed,
): Promise<ConnectorItem> {
  let notes: Awaited<ReturnType<GitlabClient['notes']>> = [];
  if (listed.user_notes_count !== 0) {
    try {
      notes = await gitlab.notes(project, stream, listed.iid);
    } catch (error) {
      // Seul un 401 remonte : un 403 sur les notes laisse l'élément sans elles.
      if (!(error instanceof ConnectorAuthError && error.status === 403)) throw error;
    }
  }
  return toItem(stream, project, listed, notes);
}

async function* syncStream(
  gitlab: GitlabClient,
  project: string,
  stream: Stream,
  cursor: ReturnType<typeof readCursor>,
  since: Date,
): AsyncGenerator<SyncPage> {
  const key = cursorKey(stream, project);
  const mark = cursor[key];
  const from = mark ? new Date(Date.parse(mark.at)) : since;
  for await (const rows of gitlab.list(project, stream, apiTime(from))) {
    const items: ConnectorItem[] = [];
    for (const row of rows) {
      if (!isDone(cursor[key], row)) items.push(await readItem(gitlab, project, stream, row));
      cursor[key] = advance(cursor[key], row);
    }
    if (items.length > 0) yield { items, cursor: JSON.stringify(cursor) };
  }
}

async function* syncProjects(
  gitlab: GitlabClient,
  projects: string[],
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const cursor = readCursor(state.cursor);
  for (const project of projects) {
    for (const stream of STREAMS) yield* syncStream(gitlab, project, stream, cursor, state.since);
  }
}

export const gitlabConnector: Connector<Config> = {
  id: 'gitlab',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['gitlab.com'],

  async verify(config: Config, http: ConnectorHttp) {
    const gitlab = gitlabClient(config.token, http);
    const { username } = await gitlab.account();
    for (const project of config.projects) await gitlab.checkProject(project);
    return { account: username };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncProjects(gitlabClient(config.token, http), config.projects, state);
  },
};
