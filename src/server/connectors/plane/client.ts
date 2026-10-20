import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import { all, pages } from './pages';

// Les requêtes vers l'API v2 de Plane et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.plane.so/api/v2';
const ITEMS_PER_PAGE = 50; // le défaut de Plane
const SMALL_PER_PAGE = 200; // le maximum de Plane
const MEMBER_PAGES_MAX = 5; // soit 1 000 membres au plus
const COMMENT_PAGES_MAX = 2; // soit 400 commentaires, les plus récents
// `description_html` ne figure dans une liste que si on la demande.
const ITEM_FIELDS = 'id,name,sequence_id,description_html,created_by_id,updated_by_id,updated_at';

// Plane écrit des dates ISO 8601 en UTC avec des microsecondes (« 2026-01-14T09:22:41.478363Z »).
// Une date illisible est refusée ici : le curseur s'en sert pour calculer.
const Instant = z.iso.datetime({ offset: true });
const Person = z.object({ display_name: z.string().nullish(), email: z.string().nullish() });

export const ProjectSchema = z.object({ id: z.string(), name: z.string(), identifier: z.string() });
export const WorkItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence_id: z.number(),
  description_html: z.string().nullish(), // « <p></p> » quand l'élément n'a pas de description
  created_by_id: z.string().nullish(),
  updated_by_id: z.string().nullish(),
  updated_at: Instant,
});
export const CommentSchema = z.object({
  id: z.string(),
  comment_html: z.string().nullish(),
  comment_stripped: z.string().nullish(),
  actor: Person.nullish(), // présent avec expand=actor
  hidden_at: z.string().nullish(), // renseigné pour un commentaire masqué par la modération
  created_at: Instant,
});
export const MemberSchema = z.object({ member_id: z.string(), member: Person.nullish() });

export type Project = z.infer<typeof ProjectSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Member = z.infer<typeof MemberSchema>;

export function planeClient(apiKey: string, workspace: string, http: ConnectorHttp) {
  const headers = { 'X-Api-Key': apiKey };
  const base = `${API}/workspaces/${encodeURIComponent(workspace)}`;
  const itemsUrl = (projectId: string) =>
    `${base}/projects/${encodeURIComponent(projectId)}/work-items/`;

  return {
    async account(): Promise<string> {
      const me = await http.json(
        { url: `${API}/users/me/`, headers },
        z.object({ display_name: z.string() }),
      );
      return me.display_name;
    },

    // Plane répond 404 à un espace inconnu, et 403 à une clé qui n'y a pas accès.
    async checkWorkspace(): Promise<void> {
      try {
        const request = { url: `${base}/projects/`, headers, query: { per_page: 1 } };
        await http.json(request, z.looseObject({}));
      } catch (error) {
        const denied = error instanceof ConnectorAuthError && error.status === 403;
        const missing = error instanceof ConnectorHttpError && error.status === 404;
        if (denied || missing) {
          throw new ConnectorHttpError(denied ? 403 : 404, `Espace inaccessible : ${workspace}`);
        }
        throw error;
      }
    },

    projects: (): Promise<Project[]> =>
      all(
        pages(
          http,
          { url: `${base}/projects/`, headers, query: { per_page: SMALL_PER_PAGE } },
          ProjectSchema,
        ),
      ),

    members: (): Promise<Member[]> =>
      all(
        pages(
          http,
          {
            url: `${base}/members/`,
            headers,
            query: { per_page: SMALL_PER_PAGE, expand: 'member' },
          },
          MemberSchema,
          MEMBER_PAGES_MAX,
        ),
      ),

    // Les éléments modifiés à partir de `from` (inclus), du plus ancien au plus récent. Le curseur
    // de Plane (`paginate=cursor`) reste stable quand un élément change pendant la lecture, ce que
    // le décalage ne garantit pas.
    workItems: (projectId: string, from: string): AsyncGenerator<WorkItem[]> =>
      pages(
        http,
        {
          url: itemsUrl(projectId),
          headers,
          query: {
            paginate: 'cursor',
            order_by: 'updated_at',
            updated_at__gte: from,
            per_page: ITEMS_PER_PAGE,
            fields: ITEM_FIELDS,
          },
        },
        WorkItemSchema,
      ),

    // Les plus récents d'abord ; l'appelant les remet dans l'ordre. `expand=actor` donne le nom et
    // l'e-mail de l'auteur, même s'il a quitté l'espace.
    comments: (projectId: string, itemId: string): Promise<Comment[]> =>
      all(
        pages(
          http,
          {
            url: `${itemsUrl(projectId)}${encodeURIComponent(itemId)}/comments/`,
            headers,
            query: { order_by: '-created_at', per_page: SMALL_PER_PAGE, expand: 'actor' },
          },
          CommentSchema,
          COMMENT_PAGES_MAX,
        ),
      ),
  };
}

export type PlaneClient = ReturnType<typeof planeClient>;
