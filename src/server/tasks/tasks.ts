import { and, asc, eq, gt, inArray, isNull, max, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { TaskPriority, TaskStatusCategory } from '@/lib/enums';
import { positionBetween } from '@/lib/tasks/position';
import { formatTaskRef, parseTaskRef } from '@/lib/tasks/ref';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import {
  taskEvents,
  taskLabelLinks,
  taskProjects,
  taskStatuses,
  tasks,
} from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { distinctList, isEmptyPatch, TaskError } from './errors';
import { recordEvents, type TaskActor, type TaskEventDraft } from './events';
import { labelNamesById } from './labels';
import { assertMember, initialsOf } from './members';
import { isClosedCategory } from './statuses';
import { type Person, selectTaskRows, type TaskRow } from './task-row';

export type TaskInput = {
  title: string;
  descriptionMd?: string;
  // Une sous-tâche appartient toujours au projet de son parent ; sinon le projet est obligatoire.
  projectId?: string;
  parentId?: string | null;
  statusId?: string;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
};

// Champs absents : inchangés. Les étiquettes s'ajoutent et se retirent sans écraser les autres.
export type TaskPatch = {
  title?: string;
  descriptionMd?: string;
  projectId?: string;
  statusId?: string;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  parentId?: string | null;
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

export type BulkPatch = Pick<
  TaskPatch,
  'statusId' | 'priority' | 'assigneeId' | 'dueDate' | 'addLabelIds' | 'removeLabelIds'
>;

// Déplacement par glisser-déposer : vers une colonne (statut, priorité ou assigné ; sans `field`,
// la tâche reste dans sa colonne) et entre ses deux nouvelles voisines.
export type TaskMove = (
  | { field: 'status'; value: string }
  | { field: 'priority'; value: TaskPriority }
  | { field: 'assignee'; value: string | null }
  | { field?: undefined; value?: undefined }
) & { beforeId: string | null; afterId: string | null };

export type TaskDetail = TaskRow & {
  descriptionMd: string;
  creator: Person | null;
  subtasks: TaskRow[];
  parent: {
    id: string;
    ref: string;
    title: string;
    projectId: string;
    priority: TaskPriority;
  } | null;
};

type TaskUpdate = Partial<typeof tasks.$inferInsert>;
type Changes = { set: TaskUpdate; events: TaskEventDraft[] };
type StatusPick = { id: string; label: string; category: TaskStatusCategory };
type TaskRecord = {
  task: typeof tasks.$inferSelect;
  projectKey: string;
  statusLabel: string;
  statusCategory: TaskStatusCategory;
};

const STATUS_COLUMNS = {
  id: taskStatuses.id,
  label: taskStatuses.label,
  category: taskStatuses.category,
};
const parentTasks = alias(tasks, 'parent');

const emptyChanges = (): Changes => ({ set: {}, events: [] });

function mergeChanges(parts: readonly Changes[]): Changes {
  return {
    set: Object.assign({}, ...parts.map((part) => part.set)),
    events: parts.flatMap((part) => part.events),
  };
}

// Le numéro suivant du projet. L'UPDATE verrouille la ligne du projet jusqu'à la fin de la
// transaction : les créations concurrentes se suivent, sans trou ni doublon.
async function takeNumber(tx: Tx, projectId: string) {
  const [project] = await tx
    .update(taskProjects)
    .set({ lastNumber: sql`${taskProjects.lastNumber} + 1` })
    .where(eq(taskProjects.id, projectId))
    .returning({ key: taskProjects.key, number: taskProjects.lastNumber, acl: taskProjects.acl });
  if (!project) throw new TaskError('not_found', 'Projet introuvable.');
  return project;
}

async function statusOfProject(tx: Tx, statusId: string, projectId: string): Promise<StatusPick> {
  const [status] = await tx
    .select(STATUS_COLUMNS)
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, statusId), eq(taskStatuses.projectId, projectId)));
  if (!status) throw new TaskError('not_found', 'Statut introuvable.');
  return status;
}

