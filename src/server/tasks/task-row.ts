import { asc, count, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { TaskPriority, TaskStatusCategory } from '@/lib/enums';
import { formatTaskRef } from '@/lib/tasks/ref';
import { users } from '@/server/db/schema/auth';
import {
  taskLabelLinks,
  taskLabels,
  taskProjects,
  taskStatuses,
  tasks,
} from '@/server/db/schema/tasks';
import type { Tx } from '@/server/db/with-tenant';
import { initialsOf } from './members';

export type Person = { id: string; name: string; initials: string };
export type LabelRef = { id: string; name: string; color: string };

// Une tâche telle que les listes, le tableau et la page d'une tâche l'affichent.
export type TaskRow = {
  id: string;
  ref: string;
  projectId: string;
  projectKey: string;
  number: number;
  title: string;
  statusId: string;
  statusLabel: string;
  statusColor: string;
  statusCategory: TaskStatusCategory;
  priority: TaskPriority;
  assignee: Person | null;
  creatorId: string | null;
  dueDate: string | null;
  labels: LabelRef[];
  parentRef: string | null;
  subtaskCount: number;
  subtaskDoneCount: number;
  position: number;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const parent = alias(tasks, 'parent');
const parentProject = alias(taskProjects, 'parent_project');

const TASK_COLUMNS = {
  id: tasks.id,
  projectId: tasks.projectId,
  projectKey: taskProjects.key,
  number: tasks.number,
  title: tasks.title,
  statusId: tasks.statusId,
  statusLabel: taskStatuses.label,
  statusColor: taskStatuses.color,
  statusCategory: taskStatuses.category,
  priority: tasks.priority,
  assigneeId: tasks.assigneeId,
  assigneeName: users.name,
  creatorId: tasks.creatorId,
  dueDate: tasks.dueDate,
  parentKey: parentProject.key,
  parentNumber: parent.number,
  position: tasks.position,
  statusChangedAt: tasks.statusChangedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

async function labelsByTask(tx: Tx, taskIds: string[]): Promise<Map<string, LabelRef[]>> {
  const links = await tx
    .select({
      taskId: taskLabelLinks.taskId,
      id: taskLabels.id,
      name: taskLabels.name,
      color: taskLabels.color,
    })
    .from(taskLabelLinks)
    .innerJoin(taskLabels, eq(taskLabels.id, taskLabelLinks.labelId))
    .where(inArray(taskLabelLinks.taskId, taskIds))
    .orderBy(asc(sql`lower(${taskLabels.name})`), asc(taskLabels.id));
  const byTask = new Map<string, LabelRef[]>();
  for (const { taskId, ...label } of links) {
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), label]);
  }
  return byTask;
}

// Sous-tâches terminées : celles qui ont une date de fin (statut `done` ou `canceled`).
async function subtaskCounts(
  tx: Tx,
  taskIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  const rows = await tx
    .select({ parentId: tasks.parentId, total: count(), done: count(tasks.completedAt) })
    .from(tasks)
    .where(inArray(tasks.parentId, taskIds))
    .groupBy(tasks.parentId);
  return new Map(rows.flatMap(({ parentId, ...n }) => (parentId ? [[parentId, n] as const] : [])));
}

// Les tâches visibles qui satisfont `where` (colonnes de tasks, de task_projects et de task_statuses),
// dans l'ordre manuel. Trois requêtes : les tâches, leurs étiquettes, le compte de leurs sous-tâches.
export async function selectTaskRows(tx: Tx, where?: SQL): Promise<TaskRow[]> {
  const rows = await tx
    .select(TASK_COLUMNS)
    .from(tasks)
    .innerJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .leftJoin(parentProject, eq(parentProject.id, parent.projectId))
    .where(where)
    .orderBy(asc(tasks.position), asc(tasks.createdAt), asc(tasks.id));
  if (rows.length === 0) return [];

  const taskIds = rows.map((row) => row.id);
  const labels = await labelsByTask(tx, taskIds);
  const subtasks = await subtaskCounts(tx, taskIds);
  return rows.map(({ assigneeId, assigneeName, parentKey, parentNumber, ...row }) => ({
    ...row,
    ref: formatTaskRef(row.projectKey, row.number),
    assignee:
      assigneeId !== null && assigneeName !== null
        ? { id: assigneeId, name: assigneeName, initials: initialsOf(assigneeName) }
        : null,
    labels: labels.get(row.id) ?? [],
    parentRef: parentKey && parentNumber ? formatTaskRef(parentKey, parentNumber) : null,
    subtaskCount: subtasks.get(row.id)?.total ?? 0,
    subtaskDoneCount: subtasks.get(row.id)?.done ?? 0,
  }));
}
