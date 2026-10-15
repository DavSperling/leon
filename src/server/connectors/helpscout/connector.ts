import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, SyncPage, SyncState } from '../types';
import { type Access, helpscoutClient } from './client';
import { apiDate, type Cursor, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.helpscout.com/mailbox-api/overview/authentication/ (flux « Client
//     Credentials » : POST https://api.helpscout.net/v2/oauth2/token avec grant_type, client_id et
//     client_secret ; réponse { token_type, access_token, expires_in: 172800 } ; pas de jeton de
//     renouvellement ; le jeton dure deux jours ; « JSON, formulaire ou paramètres d'adresse au
//     choix sur tous les POST de la page, avec l'en-tête Content-Type qui va avec » ; les
//     identifiants doivent appartenir à un utilisateur actif et invité du compte)
//   https://developer.helpscout.com/mailbox-api/endpoints/conversations/list/ (GET /v2/conversations :
//     modifiedSince « 2018-05-04T12:00:03Z », sortField=modifiedAt, sortOrder=asc, embed=threads,
//     status « active » par défaut, 25 conversations par page, objet `page` avec totalPages)
//   https://developer.helpscout.com/mailbox-api/endpoints/conversations/get/ (objet conversation,
//     dates UTC en ISO 8601 avec Z, `_links.web`)
//   https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/list/ (types de
//     fils : customer, message, note, phone, chat, beaconchat, forwardparent, forwardchild,
//     lineitem ; états : published, draft, hidden, bounced, review)
//   https://developer.helpscout.com/mailbox-api/endpoints/users/me/ (GET /v2/users/me)
//   https://developer.helpscout.com/mailbox-api/overview/rate-limiting/ (429 ; en-têtes
//     X-RateLimit-Limit-Minute, X-RateLimit-Remaining-Minute et X-RateLimit-Retry-After)
//   https://developer.helpscout.com/mailbox-api/changelog/ (23/09/2026 : List Conversations v3)
//   https://docs.helpscout.com/article/1140-mailbox-api (API des plans Standard, Plus et Pro :
//     200, 400 et 800 appels par minute)
//
// Écarts au plan, d'après la doc :
//   - `status=all` est ajouté : sans lui, Help Scout ne rend que les conversations ouvertes, et la
//     plupart des conversations utiles sont fermées. Le pourriel est écarté ici.
//   - La liste v3 (`/v3/conversations`, publiée le 23/09/2026) ne trie plus que du plus récent au
//     plus ancien (`sortField` et `sortOrder` y sont refusés). On reste sur la v2, que la doc ne
//     donne pas pour dépréciée et qui trie par date de modification croissante.
//   - Help Scout n'expose pas la date de modification (`modifiedAt` ne sert qu'au tri et au filtre) :
//     l'élément est daté de la plus récente des dates de la conversation et de ses fils. Le curseur
//     est donc un numéro de page, avec la date « modifiée depuis » du passage ; une fois la dernière
//     page lue, il repart de cinq minutes avant cette lecture (marge pour l'écart d'horloge).
//   - Le tour `document` donne l'état (statut, canal, client, assigné, étiquettes), les fils sont des
//     tours `participant` ; une note interne est marquée par l'attribut `internalNote` du tour, et le
//     côté du tour (`side`) vient du type du fil (voir map.ts). Les changements d'état, brouillons et
//     fils masqués sont écartés ; une conversation sans texte n'est pas rendue.
//   - Il n'y a pas de ressource secondaire (les fils viennent avec la liste) : aucun 403 à attraper.
//   - Un 400 sur la demande de jeton vaut identifiants refusés (norme OAuth 2 : invalid_client).
//   - La limite de débit se signale par X-RateLimit-Retry-After, un en-tête que le client HTTP du
//     socle ne lit pas : après un 429, il attend 2, 4 puis 8 secondes (limite à la minute).
//
// Limites connues : les citations des messages précédents ne sont pas retirées des e-mails. Si une
// conversation déjà lue est modifiée entre deux reprises d'un même passage (au-delà de 200
// éléments), la suivante glisse d'un rang et peut être sautée jusqu'à sa prochaine modification.
//
// Non vérifié (aucune clé réelle) :
//   - que `embed=threads` rend tous les fils d'une conversation (la doc ne dit pas s'ils sont
//     paginés ni tronqués, sauf les fils de chat) ;
//   - que `modifiedSince` et le tri par `modifiedAt` agissent sur la même date, et que
//     `status=all` s'accepte avec `modifiedSince` ;
//   - que le point d'accès de jeton accepte le corps JSON (la doc l'autorise, ses exemples sont en
//     formulaire) et ce qu'il répond à un identifiant refusé (la doc ne le décrit pas) ;
//   - que Help Scout ne limite pas les demandes de jeton (un par passage, soit au plus un toutes les
//     minutes, alors que la doc conseille d'attendre l'expiration du jeton) ;
//   - que `first` et `last` nomment bien les personnes d'une conversation (la doc de l'utilisateur
//     courant écrit `firstName` et `lastName`) ;
//   - la taille d'une page de 25 conversations avec leurs fils (limite du client : 10 Mo).

const ConfigSchema = z.object({
  appId: z.string().trim().min(1).max(200),
  appSecret: z.string().trim().min(1).max(500),
});
type Config = z.infer<typeof ConfigSchema>;

const OVERLAP_MS = 5 * 60_000;

// Pages de l'outil, une SyncPage chacune. La dernière (ou une réponse vide) ramène le curseur à la
// page 1 d'une fenêtre qui commence un peu avant sa lecture.
async function* syncConversations(
  access: Access,
  state: SyncState,
  http: ConnectorHttp,
): AsyncGenerator<SyncPage> {
  const client = await helpscoutClient(access, http);
  const mark = readCursor(state.cursor);
  const since = mark?.since ?? apiDate(state.since);
  for (let page = mark?.page ?? 1; ; page++) {
    const requestedAt = Date.now();
    const { conversations, totalPages } = await client.conversations(since, page);
    const last = conversations.length === 0 || totalPages === null || page >= totalPages;
    const next: Cursor = last
      ? { since: apiDate(new Date(requestedAt - OVERLAP_MS)), page: 1 }
      : { since, page: page + 1 };
    yield {
      items: conversations.flatMap((entry) => toItem(entry) ?? []),
      cursor: JSON.stringify(next),
    };
    if (last) return;
  }
}

function accountOf(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (name && user.email) return `${name} (${user.email})`;
  return name || user.email || 'compte Help Scout';
}

export const helpscoutConnector: Connector<Config> = {
  id: 'helpscout',
  configSchema: ConfigSchema,
  secretFields: ['appSecret'],
  hosts: () => ['api.helpscout.net'],

  async verify(config: Config, http: ConnectorHttp) {
    const client = await helpscoutClient(config, http);
    return { account: accountOf(await client.user()) };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncConversations(config, state, http);
  },
};
