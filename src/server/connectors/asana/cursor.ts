import { z } from 'zod';
import type { Task } from './client';

// Le curseur d'Asana. Asana ne documente aucun ordre pour la liste des tâches d'un projet : on ne
// peut donc pas reprendre « après la dernière tâche lue ». Chaque projet garde à la place son
// repère (`marks`) : l'instant de la tâche la plus récemment modifiée vue au dernier passage
// terminé, et les tâches vues à cet instant exact. `current` est le passage en cours : le projet,
// l'offset de sa prochaine page (nul au début du projet) et le repère en train de se construire.

const MarkSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  seen: z.array(z.string()),
});
const CursorSchema = z.object({
  marks: z.record(z.string(), MarkSchema),
  current: z
    .object({
      project: z.string(),
      offset: z.string().nullable(),
      mark: MarkSchema.nullable(),
    })
    .nullable(),
});

export type Mark = z.infer<typeof MarkSchema>;
export type Cursor = z.infer<typeof CursorSchema>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Cursor {
  const fresh: Cursor = { marks: {}, current: null };
  if (text === null) return fresh;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

// Déjà lue : plus ancienne que le repère, ou lue à l'instant même du repère.
export function isDone(mark: Mark | null, task: Task): boolean {
  if (mark === null) return false;
  const elapsed = Date.parse(task.modified_at) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(task.gid));
}

export function advance(mark: Mark | null, task: Task): Mark {
  if (mark === null) return { at: task.modified_at, seen: [task.gid] };
  const elapsed = Date.parse(task.modified_at) - Date.parse(mark.at);
  if (elapsed > 0) return { at: task.modified_at, seen: [task.gid] };
  if (elapsed < 0 || mark.seen.includes(task.gid)) return mark;
  return { at: mark.at, seen: [...mark.seen, task.gid] };
}
