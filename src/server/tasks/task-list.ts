import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  type DueFilter,
  TASK_PRIORITIES,
  TASK_STATUS_CATEGORIES,
  type TaskPriority,
} from '@/lib/enums';
import { dueFilterRange } from '@/lib/tasks/dates';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskLabelLinks, taskProjects, taskStatuses, tasks } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { isClosedCategory } from './statuses';
import { selectTaskRows, type TaskRow } from './task-row';

type Filters = ViewConfig['filters'];

export type Breakdown = {
  assignee: { id: string | null; count: number }[]; // null : sans assigné
  label: { id: string; count: number }[]; // une tâche compte dans chacune de ses étiquettes
  priority: { value: TaskPriority; count: number }[]; // dans l'ordre de TASK_PRIORITIES
  project: { id: string; count: number }[];
};

const OPEN_CATEGORIES = TASK_STATUS_CATEGORIES.filter((category) => !isClosedCategory(category));

// `\` est le caractère d'échappement de LIKE : le texte cherché est pris tel quel, sans joker.
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

function assigneeCondition(ctx: TenantContext, assignee: NonNullable<Filters['assignee']>): SQL {
  if (assignee === 'none') return isNull(tasks.assigneeId);
  return eq(tasks.assigneeId, assignee === 'me' ? ctx.userId : assignee);
}

// Bornes calculées à Paris par dueFilterRange, jamais par la base. Une tâche sans échéance n'y entre pas.
// « En retard » exclut les tâches terminées ou annulées, comme isOverdue (dates.ts) qui les met en rouge.
function dueCondition(due: DueFilter, now: Date): SQL | undefined {
  if (due === 'none') return isNull(tasks.dueDate);
  const { from, to } = dueFilterRange(due, now);
  const range = and(from === null ? undefined : gte(tasks.dueDate, from), lte(tasks.dueDate, to));
  return due === 'overdue' ? and(range, inArray(taskStatuses.category, OPEN_CATEGORIES)) : range;
}

// Le texte cherché porte sur le titre et sur l'identifiant (`LEO-12`).
function textCondition(q: string): SQL | undefined {
  const text = q.trim();
  if (text === '') return undefined;
  const pattern = `%${escapeLike(text)}%`;
  const ref = sql`${taskProjects.key} || '-' || ${tasks.number}::text`;
  return or(ilike(tasks.title, pattern), ilike(ref, pattern));
}

// Les tâches que la vue montre : filtres, et sous-tâches si l'affichage les masque.
function viewConditions(
  tx: Tx,
  ctx: TenantContext,
  config: ViewConfig,
  now: Date,
): SQL | undefined {
  const { statuses, priority, assignee, creator, labelId, projectId, due, q } = config.filters;
  return and(
    statuses.length > 0 ? inArray(taskStatuses.category, statuses) : undefined,
    priority ? eq(tasks.priority, priority) : undefined,
    assignee ? assigneeCondition(ctx, assignee) : undefined,
    creator ? eq(tasks.creatorId, ctx.userId) : undefined,
    labelId
      ? inArray(
          tasks.id,
          tx
            .select({ id: taskLabelLinks.taskId })
            .from(taskLabelLinks)
            .where(eq(taskLabelLinks.labelId, labelId)),
        )
      : undefined,
    projectId ? eq(tasks.projectId, projectId) : undefined,
    due ? dueCondition(due, now) : undefined,
    textCondition(q),
    config.showSubtasks ? undefined : isNull(tasks.parentId),
  );
}

// `hiddenCount` : les tâches visibles que la vue ne montre pas.
export async function listTasks(
  ctx: TenantContext,
  config: ViewConfig,
  now: Date,
): Promise<{ rows: TaskRow[]; hiddenCount: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = await selectTaskRows(tx, viewConditions(tx, ctx, config, now));
    const total = await tx.$count(tasks);
    // Une suppression entre les deux lectures peut laisser moins de tâches que de lignes.
    return { rows, hiddenCount: Math.max(0, total - rows.length) };
  });
}

// Les mêmes tâches que listTasks, comptées par assigné, étiquette, priorité et projet.
export async function countBreakdown(
  ctx: TenantContext,
  config: ViewConfig,
  now: Date,
): Promise<Breakdown> {
  return withTenant(ctx, async (tx) => {
    const ids = tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(viewConditions(tx, ctx, config, now));
    const assignee = await tx
      .select({ id: tasks.assigneeId, count: count() })
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .groupBy(tasks.assigneeId)
      .orderBy(desc(count()), asc(tasks.assigneeId));
    const label = await tx
      .select({ id: taskLabelLinks.labelId, count: count() })
      .from(taskLabelLinks)
      .where(inArray(taskLabelLinks.taskId, ids))
      .groupBy(taskLabelLinks.labelId)
      .orderBy(desc(count()), asc(taskLabelLinks.labelId));
    const priorities = await tx
      .select({ value: tasks.priority, count: count() })
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .groupBy(tasks.priority);
    const project = await tx
      .select({ id: tasks.projectId, count: count() })
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .groupBy(tasks.projectId)
      .orderBy(desc(count()), asc(tasks.projectId));
    return {
      assignee,
      label,
      priority: TASK_PRIORITIES.flatMap((value) => priorities.filter((p) => p.value === value)),
      project,
    };
  });
}

// Tâches ni terminées ni annulées de chaque projet, en une requête ; un projet sans tâche ouverte est absent.
export async function countOpenByProject(ctx: TenantContext): Promise<Record<string, number>> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ projectId: tasks.projectId, count: count() })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(inArray(taskStatuses.category, OPEN_CATEGORIES))
      .groupBy(tasks.projectId),
  );
  return Object.fromEntries(rows.map((row) => [row.projectId, row.count]));
}
