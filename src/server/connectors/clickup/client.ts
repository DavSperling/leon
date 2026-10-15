import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API v2 de ClickUp et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.clickup.com/api/v2';
export const TASKS_PER_PAGE = 100; // le maximum de ClickUp
const COMMENTS_PER_PAGE = 25; // le défaut de ClickUp, sans réglage possible
const COMMENT_PAGES_MAX = 4; // soit 100 commentaires, les plus récents

// Les dates sont des millisecondes depuis 1970, écrites en chaîne ; au-delà de 15 chiffres,
// `Date` ne sait plus les lire.
const Millis = z.string().regex(/^\d{1,15}$/);
const Person = z.object({ username: z.string().nullish(), email: z.string().nullish() }).nullish(); // nul quand le compte a été supprimé

export const TaskSchema = z.object({
  id: z.string(),
  custom_id: z.string().nullish(),
  name: z.string(),
  markdown_description: z.string().nullish(), // seulement avec include_markdown_description
  description: z.string().nullish(),
  text_content: z.string().nullish(),
  date_updated: Millis,
  creator: Person,
  list: z.object({ name: z.string() }).nullish(),
  // Une liste hors dossier porte un dossier fictif : « hidden: true ».
  folder: z.object({ name: z.string(), hidden: z.boolean().nullish() }).nullish(),
  url: z.string().nullish(),
});
export const CommentSchema = z.object({
  id: z.string(),
  comment_text: z.string().nullish(),
  user: Person,
  date: Millis,
});

export type Task = z.infer<typeof TaskSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Team = { id: string; name: string };

const UserReply = z.object({ user: z.object({ username: z.string() }) });
const TeamsReply = z.object({ teams: z.array(z.object({ id: z.string(), name: z.string() })) });
// last_page est documenté pour les tâches d'une liste, pas pour celles d'un espace : facultatif.
const TasksReply = z.object({ tasks: z.array(TaskSchema), last_page: z.boolean().optional() });
const CommentsReply = z.object({ comments: z.array(CommentSchema) });

// `authorization` : la valeur de l'en-tête, qui dépend du jeton. Une clé personnelle (« pk_… ») va
// seule, sans « Bearer » ; un jeton OAuth s'écrit « Bearer <jeton> ».
export function clickupClient(authorization: string, http: ConnectorHttp) {
  const headers = { Authorization: authorization };
  const path = (id: string) => encodeURIComponent(id);

  return {
    async user(): Promise<string> {
      return (await http.json({ url: `${API}/user`, headers }, UserReply)).user.username;
    },

    // ClickUp appelle « team » ce que l'interface appelle un espace de travail.
    async teams(): Promise<Team[]> {
      return (await http.json({ url: `${API}/team`, headers }, TeamsReply)).teams;
    },

    // Toutes les tâches de l'espace modifiées après `updatedAfter` (millisecondes), dans l'ordre de
    // création : ClickUp ne dit pas dans quel sens il trie par mise à jour, et l'ordre de création ne
    // bouge pas quand une tâche est modifiée pendant la lecture. Le tri par mise à jour est fait
    // par l'appelant.
    async tasks(teamId: string, updatedAfter: number): Promise<Task[]> {
      const byId = new Map<string, Task>();
      for (let page = 0; ; page++) {
        const reply = await http.json(
          {
            url: `${API}/team/${path(teamId)}/task`,
            headers,
            query: {
              date_updated_gt: updatedAfter,
              include_closed: true,
              subtasks: true,
              include_markdown_description: true,
              order_by: 'created',
              page,
            },
          },
          TasksReply,
        );
        const known = byId.size;
        for (const task of reply.tasks) byId.set(task.id, task);
        const last = reply.last_page ?? reply.tasks.length < TASKS_PER_PAGE;
        // Une page sans nouveauté : l'outil ignore le numéro de page, on ne boucle pas.
        if (last || byId.size === known) return [...byId.values()];
      }
    },

    // Du plus récent au plus ancien, 25 à la fois ; la page suivante part du dernier reçu.
    async comments(taskId: string): Promise<Comment[]> {
      const byId = new Map<string, Comment>();
      let query: { start: string; start_id: string } | undefined;
      for (let page = 0; page < COMMENT_PAGES_MAX; page++) {
        const { comments } = await http.json(
          { url: `${API}/task/${path(taskId)}/comment`, headers, query },
          CommentsReply,
        );
        const known = byId.size;
        for (const comment of comments) byId.set(comment.id, comment);
        const oldest = comments.at(-1);
        if (!oldest || comments.length < COMMENTS_PER_PAGE || byId.size === known) break;
        query = { start: oldest.date, start_id: oldest.id };
      }
      return [...byId.values()];
    },
  };
}

export type ClickupClient = ReturnType<typeof clickupClient>;
