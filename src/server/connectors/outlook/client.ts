import type { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';
import { EventsPageSchema, MeSchema, MessagesPageSchema } from './schemas';

// Les requêtes vers Microsoft Graph. Les listes se lisent en ordre croissant de leur date, par pages
// de PAGE_SIZE ; la page suivante est l'adresse `@odata.nextLink`, reprise telle quelle.

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const PAGE_SIZE = 25;
const MESSAGE_FIELDS = 'id,conversationId,subject,receivedDateTime,from,body,webLink';
const EVENT_FIELDS =
  'id,subject,lastModifiedDateTime,start,end,location,organizer,isOrganizer,isCancelled,sensitivity,attendees,body,webLink';

export type Folder = 'inbox' | 'sentitems';
type Page<T> = { value: T[]; '@odata.nextLink'?: string | null | undefined };

// Graph veut AAAA-MM-JJTHH:MM:SSZ : la seconde, sans les millisecondes.
const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

async function* pages<T>(
  http: ConnectorHttp,
  first: HttpRequest,
  schema: z.ZodType<Page<T>>,
): AsyncGenerator<T[]> {
  let request = first;
  for (;;) {
    const page = await http.json(request, schema);
    yield page.value;
    const next = page['@odata.nextLink'];
    if (!next) return;
    request = { url: next, headers: first.headers };
  }
}

export function graphClient({ accessToken }: { accessToken: string }, http: ConnectorHttp) {
  const authorization = `Bearer ${accessToken}`;
  // Le corps en texte, pour les courriers comme pour les descriptions d'événements.
  const headers = { authorization, prefer: 'outlook.body-content-type="text"' };

  return {
    me() {
      const query = { $select: 'id,displayName,mail,userPrincipalName' };
      return http.json({ url: `${GRAPH}/me`, headers: { authorization }, query }, MeSchema);
    },

    // Les messages reçus depuis `from`. Graph exige la même propriété dans le filtre et dans le tri.
    messages(folder: Folder, from: Date) {
      const query = {
        $filter: `receivedDateTime ge ${apiTime(from)}`,
        $orderby: 'receivedDateTime asc',
        $top: PAGE_SIZE,
        $select: MESSAGE_FIELDS,
      };
      const url = `${GRAPH}/me/mailFolders/${folder}/messages`;
      return pages(http, { url, headers, query }, MessagesPageSchema);
    },

    // Les événements modifiés depuis `from` : séries entières, pas leurs occurrences.
    events(from: Date) {
      const query = {
        $filter: `lastModifiedDateTime ge ${apiTime(from)}`,
        $orderby: 'lastModifiedDateTime asc',
        $top: PAGE_SIZE,
        $select: EVENT_FIELDS,
      };
      return pages(http, { url: `${GRAPH}/me/events`, headers, query }, EventsPageSchema);
    },
  };
}

export type GraphClient = ReturnType<typeof graphClient>;
