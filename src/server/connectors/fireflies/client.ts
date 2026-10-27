import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Requêtes GraphQL de Fireflies : aucun message d'erreur ne reprend le texte rendu par l'outil.
const LABEL = PROVIDER_LABELS.fireflies;
const ENDPOINT = 'https://api.fireflies.ai/graphql';
export const LIST_LIMIT = 50; // maximum par requête, d'après la doc

const USER_QUERY = 'query { user { name email } }';
const LIST_QUERY = `query Transcripts($fromDate: DateTime, $limit: Int, $skip: Int) {
  transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) { id date }
}`;
const DETAIL_QUERY = `query Transcript($id: String!) {
  transcript(id: $id) {
    title transcript_url organizer_email participants
    meeting_attendees { displayName name email }
    meeting_info { summary_status }
    summary { overview short_summary gist action_items }
    sentences { index speaker_name text start_time }
  }
}`;

const text = z.string().nullish();
// Les listes GraphQL peuvent porter des éléments nuls : ils disparaissent à la lecture.
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item.nullable())
    .nullish()
    .transform((items) => (items ?? []).filter((one): one is z.infer<T> => one !== null));

const userData = z.object({ user: z.object({ name: text, email: text }).nullish() });
const listData = z.object({
  transcripts: list(z.object({ id: z.string(), date: z.number().nullish() })),
});
const transcriptSchema = z.object({
  title: text,
  transcript_url: text,
  organizer_email: text,
  participants: list(z.string()),
  meeting_attendees: list(z.object({ displayName: text, name: text, email: text })),
  meeting_info: z.object({ summary_status: text }).nullish(),
  summary: z
    .object({ overview: text, short_summary: text, gist: text, action_items: text })
    .nullish(),
  sentences: list(
    z.object({
      index: z.number().nullish(),
      speaker_name: text,
      text,
      // Typé String dans la doc : on accepte un nombre ou un texte (secondes).
      start_time: z.union([z.number(), z.string()]).nullish(),
    }),
  ),
});
export type Transcript = z.infer<typeof transcriptSchema>;
const detailData = z.object({ transcript: transcriptSchema.nullish() });

const gqlError = z.object({
  code: text,
  extensions: z.object({ code: text, status: z.number().nullish() }).nullish(),
});

// Statut des codes d'erreur qui comptent ; pour les autres, la doc met le statut dans extensions.
const CODE_STATUS: Record<string, number> = {
  auth_failed: 401,
  forbidden: 403,
  object_not_found: 404,
  too_many_requests: 429,
};

function refusal(error: z.infer<typeof gqlError>): Error {
  const code = error.extensions?.code ?? error.code ?? '';
  const status = CODE_STATUS[code] ?? error.extensions?.status ?? null;
  if (status === 401 || status === 403) return new ConnectorAuthError(LABEL, status);
  if (status === 429) return new ConnectorHttpError(429, `${LABEL} rate limit reached`);
  return new ConnectorHttpError(status, `${LABEL} rejected the request`);
}

// Fireflies peut rendre une erreur avec un code 200 : elle est convertie ici.
async function graphql<T>(
  http: ConnectorHttp,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  data: z.ZodType<T>,
): Promise<T> {
  const schema = z.object({ data: data.nullish(), errors: z.array(gqlError).nullish() });
  const answer = await http.json(
    {
      url: ENDPOINT,
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { query, variables },
    },
    schema,
  );
  const error = answer.errors?.[0];
  if (error) throw refusal(error);
  if (answer.data == null) throw new ConnectorHttpError(200, 'Unexpected response');
  return answer.data;
}

export async function fetchAccount(http: ConnectorHttp, apiKey: string): Promise<string> {
  const { user } = await graphql(http, apiKey, USER_QUERY, {}, userData);
  if (!user) throw new ConnectorHttpError(200, 'Unexpected response');
  const name = user.name?.trim();
  const email = user.email?.trim();
  return name && email ? `${name} (${email})` : name || email || LABEL;
}

// Les réunions créées depuis `from` : identifiant et date de début (millisecondes depuis 1970).
// La doc ne dit pas dans quel ordre la liste arrive : le tri se fait chez l'appelant.
export async function listTranscripts(
  http: ConnectorHttp,
  apiKey: string,
  from: Date,
): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const known = new Set<string>();
  for (let skip = 0; ; skip += LIST_LIMIT) {
    const variables = { fromDate: from.toISOString(), limit: LIST_LIMIT, skip };
    const { transcripts } = await graphql(http, apiKey, LIST_QUERY, variables, listData);
    const fresh = transcripts.filter((row) => !known.has(row.id));
    for (const row of fresh) {
      known.add(row.id);
      if (typeof row.date === 'number' && row.date >= from.getTime()) found.set(row.id, row.date);
    }
    if (transcripts.length < LIST_LIMIT || fresh.length === 0) return found;
  }
}

// null si la réunion a disparu (404) ou si la clé n'y a pas droit (403) : la relève continue sans elle.
// Un 401 remonte, c'est la clé qui est refusée.
export async function fetchTranscript(
  http: ConnectorHttp,
  apiKey: string,
  id: string,
): Promise<Transcript | null> {
  try {
    const { transcript } = await graphql(http, apiKey, DETAIL_QUERY, { id }, detailData);
    return transcript ?? null;
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return null;
    if (error instanceof ConnectorAuthError && error.status === 403) return null;
    throw error;
  }
}
