import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Requêtes à l'API de Claap. Aucun message d'erreur ne reprend le texte rendu par l'outil.
const BASE_URL = 'https://api.claap.io/v1';

// La doc ne donne pas le format des dates : de l'ISO 8601 avec fuseau est supposé. Une autre forme
// fait lever « Unexpected response » plutôt que de décaler les faits dans le temps.
const date = z.iso.datetime({ offset: true });
const person = z.object({ name: z.string().nullish(), email: z.string().nullish() });

const RecordingSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullish(),
  createdAt: date,
  url: z.string().nullish(),
  recorder: person.nullish(),
  meeting: z
    .object({
      startingAt: date,
      participants: z.array(person.extend({ attended: z.boolean().nullish() })).nullish(),
    })
    .nullish(),
  transcripts: z.array(z.unknown()).nullish(), // seul le nombre compte : vide, pas de transcription
});
export type Recording = z.infer<typeof RecordingSchema>;

const ListSchema = z.object({
  result: z.object({
    recordings: z.array(RecordingSchema),
    pagination: z.object({ nextCursor: z.string().nullish() }),
  }),
});

const SegmentSchema = z.object({
  startedAt: z.number(), // en secondes depuis le début (déduit de l'exemple de la doc)
  text: z.string(),
  speaker: z.string().nullish(), // « speaker_1 » : un libellé, jamais un nom
});
export type Segment = z.infer<typeof SegmentSchema>;

// La doc place les phrases sous result.transcript, son exemple directement sous result : les deux
// formes sont lues.
const TranscriptSchema = z.object({
  result: z.union([
    z.object({ transcript: z.object({ segments: z.array(SegmentSchema) }) }),
    z.object({ segments: z.array(SegmentSchema) }),
  ]),
});

const WorkspaceSchema = z.object({
  result: z.object({ workspace: z.object({ name: z.string() }) }),
});

export async function listRecordings(
  http: ConnectorHttp,
  apiKey: string,
  query: { createdAfter: string; limit: number; cursor: string | undefined },
): Promise<{ recordings: Recording[]; next: string | null }> {
  const { result } = await http.json(
    {
      url: `${BASE_URL}/recordings`,
      headers: { 'X-Claap-Key': apiKey },
      query: { sort: 'created_asc', ...query },
    },
    ListSchema,
  );
  return { recordings: result.recordings, next: result.pagination.nextCursor || null };
}

// null : la transcription est introuvable (404) ou interdite à la clé (403). Seul un refus de la
// clé sur la liste ou sur l'espace (401) arrête la relève.
export async function fetchSegments(
  http: ConnectorHttp,
  apiKey: string,
  recordingId: string,
): Promise<Segment[] | null> {
  try {
    const { result } = await http.json(
      {
        url: `${BASE_URL}/recordings/${encodeURIComponent(recordingId)}/transcript`,
        headers: { 'X-Claap-Key': apiKey },
      },
      TranscriptSchema,
    );
    return 'transcript' in result ? result.transcript.segments : result.segments;
  } catch (error) {
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    const forbidden = error instanceof ConnectorAuthError && error.status === 403;
    if (missing || forbidden) return null;
    throw error;
  }
}

export async function fetchWorkspaceName(http: ConnectorHttp, apiKey: string): Promise<string> {
  const { result } = await http.json(
    { url: `${BASE_URL}/workspaces/mine`, headers: { 'X-Claap-Key': apiKey } },
    WorkspaceSchema,
  );
  return result.workspace.name;
}
