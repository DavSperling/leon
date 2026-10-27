import { z } from 'zod';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { fetchAccount, fetchThreads, fetchTimeline } from './client';
import { endRound, readCursor } from './cursor';
import { threadToItem } from './map';

// Doc lue le 15/10/2026 (https://www.plain.com/docs/) :
//   graphql/introduction (POST https://core-api.uk.plain.com/graphql/v1, en-tête
//     « Authorization: Bearer <clé d'API> »), graphql/authentication (clé créée sur un utilisateur
//     machine, avec ses droits propres), graphql/error-handling (extensions UNAUTHENTICATED,
//     FORBIDDEN, INTERNAL_SERVER_ERROR), graphql/pagination (Relay : first/after, 100 au plus,
//     pageInfo.endCursor), graphql/threads/get (requête `threads`, droit thread:read),
//     graphql/sdk (401, 403 et 429 distincts) ; l'aide https://help.plain.com/article/rate-limits
//     (450 à 1 000 requêtes par minute selon le plan, en-têtes x-ratelimit-*, 429 + RATE_LIMITED) ;
//     le schéma public https://core-api.uk.plain.com/graphql/v1/schema.graphql (ThreadsFilter,
//     ThreadsSort, Thread, TimelineEntry et ses types de message).
//
// Écarts au plan : (1) l'hôte est celui de la doc, sans réserve. (2) Les limites sont contradictoires
// (les articles de blog disent « pas de limite », l'aide dit 450 à 1 000 par minute) et l'aide ne
// parle pas de Retry-After : elle donne l'instant de reprise en ISO 8601 dans x-ratelimit-reset, que
// le client commun ne lit pas (il attend des secondes depuis 1970 et retombe sur 2, 4 et 8 s). On
// reste donc sous la limite la plus basse (`minIntervalMs`) au lieu de compter sur la reprise.
// (3) L'ordre : on ne peut pas trier par date de modification (ThreadsSort n'a que STATUS_CHANGED_AT,
// CREATED_AT, CLOSEST_TO_BREACH_SLA, LAST_INBOUND_MESSAGE_AT, PRIORITY, THREAD_FIELD). Comme monday.com,
// on filtre sur `updatedAt` (DatetimeFilter.after, borne comprise), on parcourt la liste par ordre de
// création, et le passage suivant repart du début de celui-ci moins 5 minutes (voir cursor.ts).
// (4) Les messages d'un fil sont la ressource principale, pas une ressource secondaire : un droit
// manquant sur la chronologie (FORBIDDEN) remonte en « Plain rejected the key » au lieu de ne rien lire.
// (5) Aucune adresse vers le fil : la doc n'en donne pas (`url` nul).
// Lus : courriels (dernier message seul, `textContent`), notes, chats, messages Slack, Teams et
// Discord. Non lus : entrées personnalisées, messages du centre d'aide, messages de fils fusionnés,
// événements, pièces jointes, description du fil. Le côté (client ou équipe) n'est pas rendu : seul
// le nom de l'auteur le laisse deviner.
//
// Non vérifié (aucune clé réelle) : les droits qu'il faut cocher (thread:read est documenté ;
// timeline:read et customer:read le sont pour d'autres requêtes, pas pour celles-ci) et celui de
// `myWorkspace` ; que `updatedAt` change quand un message arrive ; le fuseau des dates `iso8601`
// (supposé « …Z ») ; l'ordre des messages d'une chronologie (on les trie) ; que l'envoi de `first:
// 25` fils puis 50 messages passe sous les limites de complexité (la doc n'en donne aucune) ; le
// statut HTTP d'une clé refusée (401 ou 200 avec UNAUTHENTICATED : les deux sont reconnus).

const configSchema = z.object({ apiKey: z.string().trim().min(1) });
type Config = z.infer<typeof configSchema>;

export const plainConnector: Connector<Config> = {
  id: 'plain',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['core-api.uk.plain.com'],
  // 400 requêtes par minute, sous la limite la plus basse (450, plans Launch et Foundation).
  minIntervalMs: 150,

  async verify(config, http) {
    return { account: await fetchAccount(http, config.apiKey) };
  },

  async *sync(config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const saved = readCursor(cursor, since);
    // Le début du passage se note avant la première lecture, et se garde d'une reprise à l'autre.
    const started = saved.started ?? new Date().toISOString();
    let after = saved.after;
    for (;;) {
      const page = await fetchThreads(http, config.apiKey, saved.from, after);
      const items: ConnectorItem[] = [];
      for (const thread of page.threads) {
        const entries = await fetchTimeline(http, config.apiKey, thread.id);
        const item = entries === null ? null : threadToItem(thread, entries);
        if (item !== null) items.push(item);
      }
      // Un curseur répété par l'outil est la fin de la liste, pas une page de plus.
      const more = page.next !== null && page.next !== after;
      const next = more ? { from: saved.from, started, after: page.next } : endRound(started);
      yield { items, cursor: JSON.stringify(next) };
      if (!more) return;
      after = page.next;
    }
  },
};
