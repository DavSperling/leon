import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers Linear (GraphQL) et la lecture de leurs réponses.

const LABEL = PROVIDER_LABELS.linear;
const ENDPOINT = 'https://api.linear.app/graphql';

export const PAGE_SIZE = 50;
// 50 tickets × (50 commentaires et 10 labels) restent sous la limite de complexité d'une requête
// (10 000 points, environ 7 300 ici). Au-delà de 50 commentaires, le ticket sort avec ceux que l'outil rend.
const COMMENTS_MAX = 50;
// shortcut: au-delà de 10 labels, le ticket ne garde que les 10 premiers ; à relever si une équipe en met plus.
const LABELS_MAX = 10;

// Où en est le parcours d'un type d'éléments : les éléments modifiés après `from`, rendus du plus
// récent au plus ancien ; `after` est la position dans le parcours, `top` la modification la plus
// récente vue depuis son début.
export type Stream = { from: string; top: string | null; after: string | null };

const ACCOUNT_QUERY = 'query Account { viewer { id name } organization { id name } }';

// L'essentiel d'un ticket (map.ts) : son état, son assigné, sa priorité, ses labels, son cycle et son échéance.
// Doc lue le 27/11/2026 :
//   https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql (schéma public) : Issue.state
//     (WorkflowState!, son nom), assignee (User, null si personne), priority (0 = aucune, 1 = urgente, 2 = haute,
//     3 = moyenne, 4 = basse), dueDate (TimelessDate, AAAA-MM-JJ, null sans échéance), cycle (null hors cycle ;
//     number, et name facultatif), labels (IssueLabelConnection, name) ;
//   https://linear.app/developers/rate-limiting : 0,1 point par champ et 1 par objet, multipliés par la taille de
//     page d'une liste (50 par défaut).
const ISSUES_QUERY = `query Issues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
    nodes {
      id identifier title description url updatedAt priority dueDate
      creator { name email }
      team { name }
      project { name }
      state { name }
      assignee { name }
      cycle { number name }
      labels(first: ${LABELS_MAX}) { nodes { name } }
      comments(first: ${COMMENTS_MAX}) { nodes { id body createdAt user { name email } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PROJECT_UPDATES_QUERY = `query ProjectUpdates($first: Int!, $after: String, $filter: ProjectUpdateFilter) {
  projectUpdates(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
    nodes { id body url updatedAt user { name email } project { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const user = z.object({ name: z.string().nullable(), email: z.string().nullable() }).nullable();
const named = z.object({ name: z.string() });

const issue = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  updatedAt: z.string(),
  priority: z.number(),
  dueDate: z.string().nullable(),
  creator: user,
  team: named,
  project: named.nullable(),
  state: named,
  assignee: named.nullable(),
  cycle: z.object({ number: z.number(), name: z.string().nullable() }).nullable(),
  labels: z.object({ nodes: z.array(named) }),
  comments: z.object({
    nodes: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.string(), user })),
  }),
});
const projectUpdate = z.object({
  id: z.string(),
  body: z.string(),
  url: z.string(),
  updatedAt: z.string(),
  user,
  project: named,
});
const connection = <T extends z.ZodType>(node: T) =>
  z.object({
    nodes: z.array(node),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  });

export type LinearIssue = z.infer<typeof issue>;
export type LinearProjectUpdate = z.infer<typeof projectUpdate>;
export type LinearUser = z.infer<typeof user>;

// Seul le type des erreurs est lu, jamais leur texte : il peut citer la requête.
const apiError = z.object({
  extensions: z.object({ code: z.string().optional(), type: z.string().optional() }).optional(),
});
const answer = z.object({ data: z.unknown().optional(), errors: z.array(apiError).optional() });

// Doc « Rate limiting » : HTTP 400 et extensions.code = RATELIMITED. Le SDK officiel lit
// extensions.type (« authentication error », « forbidden », « ratelimited ») : les deux sont reconnus.
function failure(errors: z.infer<typeof apiError>[]): Error {
  const labels = errors.flatMap((error) => [error.extensions?.code, error.extensions?.type]);
  const has = (...names: string[]) =>
    labels.some((name) => name !== undefined && names.includes(name));
  if (has('AUTHENTICATION_ERROR', 'authentication error'))
    return new ConnectorAuthError(LABEL, 401);
  if (has('FORBIDDEN', 'forbidden')) return new ConnectorAuthError(LABEL, 403);
  if (has('RATELIMITED', 'ratelimited')) {
    return new ConnectorHttpError(429, `${LABEL} rate limit reached`);
  }
  return new ConnectorHttpError(400, `${LABEL} rejected the request`);
}

// Ce que les requêtes lisent de la configuration : la clé personnelle, ou le jeton du bouton.
type Credentials = { authMode: 'key' | 'oauth'; apiKey?: string; accessToken?: string };

// L'en-tête Authorization. Une clé personnelle s'envoie telle quelle ; « Bearer » est réservé aux
// jetons OAuth (doc « Authentication »). Le schéma garantit le champ de la forme choisie.
export function authorizationOf(config: Credentials): string {
  if (config.authMode === 'oauth') return `Bearer ${config.accessToken ?? ''}`;
  return config.apiKey ?? '';
}

async function graphql<T>(
  http: ConnectorHttp,
  authorization: string,
  query: string,
  variables: Record<string, unknown>,
  data: z.ZodType<T>,
): Promise<T> {
  const response = await http.json(
    {
      url: ENDPOINT,
      method: 'POST',
      headers: { Authorization: authorization },
      body: { query, variables },
      acceptStatus: [400], // limite de débit et erreurs de requête
    },
    answer,
  );
  if (response.errors?.length) throw failure(response.errors);
  const parsed = data.safeParse(response.data);
  if (!parsed.success) throw new ConnectorHttpError(null, 'Unexpected response');
  return parsed.data;
}

const pageVariables = (stream: Stream) => ({
  first: PAGE_SIZE,
  after: stream.after,
  filter: { updatedAt: { gt: stream.from } },
});

export async function fetchAccount(
  http: ConnectorHttp,
  authorization: string,
): Promise<{ account: string; accountKey: string }> {
  const identified = named.extend({ id: z.string() });
  const schema = z.object({ viewer: identified, organization: identified });
  const { viewer, organization } = await graphql(http, authorization, ACCOUNT_QUERY, {}, schema);
  return {
    account: `${viewer.name} (${organization.name})`,
    accountKey: `${viewer.id}:${organization.id}`,
  };
}

export async function fetchIssues(http: ConnectorHttp, authorization: string, stream: Stream) {
  const schema = z.object({ issues: connection(issue) });
  return (await graphql(http, authorization, ISSUES_QUERY, pageVariables(stream), schema)).issues;
}

export async function fetchProjectUpdates(
  http: ConnectorHttp,
  authorization: string,
  stream: Stream,
) {
  const schema = z.object({ projectUpdates: connection(projectUpdate) });
  const data = await graphql(
    http,
    authorization,
    PROJECT_UPDATES_QUERY,
    pageVariables(stream),
    schema,
  );
  return data.projectUpdates;
}
