import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type AttioClient, attioClient, type Thread } from './client';
import { advance, type Cursor, isDone, readCursor, type Stamp } from './cursor';
import { makeDirectory } from './directory';
import { noteItem, noteStamp, threadItem, threadStamp } from './map';
import { attioOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://docs.attio.com/rest-api/guides/authentication (Authorization: Bearer <jeton> ; jeton
//     d'espace créé par un administrateur : Workspace settings › Developers › + New access token ;
//     il n'expire pas ; les droits se règlent à la création)
//   https://docs.attio.com/rest-api/guides/rate-limiting (100 lectures par seconde, 25 écritures ;
//     429 avec Retry-After, une date ; une lecture limitée à 10 requêtes par seconde pour GET /v2/notes)
//   https://docs.attio.com/rest-api/guides/pagination (limit et offset ; une page de moins que
//     `limit` est la dernière)
//   https://docs.attio.com/rest-api/endpoint-reference/meta/identify (GET /v2/self : `active`,
//     `workspace_name`)
//   https://docs.attio.com/rest-api/endpoint-reference/notes/list-notes (GET /v2/notes : limit 10
//     par défaut, 50 au plus, offset, parent_object et parent_record_id ; champs `title`,
//     `content_plaintext`, `created_by_actor`, `created_at` ; droits note:read,
//     object_configuration:read, record_permission:read)
//   https://docs.attio.com/rest-api/endpoint-reference/threads/list-threads (GET /v2/threads :
//     limit 50 au plus, offset ; commentaires les plus anciens d'abord, 80 au plus par fil ;
//     droit comment:read)
//   https://docs.attio.com/rest-api/endpoint-reference/workspace-members/list-workspace-members
//     (GET /v2/workspace_members, droit user_management:read)
//   https://docs.attio.com/rest-api/endpoint-reference/records/get-a-record (GET
//     /v2/objects/{object}/records/{id} : `web_url`, `values`)
//
// Écarts au plan, d'après la doc : Attio ne filtre ni ne trie les notes et les fils par date, et
// une note n'a pas de date de modification. On relit donc la liste entière à chaque passage (une
// requête par 50 éléments), on écarte ici ce qui précède le curseur, et on rend les plus anciens
// d'abord. Une note modifiée après sa création n'est pas relue. Un fil est daté de son dernier
// commentaire : un nouveau commentaire le fait revenir en entier ; au-delà de 80 commentaires,
// seuls les 80 premiers sont lus. Les fils sont de nature `fil`, les notes `note`. Le lien d'une
// note ou d'un fil mène à la fiche parente (Attio ne documente pas d'adresse de note).
// Un 403 sur les membres, les fiches ou les fils laisse sortir les notes sans nom d'auteur, de
// fiche ou de lien, ou sans fils (clé sans ces droits).
//
// Non vérifié (aucune clé réelle) : que GET /v2/threads sans filtre rende les fils de tout
// l'espace (la doc ne le dit pas : un 400 ou un 404 sur la liste des fils est traité comme
// « pas de fils ») ; l'ordre des listes ; que `note:read` et `comment:read` sont bien les noms
// des droits dans le formulaire du jeton ; que le jeton d'espace donne accès à toutes les fiches.
//
// Le bouton « Se connecter avec Attio » (adresses, droits, jeton) est décrit dans oauth.ts. Avec
// lui, le jeton d'accès remplace le jeton collé dans l'en-tête, rien d'autre ne change.

// Deux façons de se brancher : le jeton collé (`token`, forme d'origine, sans `authMode`) ou le
// bouton (`accessToken` et ses compagnons, posés par le socle OAuth ; le bouton ne remplit pas
// `token`). Un z.object raffiné, et non une union : le catalogue lit `.shape`.
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).max(500).optional(),
    accessToken: z.string().trim().min(1).max(2000).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Requis' });
  });
type Config = z.infer<typeof ConfigSchema>;

// Le jeton qui part dans l'en-tête, quelle que soit la façon de se brancher.
function bearerToken(config: Config): string {
  const token = config.authMode === 'oauth' ? config.accessToken : config.token;
  if (!token) throw new ConnectorAuthError('Attio'); // le schéma l'exige déjà : ne se produit pas
  return token;
}

const PAGE_ITEMS = 100; // éléments rendus par page, au plus

// La liste des fils est refusée (clé sans le droit des commentaires) ou introuvable : pas de fils.
const isThreadListUnavailable = (error: unknown): boolean =>
  (error instanceof ConnectorAuthError && error.status === 403) ||
  (error instanceof ConnectorHttpError && (error.status === 400 || error.status === 404));

async function* sync(attio: AttioClient, since: Date, rawCursor: string | null) {
  const cursor = readCursor(rawCursor);
  const directory = makeDirectory(attio);

  const notes = await attio.allNotes((note) => !isDone(cursor.notes, since, noteStamp(note)));
  yield* pagesOf(cursor, 'notes', notes, noteStamp, async (note) =>
    noteItem(
      note,
      await directory.parent(note.parent_object, note.parent_record_id),
      (await directory.whoIs())(note.created_by_actor),
    ),
  );

  let threads: Thread[] = [];
  try {
    threads = await attio.allThreads(
      (thread) => !isDone(cursor.threads, since, threadStamp(thread)),
    );
  } catch (error) {
    if (!isThreadListUnavailable(error)) throw error;
  }
  yield* pagesOf(cursor, 'threads', threads, threadStamp, async (thread) => {
    const record = thread.comments.find((comment) => comment.record)?.record;
    const parent = record ? await directory.parent(record.object_id, record.record_id) : null;
    return threadItem(thread, parent, await directory.whoIs());
  });
}

// Les plus anciens d'abord, 100 par page ; le curseur avance élément après élément.
async function* pagesOf<T>(
  cursor: Cursor,
  kind: keyof Cursor,
  rows: T[],
  stampOf: (row: T) => Stamp,
  toItem: (row: T) => Promise<ConnectorItem | null>,
): AsyncGenerator<SyncPage> {
  const byAge = (a: T, b: T) =>
    stampOf(a).at - stampOf(b).at || stampOf(a).id.localeCompare(stampOf(b).id);
  const sorted = [...rows].sort(byAge);
  for (let first = 0; first < sorted.length; first += PAGE_ITEMS) {
    const items: ConnectorItem[] = [];
    for (const row of sorted.slice(first, first + PAGE_ITEMS)) {
      const item = await toItem(row);
      if (item) items.push(item);
      cursor[kind] = advance(cursor[kind], stampOf(row));
    }
    yield { items, cursor: JSON.stringify(cursor) };
  }
}

export const attioConnector: Connector<Config> = {
  id: 'attio',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.attio.com'],
  minIntervalMs: 120, // 10 requêtes par seconde pour la liste des notes
  oauth: attioOAuth,

  async verify(config: Config, http: ConnectorHttp) {
    const attio = attioClient(bearerToken(config), http);
    const self = await attio.self();
    // Un jeton inconnu ou révoqué reçoit une réponse 200 « active: false ».
    if (!self.active) throw new ConnectorAuthError('Attio', 401);
    await attio.probeNotes();
    return {
      account: self.workspace_name ? `Attio (espace ${self.workspace_name})` : 'Attio (clé valide)',
    };
  },

  sync(config: Config, state, http: ConnectorHttp) {
    return sync(attioClient(bearerToken(config), http), state.since, state.cursor);
  },
};
