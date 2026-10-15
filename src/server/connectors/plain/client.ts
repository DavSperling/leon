import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import { toFilterDate } from './cursor';
import {
  ACCOUNT_QUERY,
  type PlainEntry,
  type PlainThread,
  pageInfo,
  THREADS_QUERY,
  TIMELINE_QUERY,
  thread,
  timelineNode,
} from './queries';

// Les requêtes vers Plain (GraphQL) et la lecture de leurs réponses.

const LABEL = PROVIDER_LABELS.plain;
const ENDPOINT = 'https://core-api.uk.plain.com/graphql/v1';

const THREADS_PAGE_SIZE = 25;
const ENTRIES_PAGE_SIZE = 50;

// Seul le code des erreurs est lu, jamais leur texte : il peut citer la requête.
const apiError = z.object({ extensions: z.object({ code: z.string().optional() }).optional() });
const answer = z.object({ data: z.unknown().optional(), errors: z.array(apiError).optional() });

// Codes de la doc « Error handling » (UNAUTHENTICATED, FORBIDDEN, INTERNAL_SERVER_ERROR) et de
// l'aide « Rate limits » (RATE_LIMITED), comparés sans tirets bas ni casse.
function failure(errors: z.infer<typeof apiError>[]): Error {
  const codes = errors.map((error) =>
    (error.extensions?.code ?? '').toUpperCase().replace(/_/g, ''),
  );
  if (codes.includes('UNAUTHENTICATED')) return new ConnectorAuthError(LABEL, 401);
  if (codes.includes('FORBIDDEN')) return new ConnectorAuthError(LABEL, 403);
  if (codes.includes('RATELIMITED')) {
    return new ConnectorHttpError(429, `Limite de requêtes de ${LABEL} atteinte`);
  }
  if (codes.includes('INTERNALSERVERERROR')) {
    return new ConnectorHttpError(500, `${LABEL} a répondu 500`);
  }
  return new ConnectorHttpError(400, `${LABEL} a refusé la requête`);
}

async function graphql<T>(
  http: ConnectorHttp,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  data: z.ZodType<T>,
): Promise<T> {
  const response = await http.json(
    {
      url: ENDPOINT,
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { query, variables },
    },
    answer,
  );
  if (response.errors?.length) throw failure(response.errors);
  const parsed = data.safeParse(response.data);
  if (!parsed.success) throw new ConnectorHttpError(null, 'Réponse inattendue');
  return parsed.data;
}

export async function fetchAccount(http: ConnectorHttp, apiKey: string): Promise<string> {
  const schema = z.object({ myWorkspace: z.object({ name: z.string() }) });
  return (await graphql(http, apiKey, ACCOUNT_QUERY, {}, schema)).myWorkspace.name;
}

// Une page de fils modifiés depuis `from` (ISO 8601), dans l'ordre de création.
export async function fetchThreads(
  http: ConnectorHttp,
  apiKey: string,
  from: string,
  after: string | null,
): Promise<{ threads: PlainThread[]; next: string | null }> {
  const schema = z.object({
    threads: z.object({ edges: z.array(z.object({ node: thread })), pageInfo }),
  });
  const variables = {
    filters: { updatedAt: { after: toFilterDate(from) } },
    first: THREADS_PAGE_SIZE,
    after,
  };
  const { threads } = await graphql(http, apiKey, THREADS_QUERY, variables, schema);
  const { hasNextPage, endCursor } = threads.pageInfo;
  return {
    threads: threads.edges.map((edge) => edge.node),
    next: hasNextPage ? endCursor : null,
  };
}

const timelineSchema = z.object({
  thread: z
    .object({
      timelineEntries: z.object({ edges: z.array(z.object({ node: timelineNode })), pageInfo }),
    })
    .nullable(),
});

// Tous les messages d'un fil. `null` : le fil n'existe plus (supprimé depuis la liste).
export async function fetchTimeline(
  http: ConnectorHttp,
  apiKey: string,
  threadId: string,
): Promise<PlainEntry[] | null> {
  const entries: PlainEntry[] = [];
  let after: string | null = null;
  for (;;) {
    const variables: Record<string, unknown> = { threadId, first: ENTRIES_PAGE_SIZE, after };
    const data: z.infer<typeof timelineSchema> = await graphql(
      http,
      apiKey,
      TIMELINE_QUERY,
      variables,
      timelineSchema,
    );
    if (data.thread === null) return null;
    const { edges, pageInfo: info } = data.thread.timelineEntries;
    entries.push(...edges.map((edge) => edge.node));
    // Un curseur répété par l'outil ne doit pas faire tourner la boucle sans fin.
    if (!info.hasNextPage || info.endCursor === null || info.endCursor === after) return entries;
    after = info.endCursor;
  }
}
