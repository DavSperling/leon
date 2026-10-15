import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, SyncPage, SyncState } from '../types';
import { type FrontClient, frontClient } from './client';
import { advance, afterOf, isSeen, readCursor } from './cursor';
import { readItems } from './read';

// Doc lue le 15/10/2026 :
//   https://dev.frontapp.com/reference/introduction  (base https://api2.frontapp.com, dates en
//     secondes depuis 1970 avec des décimales)
//   https://dev.frontapp.com/docs/authentication  (jeton d'API en « Authorization: Bearer »)
//   https://dev.frontapp.com/docs/create-and-revoke-api-tokens  (jeton créé par un administrateur :
//     Settings > Developers > API tokens ; ressources globales, partagées ou privées ; Read, Write…)
//   https://dev.frontapp.com/docs/rate-limiting  (50, 100 ou 200 requêtes par minute et par
//     entreprise selon le forfait, 429 avec Retry-After, x-ratelimit-reset)
//   https://dev.frontapp.com/reference/list-events et /reference/events  (GET /events, filtre
//     q[after], q[before], q[types], q[inboxes] sur la date d'émission, tri sur la date de création,
//     sort_order asc|desc, types inbound, outbound, out_reply, comment…)
//   https://dev.frontapp.com/reference/list-conversation-messages et /list-conversation-comments
//   https://dev.frontapp.com/reference/api-token-details  (GET /me : l'entreprise du jeton)
//   https://dev.frontapp.com/reference/conversations  (ouvrir une conversation :
//     https://app.frontapp.com/open/<identifiant>)
//   https://community.front.com/developer-q-a-37/list-events-q-parameter-119  (q[types] se répète :
//     q[types]=tag&q[types]=inbound)
// Choix qui diffèrent du plan ou que la doc impose :
//   - Les événements sont rendus du plus récent au plus ancien : on demande sort_order=asc. Leur
//     page est de 15 au plus (limit), alors que la page « pagination » parle de 100.
//   - L'adresse de la page suivante (`_pagination.next`) est sur le sous-domaine de l'entreprise,
//     que le client HTTP refuse : on en garde le chemin et la requête, sur api2.frontapp.com (la doc
//     dit que cet hôte marche toujours).
//   - Un message reçu n'a pas d'auteur : l'expéditeur est le destinataire de rôle « from ». Les
//     brouillons (`draft_mode`) sont laissés de côté.
//   - Une conversation est un fil sans corps à part : chaque message est un tour `participant`,
//     daté de son envoi ; chaque commentaire de l'équipe, une note interne (attribut `internalNote`
//     du tour). Le côté du tour (`side`) : un `author` fait un tour de l'équipe, un message reçu
//     (`is_inbound`) un tour extérieur. Messages et commentaires sont rendus du plus récent au plus
//     ancien : on les trie.
//   - Le curseur est celui des événements (voir cursor.ts) : une conversation touchée est relue en
//     entier (tous ses messages), au plus une fois par passage tant que rien de nouveau ne la touche.
//   - La boîte (inbox) n'est pas lue : un événement ne la donne que pour un message reçu, et la
//     chercher coûterait une requête de plus par conversation (50 par minute au plus bas forfait).
//     `origin` est donc vide.
//   - Une conversation refusée (403 : boîte hors de la portée du jeton), introuvable (404) ou
//     fusionnée dans une autre (301) est laissée de côté ; un 403 sur les commentaires laisse la
//     conversation sans ses notes. Seul un 401, ou un 403 sur la liste des événements, remonte.
//
// Non vérifié :
//   - sort_order=asc avec q[after] et la reprise par page_token (la doc ne l'illustre pas, et montre
//     une adresse suivante réduite à page_token : on compte sur le jeton pour garder filtres et
//     tri) ; si Front rendait les événements du plus récent au plus ancien, le curseur sauterait
//     les plus anciens ;
//   - si q[after] inclut sa borne, et le décalage entre date d'émission et date de création (d'où le
//     chevauchement de deux secondes) ;
//   - que les crochets de q[after] et q[types], envoyés encodés (%5B, %5D), sont lus par Front ;
//   - les droits que demande GET /me, la pagination des commentaires (non documentée) et les
//     boîtes personnelles (ressources privées, accès par API à activer par chacun) ;
//   - les e-mails de réponse citent les messages précédents : le texte est répété d'un message à
//     l'autre (Front ne donne pas de version sans citation) ;
//   - l'effet d'une fusion de conversations (événement conversations_merged, non lu) et la durée
//     pendant laquelle Front garde ses événements.

const ConfigSchema = z.object({ token: z.string().trim().min(1).max(4000) });
type Config = z.infer<typeof ConfigSchema>;

// Une page par page d'événements. Une page qui n'apporte que des événements déjà lus ne rend rien :
// un passage au calme coûte une requête.
async function* syncEvents(front: FrontClient, state: SyncState): AsyncGenerator<SyncPage> {
  let mark = readCursor(state.cursor) ?? { at: state.since.getTime(), seen: [] };
  const readAt = new Map<string, number>();
  let page = await front.firstEvents(afterOf(mark));
  for (;;) {
    const fresh = page.results.filter((event) => !isSeen(mark, event.id));
    if (fresh.length > 0) {
      const items = await readItems(front, fresh, readAt);
      mark = advance(
        mark,
        fresh.map((event) => ({ id: event.id, ms: Math.round(event.emitted_at * 1000) })),
      );
      yield { items, cursor: JSON.stringify(mark) };
    }
    if (page.next === null) return;
    page = await front.nextEvents(page.next);
  }
}

export const frontConnector: Connector<Config> = {
  id: 'front',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api2.frontapp.com'],
  minIntervalMs: 1500, // 50 requêtes par minute au plus bas forfait, comptées par entreprise

  async verify(config: Config, http: ConnectorHttp) {
    const front = frontClient(config.token, http);
    const account = await front.company();
    await front.probe();
    return { account };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncEvents(frontClient(config.token, http), state);
  },
};
