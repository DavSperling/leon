import { z } from 'zod';
import { ConnectorAuthError } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type GraphClient, graphClient } from './client';
import { advance, isDone, type Mark, readCursor, type StreamKey } from './cursor';
import { eventToItem, isPersonal, threadsOf } from './map';
import { outlookOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://learn.microsoft.com/en-us/graph/api/user-list-messages (filtre et tri : la propriété du
//     tri doit être dans le filtre, sinon InefficientFilter ; 10 messages par page, 1 000 au plus ;
//     page suivante = @odata.nextLink ; l'en-tête Prefer: outlook.body-content-type="text" donne le
//     corps en texte, alors que la page dit aussi « corps en HTML seulement » : un corps HTML est
//     converti quand même)
//   https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages (Mail.Read pour le corps ;
//     Mail.ReadBasic n'a pas le corps), https://learn.microsoft.com/en-us/graph/api/resources/message
//   https://learn.microsoft.com/en-us/graph/api/user-list-events (séries et événements isolés, pas
//     leurs occurrences ; dates de début et de fin en UTC sans en-tête de fuseau ; Calendars.Read)
//   https://learn.microsoft.com/en-us/graph/api/resources/event
//   Authentification : voir oauth.ts.
//
// Écarts au plan, d'après la doc :
//   - Un fil ne revient qu'avec les messages lus pendant le passage (ceux reçus depuis le curseur),
//     pas tous ceux de la conversation : les relire coûterait une requête par fil, et un filtre sur
//     `conversationId` lirait aussi les brouillons, indésirables et éléments supprimés. L'ingestion
//     ne crée que les tours nouveaux : le fil déjà connu reste tel quel.
//   - Un message des éléments envoyés est daté de son envoi (receivedDateTime), un message de la boîte
//     de réception de sa réception ; un fil dont des messages sont dans les deux dossiers sort en
//     deux éléments qui portent le même identifiant : ils se rejoignent à l'ingestion.
//   - Les événements : filtrés et triés par lastModifiedDateTime, une série entière en un élément.
//     Un événement privé, ou sans participant ni description, n'est pas rendu.
//   - Un 403 sur l'agenda (droit Calendars.Read non accordé) le laisse de côté sans arrêter le courrier.
//
// Non vérifié (aucun compte réel) : que Graph accepte $filter et $orderby sur lastModifiedDateTime
// pour les événements ; que le corps en texte vienne bien avec l'en-tête Prefer ; que Prefer et
// $select ensemble ne changent rien ; l'erreur d'une boîte sans licence Exchange (404 attendu :
// elle sort en « Outlook a répondu 404 », nouvel essai dans une heure) ; la limite de débit de Graph
// pour Outlook (10 000 requêtes par 10 minutes et par boîte : un passage de 200 éléments reste loin) ;
// qu'une réponse cite tout le fil précédent (le corps est gardé tel quel, citations comprises) ;
// que les identifiants de message (≈ 150 caractères) tiennent dans les 180 caractères d'un tour.
// Une restauration d'un courrier supprimé change son identifiant : il serait relu en doublon.

// Pas de clé collée : un compte Microsoft ne se branche que par le bouton.
const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

type Step = { items: ConnectorItem[]; removed: string[]; mark: Mark | null; moved: boolean };

// Une page de lignes de Graph : celles que la position a déjà vues sont écartées, la position avance
// jusqu'à la dernière ligne (même sans élément à rendre : un message vide a été vu).
async function* readStream<T extends { id: string }>(
  rows: AsyncIterable<T[]>,
  timeOf: (row: T) => string,
  toItems: (rows: T[]) => ConnectorItem[],
  start: Mark | null,
  removedOf: (rows: T[]) => string[] = () => [],
): AsyncGenerator<Step> {
  let mark = start;
  for await (const page of rows) {
    const before = mark;
    const fresh = page.filter((row) => !isDone(before, { id: row.id, at: timeOf(row) }));
    for (const row of fresh) mark = advance(mark, { id: row.id, at: timeOf(row) });
    yield { items: toItems(fresh), removed: removedOf(fresh), mark, moved: mark !== before };
  }
}

// Dans cet ordre : la boîte de réception, les éléments envoyés, l'agenda.
const streams = (
  client: GraphClient,
  from: (key: StreamKey) => Date,
  start: (key: StreamKey) => Mark | null,
) => [
  {
    key: 'inbox' as const,
    run: () =>
      readStream(
        client.messages('inbox', from('inbox')),
        (m) => m.receivedDateTime,
        (rows) => threadsOf(rows, 'inbox'),
        start('inbox'),
      ),
  },
  {
    key: 'sent' as const,
    run: () =>
      readStream(
        client.messages('sentitems', from('sent')),
        (m) => m.receivedDateTime,
        (rows) => threadsOf(rows, 'sentitems'),
        start('sent'),
      ),
  },
  {
    key: 'events' as const,
    run: () =>
      readStream(
        client.events(from('events')),
        (e) => e.lastModifiedDateTime,
        (rows) => rows.flatMap((e) => eventToItem(e) ?? []),
        start('events'),
        // Un événement devenu privé a pu être relevé avant : on le retire (audit n° 13).
        (rows) => rows.filter(isPersonal).map((e) => `event:${e.id}`),
      ),
  },
];

export const outlookConnector: Connector<Config> = {
  id: 'outlook',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['graph.microsoft.com'],
  oauth: outlookOAuth,
  privateRaw: true, // une boîte mail et un agenda sont personnels

  async verify(config, http) {
    const me = await graphClient(config, http).me();
    const address = me.mail || me.userPrincipalName;
    const key = me.id ? { accountKey: me.id } : {};
    if (me.displayName)
      return { account: address ? `${me.displayName} (${address})` : me.displayName, ...key };
    return { account: address || 'compte Outlook', ...key };
  },

  async *sync(config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    let state = readCursor(cursor);
    const start = (key: StreamKey) => state[key];
    const from = (key: StreamKey) => (state[key] ? new Date(state[key].at) : since);
    for (const { key, run } of streams(graphClient(config, http), from, start)) {
      try {
        for await (const step of run()) {
          state = { ...state, [key]: step.mark };
          if (step.items.length > 0 || step.removed.length > 0 || step.moved) {
            const removed = step.removed.length > 0 ? { removed: step.removed } : {};
            yield { items: step.items, cursor: JSON.stringify(state), ...removed };
          }
        }
      } catch (error) {
        // Seul l'agenda peut manquer : le droit Calendars.Read n'est pas accordé.
        if (key === 'events' && error instanceof ConnectorAuthError && error.status === 403) break;
        throw error;
      }
    }
  },
};
