import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Seulement les champs lus. Les dates de Gong sont de l'ISO 8601 avec fuseau (« +00:00 » ou « Z »).
const date = z.iso.datetime({ offset: true });
const records = z.object({ cursor: z.string().nullish() }).nullish();

const CallSchema = z.object({
  metaData: z.object({
    id: z.string(),
    url: z.string().nullish(),
    title: z.string().nullish(),
    started: date,
  }),
  parties: z
    .array(
      z.object({
        speakerId: z.string().nullish(),
        name: z.string().nullish(),
        emailAddress: z.string().nullish(),
      }),
    )
    .nullish(),
  content: z.object({ brief: z.string().nullish() }).nullish(),
});
export type Call = z.infer<typeof CallSchema>;

// Les champs sont facultatifs : Gong répond 404 avec { requestId, errors } quand rien ne correspond.
const CallsSchema = z.object({ records, calls: z.array(CallSchema).nullish() });

const MonologueSchema = z.object({
  speakerId: z.string().nullish(),
  // start : millisecondes depuis le début de l'appel.
  sentences: z.array(z.object({ start: z.number(), text: z.string() })).nullish(),
});
export type Monologue = z.infer<typeof MonologueSchema>;

const TranscriptsSchema = z.object({
  records,
  callTranscripts: z
    .array(z.object({ callId: z.string(), transcript: z.array(MonologueSchema).nullish() }))
    .nullish(),
});

// Le nombre maximal d'identifiants par requête n'est pas documenté : des lots prudents.
const TRANSCRIPT_BATCH = 50;
const TRANSCRIPT_PAGES_MAX = 10;

export type GongAccess = { baseUrlHost: string; accessKey: string; accessKeySecret: string };

export type CallWindow = {
  from: string; // fromDateTime : inclus
  to: string; // toDateTime : exclu
  cursor?: string | null; // le curseur de page de Gong, avec les mêmes dates
  details: boolean; // participants et résumé
};

export function gongClient(access: GongAccess, http: ConnectorHttp) {
  const base = `https://${access.baseUrlHost}.api.gong.io/v2/calls`;
  const login = Buffer.from(`${access.accessKey}:${access.accessKeySecret}`).toString('base64');
  // 404 : Gong répond ainsi quand aucun appel (ou aucune transcription) ne correspond.
  const post = <T>(path: string, body: unknown, schema: z.ZodType<T>) =>
    http.json(
      {
        url: `${base}${path}`,
        method: 'POST',
        headers: { authorization: `Basic ${login}` },
        body,
        acceptStatus: [404],
      },
      schema,
    );

  async function transcriptBatch(callIds: string[], found: Map<string, Monologue[]>) {
    let cursor: string | undefined;
    for (let page = 0; page < TRANSCRIPT_PAGES_MAX; page++) {
      const answer = await post('/transcript', { filter: { callIds }, cursor }, TranscriptsSchema);
      for (const entry of answer.callTranscripts ?? []) {
        found.set(entry.callId, entry.transcript ?? []);
      }
      cursor = answer.records?.cursor || undefined;
      if (cursor === undefined) return;
    }
  }

  return {
    async listCalls(window: CallWindow): Promise<{ calls: Call[]; next: string | null }> {
      const body = {
        filter: { fromDateTime: window.from, toDateTime: window.to },
        cursor: window.cursor ?? undefined,
        contentSelector: window.details
          ? { exposedFields: { parties: true, content: { brief: true } } }
          : undefined,
      };
      const answer = await post('/extensive', body, CallsSchema);
      return { calls: answer.calls ?? [], next: answer.records?.cursor || null };
    },

    async transcripts(callIds: string[]): Promise<Map<string, Monologue[]>> {
      const found = new Map<string, Monologue[]>();
      for (let from = 0; from < callIds.length; from += TRANSCRIPT_BATCH) {
        await transcriptBatch(callIds.slice(from, from + TRANSCRIPT_BATCH), found);
      }
      return found;
    },
  };
}
