import { z } from 'zod';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
} from '../http';

// Les requêtes vers l'API REST de gitlab.com et la forme des réponses lues (seulement les champs utiles).

const API = 'https://gitlab.com/api/v4';
const LIST_PER_PAGE = 50;
const NOTES_PER_PAGE = 100; // le maximum de GitLab

export type Stream = 'issues' | 'merge_requests';

const Author = z.object({ username: z.string(), name: z.string().nullish() }).nullish();

// Un ticket et une demande de fusion se lisent de la même façon.
export const ListedSchema = z.object({
  iid: z.number(),
  title: z.string(),
  description: z.string().nullish(),
  web_url: z.string(),
  author: Author,
  updated_at: z.string(),
  user_notes_count: z.number().optional(), // 0 évite une requête
});
export const NoteSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  author: Author,
  created_at: z.string(),
  system: z.boolean().optional(), // vrai pour « a fermé le ticket », « a changé la description »
});

export type Listed = z.infer<typeof ListedSchema>;
export type Note = z.infer<typeof NoteSchema>;

// Le chemin « groupe/projet » tient en un seul segment d'adresse : groupe%2Fprojet.
const projectUrl = (project: string) => `${API}/projects/${encodeURIComponent(project)}`;

// `headers` : l'authentification, `PRIVATE-TOKEN` pour une clé collée ou `Authorization: Bearer` pour
// un jeton OAuth (voir `authHeaders` dans connector.ts).
export function gitlabClient(headers: Record<string, string>, http: ConnectorHttp) {
  // Une page à la fois ; la suivante par l'adresse que GitLab donne dans l'en-tête Link.
  async function* pages<T>(first: HttpRequest, schema: z.ZodType<T[]>): AsyncGenerator<T[]> {
    let request: HttpRequest | null = first;
    while (request) {
      const { data, nextUrl }: { data: T[]; nextUrl: string | null } = await http.page(
        request,
        schema,
      );
      yield data;
      request = nextUrl ? { url: nextUrl, headers } : null;
    }
  }

  return {
    account: () =>
      http.json(
        { url: `${API}/user`, headers },
        z.object({ id: z.number(), username: z.string() }),
      ),

    // Bouton seulement : GitLab ne laisse pas choisir les projets à l'autorisation. Les `max` projets
    // dont l'utilisateur est membre, les plus récemment actifs d'abord (une seule page).
    // https://docs.gitlab.com/api/projects/#list-a-users-projects
    memberProjects: (max: number) =>
      http.json(
        {
          url: `${API}/projects`,
          headers,
          query: { membership: 'true', order_by: 'last_activity_at', sort: 'desc', per_page: max },
        },
        z
          .array(z.object({ path_with_namespace: z.string() }))
          .transform((rows) => rows.map((row) => row.path_with_namespace)),
      ),

    // GitLab répond 404 à un projet privé hors de portée du jeton, et 403 à un jeton sans accès.
    async checkProject(project: string): Promise<void> {
      try {
        await http.json({ url: projectUrl(project), headers }, z.looseObject({}));
      } catch (error) {
        const denied = error instanceof ConnectorAuthError && error.status === 403;
        const missing = error instanceof ConnectorHttpError && error.status === 404;
        if (denied || missing) {
          throw new ConnectorHttpError(denied ? 403 : 404, `Project not accessible: ${project}`);
        }
        throw error;
      }
    },

    // Tickets ou demandes de fusion modifiés depuis `since` (AAAA-MM-JJTHH:MM:SSZ, inclus), du plus
    // ancien au plus récent. `scope` est explicite : la valeur par défaut varie selon le point d'accès.
    // Les tickets se lisent par curseur (`pagination=keyset`, documenté depuis GitLab 18.3) : un
    // ticket modifié pendant la lecture ne décale pas les pages. La doc n'en dit rien pour les
    // demandes de fusion, qui restent lues par décalage.
    list: (project: string, stream: Stream, since: string) =>
      pages(
        {
          url: `${projectUrl(project)}/${stream}`,
          headers,
          query: {
            scope: 'all',
            state: 'all',
            order_by: 'updated_at',
            sort: 'asc',
            updated_after: since,
            per_page: LIST_PER_PAGE,
            ...(stream === 'issues' ? { pagination: 'keyset' } : {}),
          },
        },
        z.array(ListedSchema),
      ),

    async notes(project: string, stream: Stream, iid: number): Promise<Note[]> {
      const request = {
        url: `${projectUrl(project)}/${stream}/${iid}/notes`,
        headers,
        query: { sort: 'asc', order_by: 'created_at', per_page: NOTES_PER_PAGE },
      };
      const rows: Note[] = [];
      for await (const page of pages(request, z.array(NoteSchema))) rows.push(...page);
      return rows;
    },
  };
}

export type GitlabClient = ReturnType<typeof gitlabClient>;
