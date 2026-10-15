import { z } from 'zod';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
} from '../http';

// Les requêtes vers l'API de Circleback et la forme des réponses (seulement les champs lus).

export const HOST = 'circleback.ai';
const BASE_URL = `https://${HOST}/api`;

// Dates au format « date-time » de la doc (« 2023-07-25T20:30:57.926Z »), avec fuseau explicite.
const DateTime = z.iso.datetime({ offset: true });

const MeetingSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  createdAt: DateTime,
  updatedAt: DateTime,
  notes: z.string().nullable(), // résumé en Markdown, écrit par l'outil
  attendees: z.array(z.object({ name: z.string().nullable(), email: z.string().nullable() })),
});
export type Meeting = z.infer<typeof MeetingSchema>;

const SegmentSchema = z.object({
  speaker: z.string().nullable(),
  text: z.string(),
  // Secondes depuis le début ; au-delà de onze jours la donnée est fausse (Date la refuserait).
  timestamp: z.number().min(0).max(1_000_000),
});
export type Segment = z.infer<typeof SegmentSchema>;

const authorization = (apiKey: string) => ({ authorization: `Bearer ${apiKey}` });

// Un appel léger, juste pour savoir si la clé est acceptée.
export async function checkKey(http: ConnectorHttp, apiKey: string): Promise<void> {
  await http.json(
    { url: `${BASE_URL}/people`, query: { limit: 1 }, headers: authorization(apiKey) },
    z.array(z.object({ id: z.number() })),
  );
}

// Les réunions de l'utilisateur, une page de la liste à la fois, dans l'ordre de l'API (la doc
// n'en promet aucun). L'adresse de la page suivante vient de l'en-tête Link, telle quelle.
export async function* meetingPages(
  http: ConnectorHttp,
  apiKey: string,
): AsyncGenerator<Meeting[]> {
  let request: HttpRequest | null = {
    url: `${BASE_URL}/meetings`,
    query: { ownership: 'Mine' },
    headers: authorization(apiKey),
  };
  while (request) {
    const page: { data: Meeting[]; nextUrl: string | null } = await http.page(
      request,
      z.array(MeetingSchema),
    );
    yield page.data;
    request = page.nextUrl === null ? null : { url: page.nextUrl, headers: authorization(apiKey) };
  }
}

// Refusée (403) ou disparue (404) : la réunion sort sans transcription, comme si elle était vide.
// Un 401 remonte : la clé est refusée.
export async function fetchTranscript(
  http: ConnectorHttp,
  apiKey: string,
  meetingId: string,
): Promise<Segment[]> {
  const url = `${BASE_URL}/meeting/${encodeURIComponent(meetingId)}/transcript`;
  try {
    return await http.json({ url, headers: authorization(apiKey) }, z.array(SegmentSchema));
  } catch (error) {
    const forbidden = error instanceof ConnectorAuthError && error.status === 403;
    const gone = error instanceof ConnectorHttpError && error.status === 404;
    if (forbidden || gone) return [];
    throw error;
  }
}
