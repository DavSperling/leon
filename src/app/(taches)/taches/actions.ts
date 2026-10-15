'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { TASK_PRIORITIES } from '@/lib/enums';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { logError } from '@/server/log';
import { MAX_IDS, TaskError } from '@/server/tasks/errors';
import { createLabel, type LabelRow } from '@/server/tasks/labels';
import { listTasks } from '@/server/tasks/task-list';
import { createTask, updateTask } from '@/server/tasks/tasks';

// Chaque action : la session, zod sur les entrées, une fonction de src/server/tasks, puis le
// rafraîchissement des pages. Le message d'une erreur attendue (TaskError) est fixe ; toute autre
// erreur est journalisée sans son message et le lecteur n'en voit rien. Le texte saisi (titre,
// description, nom d'étiquette) ne passe ni dans un journal ni dans une réponse d'erreur.
type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const INVALID_INPUT = 'Saisie invalide.';
const INTERNAL_ERROR = 'Erreur interne de Leon.';
const PARENT_RESULTS = 12;
const PARENT_QUERY_MIN_CHARS = 2;

const Id = z.uuid();
const Ids = z.array(Id).max(MAX_IDS);
const Priority = z.enum(TASK_PRIORITIES);
const Title = z.string().trim().min(1).max(200);
const Description = z.string().max(100_000);
const DueDate = z.iso.date();

const CreateTaskSchema = z.strictObject({
  title: Title,
  descriptionMd: Description.optional(),
  projectId: Id.optional(),
  parentId: Id.nullable().optional(),
  statusId: Id.optional(),
  priority: Priority.optional(),
  assigneeId: Id.nullable().optional(),
  dueDate: DueDate.nullable().optional(),
  labelIds: Ids.optional(),
});

const TaskPatchSchema = z.strictObject({
  title: Title.optional(),
  descriptionMd: Description.optional(),
  projectId: Id.optional(),
  statusId: Id.optional(),
  priority: Priority.optional(),
  assigneeId: Id.nullable().optional(),
  dueDate: DueDate.nullable().optional(),
  parentId: Id.nullable().optional(),
  addLabelIds: Ids.optional(),
  removeLabelIds: Ids.optional(),
});

const UpdateTaskSchema = z.strictObject({ id: Id, patch: TaskPatchSchema });

const NewLabelSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
});

const SearchSchema = z.string().trim().min(PARENT_QUERY_MIN_CHARS).max(100);

type Work<S extends z.ZodType, T extends object> = (
  ctx: TenantContext,
  input: z.output<S>,
) => Promise<T>;

// `refresh` : les pages affichent des tâches, pas la lecture d'une recherche.
async function run<S extends z.ZodType, T extends object>(
  name: string,
  schema: S,
  input: unknown,
  work: Work<S, T>,
  refresh = true,
): Promise<ActionResult<T>> {
  const ctx = await requireUserContext();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_INPUT };
  try {
    const result = await work(ctx, parsed.data);
    if (refresh) revalidatePath('/taches', 'layout');
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof TaskError) return { ok: false, error: error.message };
    logError(`tasks.${name}`, error);
    return { ok: false, error: INTERNAL_ERROR };
  }
}

export async function createTaskAction(
  input: z.input<typeof CreateTaskSchema>,
): Promise<ActionResult<{ ref: string }>> {
  return run('create_task', CreateTaskSchema, input, async (ctx, data) => {
    const { ref } = await createTask(ctx, data, { kind: 'user', userId: ctx.userId });
    return { ref };
  });
}

export async function updateTaskAction(
  id: string,
  patch: z.input<typeof TaskPatchSchema>,
): Promise<ActionResult> {
  return run('update_task', UpdateTaskSchema, { id, patch }, async (ctx, data) => {
    await updateTask(ctx, data.id, data.patch, { kind: 'user', userId: ctx.userId });
    return {};
  });
}

export async function createLabelAction(
  input: z.input<typeof NewLabelSchema>,
): Promise<ActionResult<{ label: LabelRow }>> {
  return run('create_label', NewLabelSchema, input, async (ctx, data) => ({
    label: await createLabel(ctx, data),
  }));
}

// Les tâches dont le titre ou l'identifiant contient `query`, pour choisir un parent.
export async function searchTasksAction(query: string) {
  return run(
    'search_tasks',
    SearchSchema,
    query,
    async (ctx, q) => {
      const config = {
        ...DEFAULT_VIEW_CONFIG,
        showSubtasks: true,
        filters: { ...DEFAULT_VIEW_CONFIG.filters, statuses: [], q },
      };
      const { rows } = await listTasks(ctx, config, new Date());
      return {
        tasks: rows.slice(0, PARENT_RESULTS).map(({ id, ref, title, projectId, priority }) => ({
          id,
          ref,
          title,
          projectId,
          priority,
        })),
      };
    },
    false,
  );
}
