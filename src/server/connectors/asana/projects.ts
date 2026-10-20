import { ConnectorAuthError } from '../http';
import type { ConnectorItem, SyncPage, SyncState } from '../types';
import type { AsanaClient, Comment, Project, Task, Workspace } from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { toItem } from './map';

// La lecture d'un espace Asana, projet par projet : voir cursor.ts pour ce que le curseur retient.

// Un jeton sans accès aux commentaires d'une tâche (403) ne fait pas perdre la tâche.
async function commentsOf(asana: AsanaClient, task: string): Promise<Comment[]> {
  try {
    return await asana.comments(task);
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) return [];
    throw error;
  }
}

type Origin = { workspace: string; project: string };

// Les éléments d'une page de tâches, et le repère mis à jour. `base` est le repère du dernier
// passage terminé : il ne bouge pas pendant celui-ci (les pages ne sont pas triées).
async function readTasks(
  asana: AsanaClient,
  tasks: Task[],
  context: { base: Mark | null; mark: Mark | null; origin: Origin; rendered: Set<string> },
): Promise<{ items: ConnectorItem[]; mark: Mark | null }> {
  const items: ConnectorItem[] = [];
  let { mark } = context;
  const ordered = [...tasks].sort((a, b) => Date.parse(a.modified_at) - Date.parse(b.modified_at));
  for (const task of ordered) {
    if (!isDone(context.base, task) && !context.rendered.has(task.gid)) {
      context.rendered.add(task.gid);
      const item = toItem(task, await commentsOf(asana, task.gid), context.origin);
      if (item) items.push(item);
    }
    mark = advance(mark, task); // aussi pour une tâche sans texte, qui n'est pas rendue : elle a été vue
  }
  return { items, mark };
}

// Un instant reculé d'une seconde, au cas où Asana arrondirait ou exclurait la borne.
const fromOf = (base: Mark | null, since: Date): string =>
  new Date(base ? Date.parse(base.at) - 1000 : since.getTime()).toISOString();

export async function* syncProjects(
  asana: AsanaClient,
  workspace: Workspace,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const projects = (await asana.projects(workspace.gid)).sort((a, b) => (a.gid < b.gid ? -1 : 1));
  let cursor = readCursor(state.cursor);
  let saved = JSON.stringify(cursor);
  const rendered = new Set<string>();
  // Les projets avant celui du curseur ont été lus pendant ce passage.
  const resumeAt = Math.max(
    0,
    projects.findIndex((p) => p.gid === cursor.current?.project),
  );
  for (let index = resumeAt; index < projects.length; index++) {
    const project = projects[index] as Project;
    const resumed = cursor.current?.project === project.gid ? cursor.current : null;
    const base = cursor.marks[project.gid] ?? null;
    const origin = { workspace: workspace.name, project: project.name };
    let mark = resumed ? resumed.mark : base;
    let offset = resumed ? resumed.offset : null;
    do {
      const page = await asana.tasks(project.gid, fromOf(base, state.since), offset);
      const read = await readTasks(asana, page.tasks, { base, mark, origin, rendered });
      mark = read.mark;
      offset = page.next;
      const following = projects[index + 1]?.gid;
      cursor = offset
        ? { marks: cursor.marks, current: { project: project.gid, offset, mark } }
        : {
            marks: mark ? { ...cursor.marks, [project.gid]: mark } : cursor.marks,
            current: following ? { project: following, offset: null, mark: null } : null,
          };
      if (read.items.length > 0) {
        saved = JSON.stringify(cursor);
        yield { items: read.items, cursor: saved };
      }
    } while (offset);
  }
  // Une page sans élément ne se rend que si elle fait avancer le curseur.
  if (JSON.stringify(cursor) !== saved) yield { items: [], cursor: JSON.stringify(cursor) };
}
