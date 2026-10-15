import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type BasecampClient, basecampClient, type Kind, type Listed } from './client';
import { type Cursor, newest, readCursor, type Stream } from './cursor';
import { toItem } from './map';
import { basecampOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://github.com/basecamp/bc3-api/blob/master/README.md  (adresse de base avec le numéro du
//     compte, User-Agent, pagination par l'en-tête Link, HTTP 429 et Retry-After, limite de 50
//     requêtes par 10 secondes et par adresse IP, 404 pour un élément inaccessible)
//   https://github.com/basecamp/bc3-api/blob/master/sections/recordings.md  (GET /projects/recordings.json :
//     `type` Message ou Document, `sort=updated_at`, `direction`, `status`)
//   https://github.com/basecamp/bc3-api/blob/master/sections/messages.md, documents.md, comments.md,
//     rich_text.md, people.md (GET /my/profile.json)
//   https://github.com/basecamp/basecamp-sdk/blob/main/openapi.json  (spec officielle, version du
//     15/09/2026 : le schéma `Recording`, la route plate /recordings/{id}/comments.json)
// Choix qui diffèrent du plan, d'après la doc :
//   - la liste des enregistrements n'a ni filtre « modifié depuis » ni ordre croissant garanti avec
//     un point d'arrêt : on la lit du plus récent au plus ancien et on s'arrête à la première date
//     déjà vue (voir cursor.ts). Un parcours coupé par la limite du passage reprend à l'adresse de
//     la page suivante ;
//   - la liste ne rend pas le texte (aucun exemple de la doc n'y met `content`) : chaque élément
//     modifié est relu par sa route plate (/messages/<id>.json, /documents/<id>.json), puis ses
//     commentaires (/recordings/<id>/comments.json) s'il en a ;
//   - le plan citait les « discussions » ; Basecamp n'a pas de ressource de ce nom, ses échanges sont
//     les messages et leurs commentaires. Les tâches, cartes, événements et questions ne sont pas lus.
// Un 404 ou un 403 sur un élément ou sur ses commentaires (supprimé entre la liste et sa lecture,
// accès retiré) l'écarte sans arrêter le passage ; un 401 remonte. Au-delà de 10 pages de
// commentaires d'un même élément, le reste est ignoré. Aucun `ETag` n'est renvoyé à Basecamp, qui
// le demande pour les relectures (« You must use HTTP freshness headers ») : le client commun ne le
// gère pas, et chaque relève ne relit que ce qui a changé.
//
// Non vérifié (aucun compte réel) :
//   - qu'un commentaire ajouté fasse bouger `updated_at` du message ou du document, ce que ce
//     parcours suppose (la doc ne le dit pas) ; sinon un message n'est relu qu'à sa propre modification ;
//   - que la liste des enregistrements rende bien les plus récents d'abord avec `direction=desc` et
//     que ses pages suivent le même ordre ; qu'elle ne contienne pas déjà `content` (alors la relecture
//     serait inutile mais sans effet) ;
//   - que les commentaires soient rendus du plus ancien au plus récent (on les trie par date) ;
//   - qu'un projet archivé ou un compte inactif réponde autrement qu'en 404 (un compte inactif rend
//     « Reason: Account Inactive » : la connexion passe en erreur et reprend dans une heure).
// Limite connue : une publication retirée (corbeille, archive) pendant qu'un parcours est coupé peut
// décaler les pages et en faire manquer une, qui ne reviendra qu'à sa prochaine modification.

// Un outil qui ne se branche que par le bouton : pas de clé collée, donc un `z.object` simple (le
// catalogue lit `.shape`). Le numéro du compte tient dans l'adresse appelée : que des chiffres.
const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  accountId: z.string().regex(/^[0-9]{1,20}$/),
  accountName: z.string().min(1).max(200),
});
type Config = z.infer<typeof ConfigSchema>;

// Basecamp rend 404 pour un élément supprimé ou inaccessible, 403 quand le jeton n'y a pas droit.
async function orGone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    const gone = error instanceof ConnectorHttpError && error.status === 404;
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    if (gone || denied) return null;
    throw error;
  }
}

async function readItem(
  client: BasecampClient,
  kind: Kind,
  account: string,
  row: Listed,
): Promise<ConnectorItem | null> {
  const item = await orGone(() => client.item(kind, row.id));
  if (!item) return null;
  const comments = item.comments_count ? await orGone(() => client.comments(row.id)) : null;
  return toItem(kind, account, item, comments ?? []);
}

// Un parcours du plus récent au plus ancien ; chaque page rendue est rangée par date croissante.
async function* syncStream(
  client: BasecampClient,
  kind: Kind,
  state: Cursor,
  account: string,
): AsyncGenerator<SyncPage> {
  for (;;) {
    const current: Stream = state[kind];
    const { data: rows, nextUrl } = await client.list(kind, current.next);
    const fresh = rows.filter((row) => Date.parse(row.updated_at) > Date.parse(current.from));
    const items: ConnectorItem[] = [];
    for (const row of fresh.reverse()) {
      const item = await readItem(client, kind, account, row);
      if (item) items.push(item);
    }
    const top = newest([current.top, ...rows.map((row) => row.updated_at)]);
    // Fini quand il n'y a plus de page, ou qu'une date déjà vue est apparue : le reste est plus ancien.
    const done = nextUrl === null || fresh.length < rows.length;
    const before = JSON.stringify(state);
    state[kind] = done
      ? { from: newest([top, current.from]) ?? current.from, top: null, next: null }
      : { from: current.from, top, next: nextUrl };
    const cursor = JSON.stringify(state);
    // Une page sans élément ne se rend que si elle fait avancer le curseur.
    if (items.length > 0 || cursor !== before) yield { items, cursor };
    if (done) return;
  }
}

async function* syncAll(client: BasecampClient, config: Config, state: SyncState) {
  const cursor = readCursor(state.cursor, client.base, state.since);
  yield* syncStream(client, 'message', cursor, config.accountName);
  yield* syncStream(client, 'document', cursor, config.accountName);
}

export const basecampConnector: Connector<Config> = {
  id: 'basecamp',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['3.basecampapi.com'],
  // Basecamp tolère 50 requêtes par 10 secondes : une toutes les 250 ms en reste sous.
  minIntervalMs: 250,
  oauth: basecampOAuth,

  async verify(config: Config, http: ConnectorHttp) {
    const { name } = await basecampClient(config, http).profile();
    return { account: `${config.accountName} (${name})` };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncAll(basecampClient(config, http), config, state);
  },
};
