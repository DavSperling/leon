import type { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';
import {
  ChannelsSchema,
  ChatsSchema,
  EventsSchema,
  JoinedTeamsSchema,
  MeetingsSchema,
  MembersSchema,
  MeSchema,
  MessagesSchema,
  RootsSchema,
  TeamSchema,
  TranscriptsSchema,
} from './schemas';

// Les requêtes vers Microsoft Graph. Doc lue le 05/11/2026 et le 27/11/2026 (voir connector.ts). Une page suivante
// est l'adresse `@odata.nextLink` rendue par Graph, reprise telle quelle.

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const PAGE_SIZE = 50; // le maximum de Graph pour les messages
const EVENT_FIELDS =
  'subject,isCancelled,sensitivity,onlineMeetingProvider,onlineMeeting,webLink,organizer,attendees';

// Graph veut AAAA-MM-JJTHH:MM:SSZ : la seconde, sans les millisecondes.
const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const path = (id: string) => encodeURIComponent(id);

export function teamsClient({ accessToken }: { accessToken: string }, http: ConnectorHttp) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const get = (url: string, query?: HttpRequest['query']): HttpRequest => ({ url, headers, query });

  // Toutes les pages d'une liste courte (équipes, canaux, conversations).
  async function all<T>(
    first: HttpRequest,
    schema: z.ZodType<{ value: T[]; '@odata.nextLink'?: string | null }>,
  ) {
    const rows: T[] = [];
    let request: HttpRequest | null = first;
    while (request) {
      const page: { value: T[]; '@odata.nextLink'?: string | null } = await http.json(
        request,
        schema,
      );
      rows.push(...page.value);
      const next = page['@odata.nextLink'];
      request = next ? { url: next, headers: first.headers } : null;
    }
    return rows;
  }

  return {
    me() {
      const query = { $select: 'id,displayName,mail,userPrincipalName' };
      return http.json(get(`${GRAPH}/me`, query), MeSchema);
    },

    // Seuls id, displayName, description, isArchived et tenantId y sont remplis : la visibilité se lit à part.
    teams: () => all(get(`${GRAPH}/me/joinedTeams`), JoinedTeamsSchema),

    // Les équipes de la personne, et celles qui hébergent un canal partagé dont elle est membre directe.
    associatedTeams: () => all(get(`${GRAPH}/me/teamwork/associatedTeams`), JoinedTeamsSchema),

    async visibility(teamId: string): Promise<string | null> {
      const team = await http.json(
        get(`${GRAPH}/teams/${path(teamId)}`, { $select: 'visibility' }),
        TeamSchema,
      );
      return team.visibility ?? null;
    },

    // Les canaux de l'équipe que la personne voit, et ceux partagés avec l'équipe. Sans cet en-tête, un canal partagé
    // arrive comme « unknownFutureValue ».
    allChannels: (teamId: string) =>
      all(
        {
          url: `${GRAPH}/teams/${path(teamId)}/allChannels`,
          headers: { ...headers, prefer: 'include-unknown-enum-members' },
        },
        ChannelsSchema,
      ),

    // Tous les membres d'un canal, ceux d'une équipe avec qui il est partagé compris.
    channelMembers: (teamId: string, channelId: string) =>
      all(
        get(`${GRAPH}/teams/${path(teamId)}/channels/${path(channelId)}/allMembers`),
        MembersSchema,
      ),

    chats: () =>
      all(get(`${GRAPH}/me/chats`, { $top: PAGE_SIZE, $expand: 'members' }), ChatsSchema),

    // Tous les membres d'une conversation, avec le début de l'historique de chacun.
    chatMembers: (chatId: string) =>
      all(get(`${GRAPH}/chats/${path(chatId)}/members`), MembersSchema),

    // Les messages d'un canal avec leurs réponses, du fil le plus récemment animé au moins récent.
    roots(link: string | null, teamId: string, channelId: string) {
      const first = `${GRAPH}/teams/${path(teamId)}/channels/${path(channelId)}/messages`;
      const request = link ? get(link) : get(first, { $top: PAGE_SIZE, $expand: 'replies' });
      return http.json(request, RootsSchema);
    },

    replies: (link: string) => http.json(get(link), MessagesSchema),

    // Les messages d'une conversation changés après `after`, du plus récent au moins récent. Graph n'applique le
    // filtre que si $orderby porte sur la même propriété.
    chatMessages(link: string | null, chatId: string, after: Date) {
      const first = `${GRAPH}/chats/${path(chatId)}/messages`;
      const query = {
        $top: PAGE_SIZE,
        $orderby: 'lastModifiedDateTime desc',
        $filter: `lastModifiedDateTime gt ${apiTime(after)}`,
      };
      return http.json(link ? get(link) : get(first, query), MessagesSchema);
    },

    // L'agenda entre deux instants, chaque occurrence d'une série comprise. Sans en-tête Prefer, Graph rend l'UTC.
    events(link: string | null, start: Date, end: Date) {
      const query = {
        startDateTime: apiTime(start),
        endDateTime: apiTime(end),
        $select: EVENT_FIELDS,
        $top: PAGE_SIZE,
      };
      return http.json(link ? get(link) : get(`${GRAPH}/me/calendarView`, query), EventsSchema);
    },

    // La réunion Teams d'un lien de participation, ou null. Le lien va encodé dans le filtre (query l'encode).
    async meetingId(joinUrl: string): Promise<string | null> {
      const filter = `JoinWebUrl eq '${joinUrl.replaceAll("'", "''")}'`;
      const request = get(`${GRAPH}/me/onlineMeetings`, { $filter: filter });
      return (await http.json(request, MeetingsSchema)).value[0]?.id ?? null;
    },

    transcripts: (meetingId: string) =>
      all(get(`${GRAPH}/me/onlineMeetings/${path(meetingId)}/transcripts`), TranscriptsSchema),

    // Le texte d'une transcription, dans le format `accept` (voir connector.ts).
    async transcript(meetingId: string, transcriptId: string, accept: string): Promise<string> {
      const url = `${GRAPH}/me/onlineMeetings/${path(meetingId)}/transcripts/${path(transcriptId)}/content`;
      return (await http.text({ url, headers: { ...headers, accept } })).text;
    },
  };
}

export type TeamsClient = ReturnType<typeof teamsClient>;
