import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers Linear (GraphQL) et la lecture de leurs réponses.

const LABEL = PROVIDER_LABELS.linear;
const ENDPOINT = 'https://api.linear.app/graphql';

export const PAGE_SIZE = 50;
// 50 tickets × 50 commentaires restent sous la limite de complexité d'une requête (10 000 points,
// environ 6 600 ici). Au-delà de 50 commentaires, le ticket sort avec ceux que l'outil rend.
const COMMENTS_MAX = 50;
// Équipes lues par projet : aucun projet n'en a autant.
const TEAMS_MAX = 50;

// Où en est le parcours d'un type d'éléments : les éléments modifiés après `from`, rendus du plus
// récent au plus ancien ; `after` est la position dans le parcours, `top` la modification la plus
// récente vue depuis son début.
export type Stream = { from: string; top: string | null; after: string | null };

const ACCOUNT_QUERY = 'query Account { viewer { id name } organization { id name } }';

const ISSUES_QUERY = `query Issues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
    nodes {
      id identifier title description url updatedAt
      creator { name email }
      team { name visibility }
      project { name }
      comments(first: ${COMMENTS_MAX}) { nodes { id body createdAt user { name email } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PROJECT_UPDATES_QUERY = `query ProjectUpdates($first: Int!, $after: String, $filter: ProjectUpdateFilter) {
  projectUpdates(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
    nodes {
      id body url updatedAt user { name email }
      project { name teams(first: ${TEAMS_MAX}) { nodes { visibility } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const user = z.object({ name: z.string().nullable(), email: z.string().nullable() }).nullable();
const named = z.object({ name: z.string() });
// `visibility` : public, private ou restricted (Team.visibility) ; lu en texte pour qu'une valeur nouvelle
// ne fasse pas échouer la relève (elle compte comme non publique, voir map.ts).
const visibility = z.object({ visibility: z.string() });

const issue = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  updatedAt: z.string(),
  creator: user,
  team: named.extend(visibility.shape),
  project: named.nullable(),
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
  project: named.extend({ teams: z.object({ nodes: z.array(visibility) }) }),
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
