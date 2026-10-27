import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import {
  type Conversation,
  type FreshdeskClient,
  freshdeskClient,
  type Person,
  personOf,
} from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developers.freshdesk.com/api/  (authentification de base, clé:X ; pagination page/per_page
//     et en-tête Link ; liste des tickets : updated_since, order_by, order_type, include ; conversations
//     d'un ticket ; dates en UTC « AAAA-MM-JJTHH:MM:SSZ » ; limites de débit et 429 avec Retry-After ;
//     401 invalid_credentials, 403 access_denied et require_feature)
//   https://support.freshdesk.com/support/solutions/articles/215517-how-to-find-your-api-key
//   https://support.freshdesk.com/support/solutions/articles/225439-what-are-the-rate-limits-for-the-api-calls-to-freshdesk-
// Choix qui diffèrent du plan, d'après la doc : le champ `domain` ne garde que le début de
// l'adresse (« acme »), comme les autres outils à sous-domaine ; la liste des tickets ne rend la
// description qu'avec include=description (comptes créés après le 30/11/2018), qu'on demande avec
// le demandeur (include=requester) ; le curseur est l'instant du dernier ticket et les numéros lus
// à cet instant ; une page de la liste est suivie par l'en-tête Link. Un passage s'arrête à
// 200 tickets (socle) : la limite de 300 pages de Freshdesk n'est jamais atteinte, chaque passage
// repart du curseur. Les conversations (réponses et notes internes) coûtent une requête par ticket
// (Growth : 100 requêtes par minute pour tout le compte) : minIntervalMs ménage ce budget. Les
// notes internes sont marquées par l'attribut `internalNote` du tour. Le côté du tour (`side`) vient
// de l'annuaire des agents (équipe), du demandeur et des autres contacts (extérieurs). Un 403 sur les
// conversations d'un ticket ou sur la liste des agents est attrapé (le ticket sort avec sa seule
// description, ou les auteurs sans nom), de même qu'un 404 sur les conversations (ticket supprimé
// entre la liste et la lecture). Un ticket sans texte sort sans tours (le socle l'écarte) pour que
// le curseur avance.
//
// Non vérifié :
//   - la forme des réponses de GET /agents/me et de GET /agents : la section « Agents » de la doc
//     n'a pas pu être lue en entier (page tronquée par l'outil de lecture) ; les champs `id` et
//     `contact.name|email` viennent de la mémoire de l'API, d'où un schéma tolérant ;
//   - que l'identifiant `user_id` d'une conversation est celui de l'agent (`/agents/{id}`) ou du
//     demandeur : sinon l'auteur ressort par l'adresse de `from_email` seulement ;
//   - si `updated_since` inclut sa borne (on relit une seconde avant le curseur) et si une réponse
//     ou une note change `updated_at` du ticket (sinon elle n'est lue qu'à la prochaine
//     modification du ticket : c'est le point à essayer en premier en réel) ;
//   - que l'en-tête Link est rendu par la liste des tickets, des conversations et des agents (la
//     doc le promet) : sans lui, un passage ne lit que la première page et reprend au curseur ;
//   - si les conversations acceptent per_page (on ne le passe pas : 30 par page) ;
//   - si le texte brut d'une réponse par e-mail contient les messages cités plus haut ;
//   - l'adresse d'un ticket dans l'interface (/a/tickets/<numéro>) et la réponse d'un domaine
//     mal écrit (404 ou redirection : les deux sont traités) ;
//   - la limite de débit réelle : la doc donne des tableaux par minute et par heure qui se
//     contredisent ; l'API est fermée au plan gratuit (0 requête par minute).

const OVERLAP_MS = 1000;

const ConfigSchema = z.object({
  // Un seul sous-domaine : ni point, ni chemin, ni port (l'adresse appelée est fixée par ce champ).
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  apiKey: z.string().trim().min(1).max(500),
});
type Config = z.infer<typeof ConfigSchema>;

// Les conversations d'un ticket : seul un 401 remonte (un 403 ou un ticket disparu les laissent de côté).
async function readConversations(freshdesk: FreshdeskClient, ticketId: number) {
  try {
    return await freshdesk.conversations(ticketId);
  } catch (error) {
    const forbidden = error instanceof ConnectorAuthError && error.status === 403;
    const gone = error instanceof ConnectorHttpError && error.status === 404;
    if (!forbidden && !gone) throw error;
    return [] as Conversation[];
  }
}

async function readAgents(freshdesk: FreshdeskClient): Promise<Map<number, Person>> {
  try {
    return await freshdesk.agents();
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) return new Map();
    throw error;
  }
}

async function* syncTickets(
  freshdesk: FreshdeskClient,
  domain: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let mark: Mark = readCursor(state.cursor) ?? { at: state.since.toISOString(), seen: [] };
  let agents: Map<number, Person> | null = null;
  const from = new Date(Date.parse(mark.at) - OVERLAP_MS);
  for await (const tickets of freshdesk.tickets(from)) {
    const items: ConnectorItem[] = [];
    for (const ticket of tickets) {
      const row = { id: ticket.id, stamp: ticket.updated_at };
      if (!isDone(mark, row)) {
        agents ??= await readAgents(freshdesk);
        const conversations = await readConversations(freshdesk, ticket.id);
        items.push(toItem(domain, ticket, conversations, agents));
      }
      mark = advance(mark, row);
    }
    if (items.length > 0) yield { items, cursor: JSON.stringify(mark) };
  }
}

// Un domaine mal écrit répond 404 ou renvoie vers une page de connexion.
function isUnknownDomain(error: unknown): boolean {
  if (!(error instanceof ConnectorHttpError) || error.status === null) return false;
  return error.status === 404 || (error.status >= 300 && error.status < 400);
}

export const freshdeskConnector: Connector<Config> = {
  id: 'freshdesk',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: (config) => [`${config.domain}.freshdesk.com`],
  minIntervalMs: 1000, // 60 requêtes par minute au plus, sur les 100 du plan Growth

  async verify(config: Config, http: ConnectorHttp) {
    try {
      const me = personOf(await freshdeskClient(config, http).me());
      const who = me.name || me.email;
      return { account: who ? `${who} (${config.domain})` : config.domain };
    } catch (error) {
      if (!isUnknownDomain(error)) throw error;
      throw new ConnectorHttpError(
        (error as ConnectorHttpError).status,
        'Freshdesk domain not found: check the domain name',
      );
    }
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncTickets(freshdeskClient(config, http), config.domain, state);
  },
};
