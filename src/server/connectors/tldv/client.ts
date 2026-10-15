import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API de tl;dv et la forme des réponses (seulement les champs lus).

const BASE_URL = 'https://pasta.tldv.io/v1alpha1';
const LIST_LIMIT = 100;
// La doc plafonne la liste à 10 000 réunions : 100 pages de 100.
const LIST_PAGES_MAX = 100;

const PersonSchema = z.object({ name: z.string().nullish(), email: z.string().nullish() });
const MeetingSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  // Une date sans fuseau serait lue dans celui du serveur : on la refuse ici plutôt que de décaler.
  happenedAt: z.iso.datetime({ offset: true }),
  url: z.string().nullish(),
  organizer: PersonSchema.nullish(),
  invitees: z.array(PersonSchema).nullish(),
});
const MeetingPageSchema = z.object({
  pages: z.number(),
  total: z.number(),
  results: z.array(MeetingSchema),
});
const TranscriptSchema = z.object({
  data: z.array(
    z.object({ speaker: z.string().nullish(), text: z.string(), startTime: z.number() }),
  ),
});
const NotesSchema = z.object({ markdownContent: z.string().nullish() });

export type Person = z.infer<typeof PersonSchema>;
export type Meeting = z.infer<typeof MeetingSchema>;
export type Segment = z.infer<typeof TranscriptSchema>['data'][number];
// 'pending' : la ressource n'est pas encore prête (ou introuvable) ; 'forbidden' : l'offre de
// l'organisateur de la réunion ne donne pas accès à l'API.
export type Absent = 'pending' | 'forbidden';

// Une ressource secondaire absente ne fait pas échouer le passage : on rend `empty` et la raison.
// Un 401, une limite de débit ou une panne remontent, comme pour la liste.
async function orAbsent<T>(
  read: () => Promise<T>,
  empty: T,
): Promise<{ value: T; absent: Absent | null }> {
  try {
    return { value: await read(), absent: null };
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) {
      return { value: empty, absent: 'forbidden' };
    }
    if (error instanceof ConnectorHttpError && (error.status === 400 || error.status === 404)) {
      return { value: empty, absent: 'pending' };
    }
    throw error;
  }
}

export function createTldvClient(apiKey: string, http: ConnectorHttp) {
  const get = <T>(
    path: string,
    schema: z.ZodType<T>,
    query?: Record<string, string | number | boolean>,
  ) => http.json({ url: `${BASE_URL}${path}`, headers: { 'x-api-key': apiKey }, query }, schema);
  const listPage = (page: number, from?: string, limit = LIST_LIMIT) =>
    get('/meetings', MeetingPageSchema, {
      page,
      limit,
      onlyParticipated: true, // seulement les réunions où la personne de la clé était présente
      ...(from === undefined ? {} : { from }),
    });
  const meetingPath = (id: string) => `/meetings/${encodeURIComponent(id)}`;

  return {
    async countMeetings(): Promise<number> {
      return (await listPage(1, undefined, 1)).total;
    },

    // Toutes les réunions depuis le jour donné (AAAA-MM-JJ) : la doc ne dit rien de l'ordre de la
    // liste, le connecteur la trie lui-même.
    async listMeetings(from: string): Promise<Meeting[]> {
      const meetings: Meeting[] = [];
      for (let page = 1, pages = 1; page <= Math.min(pages, LIST_PAGES_MAX); page++) {
        const data = await listPage(page, from);
        pages = data.pages;
        meetings.push(...data.results);
      }
      return meetings;
    },

    transcript(id: string) {
      const read = async () => (await get(`${meetingPath(id)}/transcript`, TranscriptSchema)).data;
      return orAbsent<Segment[]>(read, []);
    },

    async notes(id: string): Promise<string> {
      const read = async () =>
        (await get(`${meetingPath(id)}/notes`, NotesSchema)).markdownContent ?? '';
      return (await orAbsent(read, '')).value;
    },
  };
}

export type TldvClient = ReturnType<typeof createTldvClient>;
