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
      team { name }
      project { name }
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
  creator: user,
  team: named,
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

// --- Les écritures de la discussion ---------------------------------------------------------------------------------
// Leon ne crée un ticket qu'après le clic de l'utilisateur (discussion/ticket-actions.ts) : les recherches préparent la
// proposition ; la création ne se rejoue jamais (`once`), car une réponse perdue ne doit pas doubler le ticket.
// Doc lue le 27/11/2026 :
//   https://linear.app/developers/graphql (la mutation issueCreate et sa réponse, les requêtes teams et users)
//   https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql : IssueCreateInput (teamId, title,
//     description en markdown, projectId, priority de 1 = urgente à 4 = basse, assigneeId), TeamFilter (key, name,
//     or), UserFilter (email ; les comptes désactivés sont exclus), team(id) { projects(filter) },
//     StringComparator.eqIgnoreCase, Issue.url.

const TEAMS_QUERY = `query Teams($name: String!) {
  teams(first: 2, filter: { or: [{ key: { eqIgnoreCase: $name } }, { name: { eqIgnoreCase: $name } }] }) {
    nodes { id name }
  }
}`;
const TEAM_PROJECTS_QUERY = `query TeamProjects($teamId: String!, $name: String!) {
  team(id: $teamId) { projects(first: 2, filter: { name: { eqIgnoreCase: $name } }) { nodes { id name } } }
}`;
const USERS_QUERY = `query Users($email: String!) {
  users(first: 2, filter: { email: { eqIgnoreCase: $email } }) { nodes { id } }
}`;
const ISSUE_CREATE = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { issue { url } }
}`;

// Deux résultats au plus : un seul est attendu, un second dit que le nom désigne plusieurs éléments.
const named2 = z.object({ nodes: z.array(named.extend({ id: z.string() })) });

export async function findTeams(http: ConnectorHttp, authorization: string, name: string) {
  const schema = z.object({ teams: named2 });
  return (await graphql(http, authorization, TEAMS_QUERY, { name }, schema)).teams.nodes;
}

export async function findTeamProjects(
  http: ConnectorHttp,
  authorization: string,
  teamId: string,
  name: string,
) {
  const schema = z.object({ team: z.object({ projects: named2 }) });
  const data = await graphql(http, authorization, TEAM_PROJECTS_QUERY, { teamId, name }, schema);
  return data.team.projects.nodes;
}

export async function findUsers(http: ConnectorHttp, authorization: string, email: string) {
  const schema = z.object({ users: z.object({ nodes: z.array(z.object({ id: z.string() })) }) });
  return (await graphql(http, authorization, USERS_QUERY, { email }, schema)).users.nodes;
}

export type IssueInput = {
  teamId: string;
  title: string;
  description?: string;
  projectId?: string;
  priority?: number;
  assigneeId?: string;
};

// L'adresse du ticket créé.
export async function createIssue(
  http: ConnectorHttp,
  authorization: string,
  input: IssueInput,
): Promise<string> {
  const once: ConnectorHttp = {
    ...http,
    json: (request, schema) => http.json({ ...request, once: true }, schema),
  };
  const schema = z.object({ issueCreate: z.object({ issue: z.object({ url: z.string() }) }) });
  return (await graphql(once, authorization, ISSUE_CREATE, { input }, schema)).issueCreate.issue
    .url;
}
