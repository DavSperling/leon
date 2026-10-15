import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type MissiveClient, missiveClient, tolerate } from './client';
import { advance, isDone, readCursor } from './cursor';
import { toItem } from './map';
import type { Conversation } from './schemas';

// Doc lue le 15/10/2026 :
//   https://missiveapp.com/docs/developers/rest-api (adresse https://public.missiveapp.com/v1,
//     jeton personnel en Bearer créé dans Préférences › API, forfait Productive requis)
//   https://missiveapp.com/docs/developers/rest-api/endpoints (GET /conversations, /conversations/:id/messages,
//     /conversations/:id/comments, GET /messages/:id,:id, /users, /organizations ; dates en secondes Unix)
//   https://missiveapp.com/docs/developers/rest-api/rate-limits (5 requêtes simultanées, 300 par minute,
//     900 par 15 minutes ; 429 avec Retry-After ; au plus une requête par seconde en continu)
//   (l'ancienne adresse learn.missiveapp.com/api-documentation/… renvoie par un 301 vers ces pages)
//
// Écarts au plan, d'après la doc :
//   - Aucun filtre « modifié depuis » : la liste des conversations ne se lit que du plus récent au plus
//     ancien (`until` = date d'activité de la plus ancienne déjà lue). Comme pour Sentry, un passage lit
//     les pages jusqu'à `since` (ou au curseur), trie par activité croissante, puis rend des pages de
//     20 conversations avec leur curseur. Un grand premier passage relit donc la liste à chaque reprise.
//   - Une boîte est obligatoire : on lit « Tous » (`all=true`). La doc ne dit pas si elle contient les
//     boîtes partagées et les équipes ; `team_all` par équipe n'est pas lu (le plan disait « boîtes
//     partagées et équipe »).
//   - La liste des messages n'a pas leur corps : `GET /messages/:id,:id` le rend, par groupes de 10 (la
//     doc ne donne pas de maximum). Avec un seul identifiant, la réponse est un objet
//     (`{ messages: { … } }`), pas un tableau : une conversation d'un message, ou un dernier groupe
//     d'un seul (11, 21… messages), prend cette forme. Trois requêtes au moins par conversation
//     (messages, corps, commentaires), d'où `minIntervalMs` à 1 s : 900 requêtes par 15 minutes.
//   - Chaque message et chaque commentaire est un tour `participant` ; pas de tour `document`.
//     Les publications des intégrations (`/posts`) et les brouillons ne sont pas lus.
//   - Un invité d'une conversation n'en reçoit que l'identifiant : un 403 ou un 404 sur ses messages ou
//     ses commentaires la laisse sans eux, et sans texte elle n'est pas rendue. Un 403 sur les corps
//     laisse l'aperçu des messages.
//
// Non vérifié (aucune clé réelle) :
//   - que « Tous » contient les boîtes partagées et les équipes de l'utilisateur ;
//   - que `until` est inclus (le client écarte les doublons) et que `last_activity_at` bouge aussi
//     pour un commentaire ou une étiquette ;
//   - la forme de `author` d'un message sortant (la doc ne liste pas ses clés ; ses exemples ont
//     id, name, email, avatar_url), le format du corps des SMS et des commentaires (mentions) ;
//   - que les dates sont en secondes (la doc le suggère par ses exemples sans le dire) ;
//   - les réponses citées d'un courriel restent dans son texte ;
//   - une limite des 900 requêtes par 15 minutes atteinte : le client attend au plus 60 s, la connexion
//     passe alors en erreur pour une heure.

const ConfigSchema = z.object({ token: z.string().trim().min(1).max(500) });
type Config = z.infer<typeof ConfigSchema>;

const PAGE_SIZE = 20; // conversations par page rendue : chacune coûte au moins trois requêtes

const byActivity = (a: Conversation, b: Conversation) =>
  a.last_activity_at - b.last_activity_at || a.id.localeCompare(b.id);

// Un échec sur les messages ou les commentaires (invité, conversation disparue) ne perd pas l'autre.
async function readItem(client: MissiveClient, row: Conversation): Promise<ConnectorItem | null> {
  const messages = await tolerate(() => client.messages(row.id), []);
  const comments = await tolerate(() => client.comments(row.id), []);
  return toItem(row, messages, comments);
}

async function* syncConversations(
  client: MissiveClient,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let mark = readCursor(state.cursor);
  const from = mark?.at ?? Math.floor(state.since.getTime() / 1000);
  const done = mark;
  const rows = (await client.conversations(from))
    .filter((row) => row.last_activity_at >= from && !isDone(done, row))
    .sort(byActivity);
  for (let start = 0; start < rows.length; start += PAGE_SIZE) {
    const items: ConnectorItem[] = [];
    for (const row of rows.slice(start, start + PAGE_SIZE)) {
      const item = await readItem(client, row);
      if (item) items.push(item);
      mark = advance(mark, row);
    }
    yield { items, cursor: JSON.stringify(mark) };
  }
}

export const missiveConnector: Connector<Config> = {
  id: 'missive',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['public.missiveapp.com'],
  minIntervalMs: 1000,

  async verify(config: Config, http: ConnectorHttp) {
    const client = missiveClient(config, http);
    const me = (await client.users()).find((user) => user.me);
    const organizations = (await client.organizations()).map((entry) => entry.name).join(', ');
    const who = me?.name || me?.email;
    if (who) return { account: organizations ? `${who} (${organizations})` : who };
    return { account: organizations ? `organisation ${organizations}` : 'compte Missive' };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncConversations(missiveClient(config, http), state);
  },
};
