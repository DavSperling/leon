import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type Ticket, type TicketComments, type ZendeskClient, zendeskClient } from './client';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/
//     (GET /api/v2/incremental/tickets/cursor : start_time au premier appel, cursor ensuite,
//     per_page, end_of_stream, after_cursor ; réservé aux administrateurs ; 10 requêtes par minute ;
//     start_time au moins une minute dans le passé) et la spécification OpenAPI
//     https://developer.zendesk.com/zendesk/oas.yaml (champs des tickets et des commentaires)
//   https://developer.zendesk.com/documentation/api-basics/working-with-data/using-the-incremental-export-api/
//     (les tickets supprimés restent dans le flux, avec le statut « deleted »)
//   https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/ (GET
//     /api/v2/tickets/{id}/comments : include=users, page[size] jusqu'à 100, sort=created_at,
//     plain_body, public faux pour une note interne)
//   https://developer.zendesk.com/api-reference/introduction/pagination/ (meta.has_more, links.next)
//   https://developer.zendesk.com/api-reference/introduction/security-and-auth/ (authentification
//     « Basic » : base64 de « e-mail/token:jeton »)
//   https://developer.zendesk.com/api-reference/introduction/rate-limits/ (429 avec Retry-After)
// Écarts au plan, d'après la doc :
// - Le plan dit « per_page=100 » : la doc l'admet (jusqu'à 1 000) ; Leon le fixe à 100.
// - La doc se contredit sur les tickets supprimés : la référence cite un paramètre `exclude_deleted`,
//   le guide dit qu'il n'existe pas. On ne l'envoie pas : un ticket au statut « deleted » est écarté
//   ici (son curseur avance quand même).
// - Le tour `document` est l'état du ticket (objet, statut, priorité, type, étiquettes), signé par
//   celui qui l'a créé (`submitter_id`, auteur du premier commentaire d'après la doc). Le texte de
//   la demande est le premier commentaire, repris comme les autres. Une note interne (`public` faux)
//   est marquée par l'attribut `internalNote` du tour, jamais dans le texte. Le côté de chaque tour
//   (`side`) vient du rôle du compte (`end-user` : extérieur ; `agent`, `admin` : l'équipe).
// - Le curseur du socle est le `after_cursor` de Zendesk, tel quel. Les tickets modifiés par le
//   système seul (déclencheurs) reviennent aussi : leurs tours sont inchangés, le socle les ignore.
// - Pas de `minIntervalMs` : il espacerait aussi les lectures de commentaires (un appel par ticket).
//   Un passage n'appelle l'export que deux ou trois fois ; le client attend `Retry-After` sur 429.
// Un 403 sur les commentaires d'un ticket est attrapé : le ticket sort avec son seul état, sans auteur.
//
// Non vérifié (aucune clé réelle) : combien de temps un curseur d'export reste valable (la doc ne le
// dit pas ; l'exemple de la doc se décode en « 1576613539.0||467| », une position et non une session) ;
// que `GET /users/me` rend 401 (et non l'utilisateur anonyme) pour un jeton faux ; que `links.next`
// des commentaires garde `include=users` ; que le lien `/agent/tickets/<id>` ouvre le ticket ; que
// l'export sans `support_type_scope` (défaut « agent ») couvre les tickets voulus ; si un rôle
// personnalisé autre qu'administrateur peut lire l'export ; la limite de débit du compte pour un
// passage de 200 tickets (un appel de commentaires par ticket : 10 par minute sur l'ancien plan Essential).

const ConfigSchema = z.object({
  // Un seul sous-domaine : ni point, ni chemin, ni port (l'adresse appelée est fixée par ce champ).
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  email: z.string().trim().max(320).pipe(z.email()),
  apiToken: z.string().trim().min(1).max(500),
});
type Config = z.infer<typeof ConfigSchema>;

const NO_COMMENTS: TicketComments = { comments: [], users: new Map() };

async function readTicket(
  zendesk: ZendeskClient,
  subdomain: string,
  ticket: Ticket,
): Promise<ConnectorItem> {
  try {
    return toItem(subdomain, ticket, await zendesk.comments(ticket.id));
  } catch (error) {
    if (!(error instanceof ConnectorAuthError) || error.status !== 403) throw error;
    return toItem(subdomain, ticket, NO_COMMENTS);
  }
}

// Une page de l'export donne une page du socle, même vide (tickets supprimés, rien de neuf) : le
// curseur est enregistré, et le prochain passage ne relit pas ce qui a déjà été vu.
async function* syncTickets(
  zendesk: ZendeskClient,
  subdomain: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let cursor = state.cursor;
  for (;;) {
    const page = await zendesk.exportPage(cursor, state.since);
    if (!page.after_cursor) return;
    const items: ConnectorItem[] = [];
    for (const ticket of page.tickets) {
      if (ticket.status !== 'deleted') items.push(await readTicket(zendesk, subdomain, ticket));
    }
    yield { items, cursor: page.after_cursor };
    if (page.end_of_stream || page.after_cursor === cursor) return;
    cursor = page.after_cursor;
  }
}

// Un sous-domaine inconnu répond 404 ou renvoie vers un autre site.
function isUnknownSubdomain(error: unknown): boolean {
  if (!(error instanceof ConnectorHttpError) || error.status === null) return false;
  return error.status === 404 || (error.status >= 300 && error.status < 400);
}

export const zendeskConnector: Connector<Config> = {
  id: 'zendesk',
  configSchema: ConfigSchema,
  secretFields: ['apiToken'],
  hosts: (config) => [`${config.subdomain}.zendesk.com`],

  async verify(config: Config, http: ConnectorHttp) {
    try {
      const { user } = await zendeskClient(config, http).me();
      return { account: `${user.name || user.email || config.email} (${config.subdomain})` };
    } catch (error) {
      if (!isUnknownSubdomain(error)) throw error;
      throw new ConnectorHttpError(
        (error as ConnectorHttpError).status,
        'Zendesk subdomain not found: check the subdomain name',
      );
    }
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncTickets(zendeskClient(config, http), config.subdomain, state);
  },
};
