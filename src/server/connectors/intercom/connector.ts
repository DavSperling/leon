import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, SyncPage, SyncState } from '../types';
import { type Conversation, type IntercomClient, intercomClient } from './client';
import { advance, isDone, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developers.intercom.com/docs/references/2.14/rest-api/api.intercom.io/conversations/searchconversations
//     (POST /conversations/search : query {field, operator, value}, « > » = supérieur ou égal, dates en
//     secondes depuis 1970, pagination {per_page 150 au plus, starting_after}, pages.next.starting_after,
//     champs source et statistics ; aucune partie dans la réponse)
//   https://developers.intercom.com/docs/references/2.14/rest-api/api.intercom.io/conversations/retrieveconversation
//     (GET /conversations/{id} : conversation_parts, 500 parties au plus, les plus récentes ; teammates)
//   https://developers.intercom.com/docs/references/2.4/rest-api/conversations/conversation-model
//     (types de parties : comment, note, note_and_reopen, assignment, open, close… ; author {type, id})
//   https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/pagination (tri des
//     recherches : sort {field, order: ascending|descending} ; curseur « stateless » ; fin = pas de `next`)
//   https://developers.intercom.com/docs/references/2.14/rest-api/api.intercom.io/admins/identifyadmin (GET /me)
//   https://developers.intercom.com/docs/build-an-integration/getting-started (jeton d'accès d'une appli
//     privée, page Authentication du Developer Hub) et https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/oauth-scopes
//     (permission « Read conversations »)
//   https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis (hôtes par région :
//     api.intercom.io, api.eu.intercom.io, api.au.intercom.io ; api.intercom.io route vers la bonne région)
//   https://developers.intercom.com/docs/references/rest-api/errors/rate-limiting (10 000 requêtes par
//     minute par appli, 25 000 par espace ; 429 ; X-RateLimit-Reset en secondes depuis 1970)
//   https://developers.intercom.com/docs/references/rest-api/api.intercom.io/Models/intercom_version
//     (en-tête Intercom-Version : valeurs de 1.0 à 2.17)
//
// Écarts au plan, d'après la doc :
// - La recherche ne rend ni messages ni notes : une requête de détail par conversation, après la
//   recherche. Elle rend le premier message (`source`) ; les parties du détail, les suivants.
// - Un message est un tour participant daté de sa propre date (pas de tour document : un message
//   envoyé ne change plus). Une note interne est un tour de l'équipe, marqué par l'attribut
//   `internalNote`. L'auteur porte son côté (« Claire Dubois (client) »), et le tour son attribut `side`
//   (client : extérieur, administrateur ou équipe : l'équipe), pour que le pipeline sache qui s'engage.
// - Le détail ne rend que les 500 dernières parties : une conversation plus longue perd ses débuts.
// - Une conversation sans texte (appel, pièce jointe seule) sort sans tours, que le socle écarte :
//   le curseur avance quand même.
// - Pas de lien vers l'original (`url` nul) : la doc de l'API n'en donne pas. Une réponse de la
//   communauté Intercom cite https://app.intercom.com/a/inbox/<id de l'appli>/inbox/shared/all/conversation/<numéro>
//   (l'identifiant de l'appli est `app.id_code` de GET /me), sans que ce soit documenté : à essayer en réel.
// - Un 403 ou un 404 sur le détail laisse la conversation avec son seul premier message. `verify`
//   essaie la recherche pour refuser dès le test un jeton sans la permission de lire les conversations,
//   et se contente de « Intercom » si GET /me est refusé (la doc ne dit pas quelle permission il faut).
//
// Non vérifié (aucune clé réelle) :
//   - que la recherche accepte `sort` pour les conversations (la doc générale des recherches le prévoit ;
//     celle des conversations n'en parle pas) : sans tri, la reprise par curseur pourrait manquer des
//     conversations ;
//   - que « > » inclut la borne (la doc le dit ; on relit une seconde avant le curseur et on écarte ce
//     qui est déjà lu : juste dans les deux cas) ;
//   - que `author` figure sur chaque partie, avec nom et e-mail (la doc 2.14 ne le liste pas, celle de
//     la 2.4 donne {type, id}) : sans nom, l'équipier est cherché dans `teammates`, sinon « Équipe » ;
//   - que `pages.next` manque à la dernière page (la doc le suggère sans le dire) ;
//   - le comportement d'une conversation modifiée entre deux pages de la recherche (curseur sans état) ;
//   - quelle permission exige GET /me.

const REGIONS = ['api.intercom.io', 'api.eu.intercom.io', 'api.au.intercom.io'] as const;

const ConfigSchema = z.object({
  token: z.string().trim().min(1).max(500),
  region: z.enum(REGIONS),
});
type Config = z.infer<typeof ConfigSchema>;

// Un 403 (hors de portée) ou un 404 (supprimée entre-temps) sur le détail ne perd que les messages
// suivants : le premier est déjà dans la recherche. Seul un 401 remonte.
async function readDetail(intercom: IntercomClient, id: string): Promise<Conversation | null> {
  try {
    return await intercom.conversation(id);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    if (denied || (error instanceof ConnectorHttpError && error.status === 404)) return null;
    throw error;
  }
}

async function* syncConversations(
  intercom: IntercomClient,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const resumed = readCursor(state.cursor);
  const since = Math.floor(state.since.getTime() / 1000);
  let mark = resumed ?? { at: since, seen: [] };
  const from = resumed ? resumed.at - 1 : since;
  let after: string | undefined;
  for (;;) {
    const { conversations, next } = await intercom.search(from, after);
    const fresh = conversations
      .filter((row) => !isDone(mark, row))
      .sort(
        (a, b) => a.updated_at - b.updated_at || a.id.localeCompare(b.id, 'en', { numeric: true }),
      );
    if (fresh.length > 0) {
      const items = [];
      for (const row of fresh) {
        items.push(toItem(row, await readDetail(intercom, row.id)));
        mark = advance(mark, row);
      }
      yield { items, cursor: JSON.stringify(mark) };
    }
    // Un curseur qui revient à l'identique : la recherche tourne en rond.
    if (!next || next === after) return;
    after = next;
  }
}

export const intercomConnector: Connector<Config> = {
  id: 'intercom',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: (config: Config) => [config.region],

  async verify(config: Config, http: ConnectorHttp) {
    const intercom = intercomClient(config, http);
    const admin = await intercom.me().catch((error: unknown) => {
      if (error instanceof ConnectorAuthError && error.status === 403) return null;
      throw error;
    });
    await intercom.search(Math.floor(Date.now() / 1000), undefined, 1);
    if (!admin?.name) return { account: 'Intercom' };
    return { account: admin.workspace ? `${admin.name} (${admin.workspace})` : admin.name };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncConversations(intercomClient(config, http), state);
  },
};
