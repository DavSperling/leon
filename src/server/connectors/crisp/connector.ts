import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type CrispClient, crispClient } from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { toIso, toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://docs.crisp.chat/references/rest-api/v1/  (enveloppe { error, reason, data } ; Get A Website,
//     List Conversations, Get Messages in Conversation : paramètres, champs, niveaux, codes)
//   https://docs.crisp.chat/guides/rest-api/authentication/ , .../website-token/ , .../plugin-token/
//     (Authorization: Basic base64(identifiant:clé) et X-Crisp-Tier: website ou plugin ; jeton de site :
//     un seul espace, 10 000 requêtes par jour, créé par le propriétaire ; jeton de plugin : place de
//     marché, portées, 5 000 requêtes par jour par défaut)
//   https://docs.crisp.chat/guides/rest-api/rate-limits/ ,  .../quickstart/ ,
//     https://docs.crisp.chat/references/rtm-api/v1/  (exemple de message : horodatage à 13 chiffres)
//   https://github.com/crisp-im/node-crisp-api  (exemple de timestampBefore : 1641206011000)
// Choix qui diffèrent du plan, d'après la doc : seul le jeton de site est pris en charge (en-tête
// X-Crisp-Tier: website) ; le plan laissait le choix. La liste des conversations n'a pas de tri
// documenté (`order_date_updated` ne dit pas son sens) ni de curseur : le connecteur lit des
// fenêtres de sept jours sur `filter_date_start` et `filter_date_end` (relatifs à la date de
// modification), toutes les pages d'une fenêtre, trie lui-même et rend cinquante conversations par
// page. Les messages d'une conversation viennent par lots, du plus récent au plus ancien
// (`timestamp_before`) : on remonte jusqu'à un lot qui n'apporte rien. Seuls les messages de type
// `text` et `note` (contenu en chaîne) sont lus, les notes internes marquées par l'attribut `internalNote`
// du tour ; le côté du tour (`side`) vient du champ `from` du message (`operator` : l'équipe, `user` :
// le visiteur) ; fichiers, sons et événements sont ignorés. Il n'y a pas de ressource secondaire : les messages sont
// le contenu même de la conversation, donc un 403 dessus remonte (sinon le curseur avancerait sur
// des conversations vides). Le texte des messages est pris tel quel, sans htmlToText. Une
// conversation sans message de texte sort sans tours (le socle l'écarte) pour que le curseur avance.
//
// Non vérifié :
//   - l'unité des dates (la doc ne la dit pas ; les exemples ont 13 chiffres : millisecondes) ;
//   - le sens des tris, la taille d'un lot de messages, si les bornes de dates sont incluses (on
//     relit une seconde avant le curseur) ;
//   - la réponse à une page de liste au-delà de la dernière : la doc liste 404 et 416 (Requested Range
//     Not Satisfiable) sans dire quand. Une page pleine est suivie de la page suivante ; une liste
//     vide, un 404 ou un 416 sur une page autre que la première sont pris pour la fin de la liste ;
//   - le code HTTP d'un jeton refusé (`invalid_session` : la doc ne liste aucun 401 et donne 403 et
//     406 pour Get A Website ; 401 et 403 sont traités comme un refus de la clé, un 406 ne l'est pas) ;
//   - les limites par minute d'un jeton de site (non chiffrées dans la doc : 250 ms entre deux
//     requêtes par prudence) et la réponse 420 « Enhance Your Calm », que le client commun ne
//     reprend pas ;
//   - la mise en cache des lectures par Crisp (en-tête Bloom-Status) : une lecture tout juste
//     refaite peut rendre une réponse un peu ancienne ;
//   - le lien vers la boîte de réception (app.crisp.chat/website/<site>/inbox/<session>/) : format
//     connu par l'usage, absent de la doc de l'API ;
//   - l'adresse du visiteur d'un message : seule celle de la fiche de la conversation est connue.

const WINDOW_MS = 7 * 24 * 3600 * 1000;
const OVERLAP_MS = 1000;
const PAGE_SIZE = 50;

const ConfigSchema = z.object({
  websiteId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  identifier: z.string().trim().min(1).max(500),
  key: z.string().trim().min(1).max(500),
});
type Config = z.infer<typeof ConfigSchema>;

// Fenêtre après fenêtre, depuis le curseur (ou since). La dernière, celle qui atteint maintenant,
// n'a pas de borne de fin. Une fenêtre vide fait avancer le départ de la suivante.
async function* syncConversations(
  crisp: CrispClient,
  websiteId: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let mark: Mark = readCursor(state.cursor) ?? { at: state.since.toISOString(), seen: [] };
  for (;;) {
    const from = new Date(Date.parse(mark.at) - OVERLAP_MS);
    const last = from.getTime() + WINDOW_MS > Date.now();
    const until = last ? undefined : new Date(from.getTime() + WINDOW_MS);
    const fresh = (await crisp.conversations(from, until))
      .map((conversation) => ({
        conversation,
        id: conversation.session_id,
        stamp: toIso(conversation.updated_at),
      }))
      .filter((row) => !isDone(mark, row))
      .sort((a, b) => Date.parse(a.stamp) - Date.parse(b.stamp) || a.id.localeCompare(b.id));
    for (let start = 0; start < fresh.length; start += PAGE_SIZE) {
      const items: ConnectorItem[] = [];
      for (const row of fresh.slice(start, start + PAGE_SIZE)) {
        items.push(toItem(row.conversation, await crisp.messages(row.id), websiteId));
        mark = advance(mark, row);
      }
      yield { items, cursor: JSON.stringify(mark) };
    }
    if (until === undefined) return;
    if (fresh.length === 0) mark = { at: until.toISOString(), seen: [] };
  }
}

export const crispConnector: Connector<Config> = {
  id: 'crisp',
  configSchema: ConfigSchema,
  secretFields: ['key', 'identifier'],
  hosts: () => ['api.crisp.chat'],
  minIntervalMs: 250,

  async verify(config: Config, http: ConnectorHttp) {
    return { account: await crispClient(config, http).account() };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncConversations(crispClient(config, http), config.websiteId, state);
  },
};