// Premier statut du projet dans la première des catégories qui en a un.
async function firstStatus(
  tx: Tx,
  projectId: string,
  categories: readonly TaskStatusCategory[],
): Promise<StatusPick> {
  const statuses = await tx
    .select(STATUS_COLUMNS)
    .from(taskStatuses)
    .where(
      and(eq(taskStatuses.projectId, projectId), inArray(taskStatuses.category, [...categories])),
    )
    .orderBy(asc(taskStatuses.position), asc(taskStatuses.id));
  for (const category of categories) {
    const status = statuses.find((candidate) => candidate.category === category);
    if (status) return status;
  }
  throw new TaskError('not_found', 'Statut introuvable.');
}

async function refOf(tx: Tx, taskId: string): Promise<string | null> {
  const [row] = await tx
    .select({ key: taskProjects.key, number: tasks.number })
    .from(tasks)
    .innerJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .where(eq(tasks.id, taskId));
  return row ? formatTaskRef(row.key, row.number) : null;
}

// Les étiquettes visées doivent être visibles ; ajouter une étiquette déjà posée ne change rien.
async function applyLabels(
  tx: Tx,
  ctx: TenantContext,
  taskId: string,
  add: readonly string[],
  remove: readonly string[],
): Promise<{ added: string[]; removed: string[] }> {
  const toAdd = distinctList(add);
  const toRemove = distinctList(remove);
  const names = await labelNamesById(tx, [...toAdd, ...toRemove]);
  if ([...toAdd, ...toRemove].some((id) => !names.has(id))) {
    throw new TaskError('not_found', 'Étiquette introuvable.');
  }
  const added =
    toAdd.length === 0
      ? []
      : await tx
          .insert(taskLabelLinks)
          .values(toAdd.map((labelId) => ({ tenantId: ctx.tenantId, taskId, labelId })))
          .onConflictDoNothing()
          .returning({ labelId: taskLabelLinks.labelId });
  const removed =
    toRemove.length === 0
      ? []
      : await tx
          .delete(taskLabelLinks)
          .where(and(eq(taskLabelLinks.taskId, taskId), inArray(taskLabelLinks.labelId, toRemove)))
          .returning({ labelId: taskLabelLinks.labelId });
  const nameOf = ({ labelId }: { labelId: string }) => names.get(labelId) ?? '';
  return { added: added.map(nameOf), removed: removed.map(nameOf) };
}

