import { z } from 'zod';
import { type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API REST d'Asana et la forme des réponses lues (seulement les champs utiles).

const API = 'https://app.asana.com/api/1.0';
const PAGE_SIZE = 100; // le maximum d'Asana ; sans `limit`, la réponse n'a ni pagination ni `next_page`

const User = z.object({ name: z.string().nullish() }).nullish();

export const WorkspaceSchema = z.object({ gid: z.string(), name: z.string() });
export const ProjectSchema = z.object({ gid: z.string(), name: z.string() });
export const TaskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  notes: z.string().nullish(), // texte brut ; absent ou vide pour une tâche sans description
  modified_at: z.string(),
  created_by: User,
  permalink_url: z.string().nullish(),
});
export const CommentSchema = z.object({
  gid: z.string(),
  created_at: z.string(),
  created_by: User,
  resource_subtype: z.string(),
  text: z.string().nullish(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Comment = z.infer<typeof CommentSchema>;

const MeSchema = z.object({
  data: z.object({ name: z.string().nullish(), workspaces: z.array(WorkspaceSchema) }),
});

const listOf = <T>(row: z.ZodType<T>) =>
  z.object({
    data: z.array(row),
    next_page: z.object({ offset: z.string() }).nullish(), // nul à la dernière page
  });

export type TasksPage = { tasks: Task[]; next: string | null };

export function asanaClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };

  async function page<T>(
    path: string,
    row: z.ZodType<T>,
    query: Record<string, string | boolean | undefined>,
    offset?: string,
  ): Promise<{ rows: T[]; next: string | null }> {
    const request = {
      url: `${API}${path}`,
      headers,
      query: { ...query, limit: PAGE_SIZE, offset },
    };
    const body = await http.json(request, listOf(row));
    return { rows: body.data, next: body.next_page?.offset ?? null };
  }

  async function all<T>(
    path: string,
    row: z.ZodType<T>,
    query: Record<string, string | boolean | undefined>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let offset: string | undefined;
    do {
      const { rows: more, next } = await page(path, row, query, offset);
      rows.push(...more);
      offset = next ?? undefined;
    } while (offset);
    return rows;
  }

  return {
    async me(): Promise<{ name: string | null; workspaces: Workspace[] }> {
      const request = {
        url: `${API}/users/me`,
        headers,
        query: { opt_fields: 'name,workspaces.name' },
      };
      const { data } = await http.json(request, MeSchema);
      return { name: data.name ?? null, workspaces: data.workspaces };
    },

    // Les projets non archivés que le jeton voit dans l'espace (aucun ordre n'est documenté).
    projects: (workspace: string) =>
      all('/projects', ProjectSchema, { workspace, archived: false, opt_fields: 'name' }),

    // Une page de tâches d'un projet modifiées depuis `modifiedSince` (ISO 8601, UTC). Asana ne
    // documente aucun ordre. Un offset périmé est refusé (400) : on reprend alors la première page.
    async tasks(project: string, modifiedSince: string, offset: string | null): Promise<TasksPage> {
      // Seul `created_by` est listé dans les `opt_fields` de la doc, pas `created_by.name`.
      const query = {
        project,
        modified_since: modifiedSince,
        opt_fields: 'name,notes,modified_at,created_by,permalink_url',
      };
      try {
        const { rows, next } = await page('/tasks', TaskSchema, query, offset ?? undefined);
        return { tasks: rows, next };
      } catch (error) {
        const stale =
          offset !== null && error instanceof ConnectorHttpError && error.status === 400;
        if (!stale) throw error;
        const { rows, next } = await page('/tasks', TaskSchema, query);
        return { tasks: rows, next };
      }
    },

    // Les seuls commentaires (le filtre écarte les histoires système : assignations, dates…), du
    // plus ancien au plus récent.
    comments: (task: string) =>
      all(`/tasks/${encodeURIComponent(task)}/stories`, CommentSchema, {
        resource_subtype: 'comment_added',
        opt_fields: 'created_at,created_by.name,resource_subtype,text',
      }),
  };
}

export type AsanaClient = ReturnType<typeof asanaClient>;
