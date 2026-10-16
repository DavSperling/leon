'use server';

import { z } from 'zod';
import { TASK_PRIORITIES } from '@/lib/enums';
import {
  DESCRIPTION_MAX_CHARS,
  LABEL_NAME_MAX_CHARS,
  MAX_IDS,
  SEARCH_MAX_CHARS,
  SEARCH_MIN_CHARS,
  TITLE_MAX_CHARS,
} from '@/lib/tasks/limits';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { createLabel, type LabelRow } from '@/server/tasks/labels';
import { listTasks } from '@/server/tasks/task-list';
import {
  bulkUpdateTasks,
  createTask,
  deleteTasks,
  moveTask,
  updateTask,
} from '@/server/tasks/tasks';
import { type ActionResult, run } from './run-action';

const PARENT_RESULTS = 12;

const Id = z.uuid();
const Ids = z.array(Id).max(MAX_IDS);
const Priority = z.enum(TASK_PRIORITIES);
const Title = z.string().trim().min(1).max(TITLE_MAX_CHARS);
const Description = z.string().max(DESCRIPTION_MAX_CHARS);
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

// Les actions groupées : une sélection de 200 tâches au plus, et ce que la barre de sélection change.
const BulkPatchSchema = TaskPatchSchema.pick({
  statusId: true,
  priority: true,
  assigneeId: true,
  dueDate: true,
  addLabelIds: true,
  removeLabelIds: true,
});
const BulkUpdateSchema = z.strictObject({ ids: Ids.min(1), patch: BulkPatchSchema });
const DeleteTasksSchema = z.strictObject({ ids: Ids.min(1) });

// Glisser une carte : vers une colonne (statut, priorité ou assigné) ou dans la sienne (sans `field`),
// entre sa voisine du dessus et celle du dessous.
const Neighbors = { beforeId: Id.nullable(), afterId: Id.nullable() };
const MoveSchema = z.union([
  z.strictObject({ field: z.literal('status'), value: Id, ...Neighbors }),
  z.strictObject({ field: z.literal('priority'), value: Priority, ...Neighbors }),
  z.strictObject({ field: z.literal('assignee'), value: Id.nullable(), ...Neighbors }),
  z.strictObject(Neighbors),
]);
const MoveTaskSchema = z.strictObject({ id: Id, move: MoveSchema });

const NewLabelSchema = z.strictObject({
  name: z.string().trim().min(1).max(LABEL_NAME_MAX_CHARS),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
});

const SearchSchema = z.string().trim().min(SEARCH_MIN_CHARS).max(SEARCH_MAX_CHARS);

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

// Tout ou rien : une tâche refusée annule l'ensemble. Renvoie le nombre de tâches modifiées.
export async function bulkUpdateTasksAction(
  ids: string[],
  patch: z.input<typeof BulkPatchSchema>,
): Promise<ActionResult<{ count: number }>> {
  return run('bulk_update_tasks', BulkUpdateSchema, { ids, patch }, async (ctx, data) => ({
    count: await bulkUpdateTasks(ctx, data.ids, data.patch, { kind: 'user', userId: ctx.userId }),
  }));
}

export async function deleteTasksAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  return run('delete_tasks', DeleteTasksSchema, { ids }, async (ctx, data) => ({
    count: await deleteTasks(ctx, data.ids),
  }));
}

export async function moveTaskAction(
  id: string,
  move: z.input<typeof MoveSchema>,
): Promise<ActionResult> {
  return run('move_task', MoveTaskSchema, { id, move }, async (ctx, data) => {
    await moveTask(ctx, data.id, data.move, { kind: 'user', userId: ctx.userId });
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