async function endPosition(tx: Tx, projectId: string): Promise<number> {
  const [last] = await tx
    .select({ position: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  return positionBetween(last?.position ?? null, null);
}

async function findParent(tx: Tx, parentId: string) {
  const [found] = await tx
    .select({ id: tasks.id, projectId: tasks.projectId, priority: tasks.priority })
    .from(tasks)
    .where(eq(tasks.id, parentId));
  if (!found) throw new TaskError('not_found', 'Tâche parente introuvable.');
  return found;
}

type NewTask = {
  input: TaskInput;
  actor: TaskActor;
  parent: { id: string; priority: TaskPriority } | null;
  projectId: string;
  project: { number: number; acl: string[] };
  status: StatusPick;
};

async function insertTask(tx: Tx, ctx: TenantContext, task: NewTask): Promise<string> {
  const { input, actor, parent: parentTask, projectId, project, status } = task;
  const [inserted] = await tx
    .insert(tasks)
    .values({
      tenantId: ctx.tenantId,
      projectId,
      number: project.number,
      statusId: status.id,
      parentId: parentTask?.id ?? null,
      title: input.title,
      descriptionMd: input.descriptionMd ?? '',
      priority: input.priority ?? parentTask?.priority ?? 'none',
      assigneeId: input.assigneeId ?? null,
      creatorId: ctx.userId,
      dueDate: input.dueDate ?? null,
      position: await endPosition(tx, projectId),
      origin: actor.kind === 'agent' ? 'mcp' : 'ui',
      completedAt: isClosedCategory(status.category) ? sql`now()` : null,
      acl: project.acl,
    })
    .returning({ id: tasks.id });
  if (!inserted) throw new Error('tâche non créée');
  return inserted.id;
}

export async function createTask(
  ctx: TenantContext,
  input: TaskInput,
  actor: TaskActor,
): Promise<{ id: string; ref: string }> {
  await assertMember(ctx, input.assigneeId);
  return withTenant(ctx, async (tx) => {
    const parent = input.parentId ? await findParent(tx, input.parentId) : null;
    const projectId = parent?.projectId ?? input.projectId;
    if (!projectId) throw new TaskError('invalid', 'Projet manquant.');
    const project = await takeNumber(tx, projectId);
    const status = input.statusId
      ? await statusOfProject(tx, input.statusId, projectId)
      : await firstStatus(tx, projectId, ['backlog', 'todo']);
    const id = await insertTask(tx, ctx, { input, actor, parent, projectId, project, status });
    await applyLabels(tx, ctx, id, input.labelIds ?? [], []);
    await recordEvents(tx, ctx, id, actor, [{ kind: 'created' }]);
    return { id, ref: formatTaskRef(project.key, project.number) };
  });
}

// Verrouille la ligne : deux modifications concurrentes se suivent, chacune voit l'état de l'autre.
async function lockTask(tx: Tx, taskId: string): Promise<TaskRecord> {
  const [record] = await tx
    .select({
      task: tasks,
      projectKey: taskProjects.key,
      statusLabel: taskStatuses.label,
      statusCategory: taskStatuses.category,
    })
    .from(tasks)
    .innerJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(eq(tasks.id, taskId))
    .for('update', { of: tasks });
  if (!record) throw new TaskError('not_found', 'Tâche introuvable.');
  return record;
}

const SIMPLE_FIELDS = [
  { kind: 'title', key: 'title' },
  { kind: 'priority', key: 'priority' },
  { kind: 'due_date', key: 'dueDate' },
  { kind: 'assignee', key: 'assigneeId' },
] as const;

// Un événement par champ réellement changé : une valeur identique à l'actuelle n'écrit rien.
function simpleChanges(task: TaskRecord['task'], patch: TaskPatch): Changes {
  const changes = emptyChanges();
  for (const { kind, key } of SIMPLE_FIELDS) {
    const to = patch[key];
    if (to === undefined || to === task[key]) continue;
    Object.assign(changes.set, { [key]: to });
    changes.events.push({ kind, payload: { from: task[key], to } });
  }
  return changes;
}

// Une frappe suivie d'une autre ne remplit pas le journal : le même acteur n'écrit qu'un
// événement de description par fenêtre de dix minutes.
async function descriptionChanges(
  tx: Tx,
  task: TaskRecord['task'],
  patch: TaskPatch,
  actor: TaskActor,
): Promise<Changes> {
  const to = patch.descriptionMd;
  if (to === undefined || to === task.descriptionMd) return emptyChanges();
  const recent = await tx
    .select({ id: taskEvents.id })
    .from(taskEvents)
    .where(
      and(
        eq(taskEvents.taskId, task.id),
        eq(taskEvents.kind, 'description'),
        eq(taskEvents.actorId, actor.userId),
        eq(taskEvents.actorKind, actor.kind),
        actor.client === undefined
          ? isNull(taskEvents.client)
          : eq(taskEvents.client, actor.client),
        gt(taskEvents.createdAt, sql`now() - interval '10 minutes'`),
      ),
    )
    .limit(1);
  return { set: { descriptionMd: to }, events: recent.length > 0 ? [] : [{ kind: 'description' }] };
}

// Changer de projet donne un nouveau numéro dans le projet d'arrivée et un statut de même
// catégorie (ou celui demandé) ; l'événement garde l'ancienne référence.
async function placementChanges(tx: Tx, record: TaskRecord, patch: TaskPatch): Promise<Changes> {
  const { task } = record;
  const projectId = patch.projectId ?? task.projectId;
  const changes = emptyChanges();
  if (projectId !== task.projectId) {
    const target = await takeNumber(tx, projectId);
    const landing = await firstStatus(tx, projectId, [record.statusCategory]);
    Object.assign(changes.set, { projectId, number: target.number, statusId: landing.id });
    changes.events.push({
      kind: 'project',
      payload: {
        from: formatTaskRef(record.projectKey, task.number),
        to: formatTaskRef(target.key, target.number),
      },
    });
  }
  if (patch.statusId === undefined) return changes;
  const status = await statusOfProject(tx, patch.statusId, projectId);
  if (status.id === task.statusId) return changes;
  Object.assign(changes.set, {
    statusId: status.id,
    statusChangedAt: sql`now()`,
    completedAt: isClosedCategory(status.category) ? sql`now()` : null,
  });
  changes.events.push({ kind: 'status', payload: { from: record.statusLabel, to: status.label } });
  return changes;
}

// Remonte les ancêtres du futur parent ; la tâche s'y trouve si le lien fermerait une boucle.
async function createsCycle(tx: Tx, taskId: string, parentId: string): Promise<boolean> {
  if (parentId === taskId) return true;
  const result = await tx.execute(sql`
    with recursive ancestors as (
      select id, parent_id from ${tasks} where id = ${parentId}
      union
      select t.id, t.parent_id from ${tasks} t join ancestors a on t.id = a.parent_id
    )
    select 1 from ancestors where id = ${taskId}`);
  return result.rows.length > 0;
}

async function parentChanges(tx: Tx, task: TaskRecord['task'], patch: TaskPatch): Promise<Changes> {
  const to = patch.parentId;
  if (to === undefined || to === task.parentId) return emptyChanges();
  if (to !== null) {
    await findParent(tx, to);
    if (await createsCycle(tx, task.id, to)) {
      throw new TaskError('invalid', 'Ce parent créerait un cycle.');
    }
  }
  const refs = {
    from: task.parentId && (await refOf(tx, task.parentId)),
    to: to && (await refOf(tx, to)),
  };
  return { set: { parentId: to }, events: [{ kind: 'parent', payload: refs }] };
}

// Applique le patch dans la transaction de l'appelant : tout ou rien, événements compris.
async function applyPatch(
  tx: Tx,
  ctx: TenantContext,
  taskId: string,
  patch: TaskPatch,
  actor: TaskActor,
): Promise<void> {
  const record = await lockTask(tx, taskId);
  const { set, events } = mergeChanges([
    simpleChanges(record.task, patch),
    await descriptionChanges(tx, record.task, patch, actor),
    await placementChanges(tx, record, patch),
    await parentChanges(tx, record.task, patch),
  ]);
  const labels = await applyLabels(
    tx,
    ctx,
    taskId,
    patch.addLabelIds ?? [],
    patch.removeLabelIds ?? [],
  );
  const labelsChanged = labels.added.length > 0 || labels.removed.length > 0;
  if (labelsChanged) events.push({ kind: 'labels', payload: labels });
  if (!isEmptyPatch(set) || labelsChanged) {
    await tx
      .update(tasks)
      .set({ ...set, updatedAt: sql`now()` })
      .where(eq(tasks.id, taskId));
  }
  await recordEvents(tx, ctx, taskId, actor, events);
}

export async function updateTask(
  ctx: TenantContext,
  id: string,
  patch: TaskPatch,
  actor: TaskActor,
): Promise<void> {
  await assertMember(ctx, patch.assigneeId);
  await withTenant(ctx, (tx) => applyPatch(tx, ctx, id, patch, actor));
}

// Identifiants distincts, triés (les verrous se prennent toujours dans le même ordre).
function selection(ids: readonly string[]): string[] {
  const selected = distinctList(ids).sort();
  if (selected.length === 0) throw new TaskError('invalid', 'Aucune tâche sélectionnée.');
  return selected;
}

// Tout ou rien : une tâche introuvable ou un refus annule l'ensemble. Renvoie le nombre de tâches.
export async function bulkUpdateTasks(
  ctx: TenantContext,
  ids: readonly string[],
  patch: BulkPatch,
  actor: TaskActor,
): Promise<number> {
  const selected = selection(ids);
  await assertMember(ctx, patch.assigneeId);
  await withTenant(ctx, async (tx) => {
    for (const id of selected) await applyPatch(tx, ctx, id, patch, actor);
  });
  return selected.length;
}

// Les commentaires, le journal et les liens d'étiquettes partent avec la tâche (cascade) ;
// ses sous-tâches n'ont plus de parent. Renvoie le nombre de tâches supprimées.
export async function deleteTasks(ctx: TenantContext, ids: readonly string[]): Promise<number> {
  const selected = selection(ids);
  const deleted = await withTenant(ctx, (tx) =>
    tx.delete(tasks).where(inArray(tasks.id, selected)).returning({ id: tasks.id }),
  );
  return deleted.length;
}

function columnPatch(move: TaskMove): TaskPatch {
  switch (move.field) {
    case 'status':
      return { statusId: move.value };
    case 'priority':
      return { priority: move.value };
    case 'assignee':
      return { assigneeId: move.value };
    default:
      return {};
  }
}

// Place entre les deux voisines (null : en tête, en fin de colonne ou colonne vide).
async function positionAmong(
  tx: Tx,
  beforeId: string | null,
  afterId: string | null,
): Promise<number> {
  const ids = [beforeId, afterId].filter((id): id is string => id !== null);
  const neighbors =
    ids.length === 0
      ? []
      : await tx
          .select({ id: tasks.id, position: tasks.position })
          .from(tasks)
          .where(inArray(tasks.id, ids));
  const positionOf = (id: string | null): number | null => {
    if (id === null) return null;
    const neighbor = neighbors.find((candidate) => candidate.id === id);
    if (!neighbor) throw new TaskError('not_found', 'Tâche introuvable.');
    return neighbor.position;
  };
  return positionBetween(positionOf(beforeId), positionOf(afterId));
}

export async function moveTask(
  ctx: TenantContext,
  id: string,
  move: TaskMove,
  actor: TaskActor,
): Promise<void> {
  const patch = columnPatch(move);
  await assertMember(ctx, patch.assigneeId);
  await withTenant(ctx, async (tx) => {
    await applyPatch(tx, ctx, id, patch, actor);
    const position = await positionAmong(tx, move.beforeId, move.afterId);
    await tx.update(tasks).set({ position }).where(eq(tasks.id, id));
  });
}

export async function getTaskByRef(ctx: TenantContext, ref: string): Promise<TaskDetail | null> {
  const parsed = parseTaskRef(ref);
  if (!parsed) return null;
  return withTenant(ctx, async (tx) => {
    const [row] = await selectTaskRows(
      tx,
      and(eq(taskProjects.key, parsed.key), eq(tasks.number, parsed.number)),
    );
    if (!row) return null;
    const subtasks = await selectTaskRows(tx, eq(tasks.parentId, row.id));
    const [extra] = await tx
      .select({
        descriptionMd: tasks.descriptionMd,
        creatorName: users.name,
        parentId: parentTasks.id,
        parentTitle: parentTasks.title,
        parentProjectId: parentTasks.projectId,
        parentPriority: parentTasks.priority,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.creatorId))
      .leftJoin(parentTasks, eq(parentTasks.id, tasks.parentId))
      .where(eq(tasks.id, row.id));
    if (!extra) return null;
    return {
      ...row,
      descriptionMd: extra.descriptionMd,
      creator:
        row.creatorId && extra.creatorName
          ? { id: row.creatorId, name: extra.creatorName, initials: initialsOf(extra.creatorName) }
          : null,
      subtasks,
      parent:
        row.parentRef &&
        extra.parentId &&
        extra.parentTitle &&
        extra.parentProjectId &&
        extra.parentPriority
          ? {
              id: extra.parentId,
              ref: row.parentRef,
              title: extra.parentTitle,
              projectId: extra.parentProjectId,
              priority: extra.parentPriority,
            }
          : null,
    };
  });
}

// La référence actuelle d'une tâche : un changement de projet lui donne un nouveau numéro.
export function getTaskRef(ctx: TenantContext, id: string): Promise<string | null> {
  return withTenant(ctx, (tx) => refOf(tx, id));
}
