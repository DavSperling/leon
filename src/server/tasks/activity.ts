import { asc, desc, eq, or, sql } from 'drizzle-orm';
import type { TaskActorKind, TaskEventKind } from '@/lib/enums';
import { formatTaskRef } from '@/lib/tasks/ref';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { taskComments, taskEvents, taskProjects, tasks } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { TaskError } from './errors';
import { recordEvents, type TaskActor } from './events';
import { initialsOf } from './members';
import type { Person } from './task-row';

// Une ligne du fil d'activité. Un commentaire est un événement `comment` dont `body` porte le texte.
export type ActivityItem = {
  id: string;
  taskRef: string;
  taskTitle: string;
  kind: TaskEventKind;
  actor: Person | null; // null : compte supprimé
  actorKind: TaskActorKind;
  client: string | null;
  payload: Record<string, unknown>;
  body: string | null;
  createdAt: Date;
};

// L'événement d'un commentaire garde son identifiant (`commentId`), jamais son texte.
function selectActivity(tx: Tx) {
  return tx
    .select({
      id: taskEvents.id,
      projectKey: taskProjects.key,
      number: tasks.number,
      taskTitle: tasks.title,
      kind: taskEvents.kind,
      actorId: taskEvents.actorId,
      actorName: users.name,
      actorKind: taskEvents.actorKind,
      client: taskEvents.client,
      payload: taskEvents.payload,
      body: taskComments.bodyMd,
      createdAt: taskEvents.createdAt,
    })
    .from(taskEvents)
    .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
    .innerJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .leftJoin(users, eq(users.id, taskEvents.actorId))
    .leftJoin(
      taskComments,
      sql`${taskComments.id} = (${taskEvents.payload} ->> 'commentId')::uuid`,
    );
}

type ActivityRow = Awaited<ReturnType<typeof selectActivity>>[number];

function toItem({ projectKey, number, actorId, actorName, ...row }: ActivityRow): ActivityItem {
  return {
    ...row,
    taskRef: formatTaskRef(projectKey, number),
    actor:
      actorId !== null && actorName !== null
        ? { id: actorId, name: actorName, initials: initialsOf(actorName) }
        : null,
  };
}

// Le commentaire et son événement s'écrivent ensemble : le fil n'a qu'une source.
export async function addComment(
  ctx: TenantContext,
  taskId: string,
  body: string,
  actor: TaskActor,
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    // La clé étrangère ignore la RLS : la tâche doit être lue pour qu'on y rattache un commentaire.
    if ((await tx.$count(tasks, eq(tasks.id, taskId))) === 0) {
      throw new TaskError('not_found', 'Tâche introuvable.');
    }
    const [comment] = await tx
      .insert(taskComments)
      .values({ tenantId: ctx.tenantId, taskId, authorId: actor.userId, bodyMd: body })
      .returning({ id: taskComments.id });
    if (!comment) throw new Error('commentaire non créé');
    await recordEvents(tx, ctx, taskId, actor, [
      { kind: 'comment', payload: { commentId: comment.id } },
    ]);
  });
}

// Commentaires et événements mêlés, du plus ancien au plus récent. Les événements d'une même
// écriture partagent l'heure de la transaction : le type puis l'identifiant départagent.
export function listActivity(ctx: TenantContext, taskId: string): Promise<ActivityItem[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await selectActivity(tx)
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(asc(taskEvents.createdAt), asc(taskEvents.kind), asc(taskEvents.id));
    return rows.map(toItem);
  });
}

// Les derniers événements, du plus récent au plus ancien, sur les tâches qui me sont assignées
// ou que j'ai créées.
export function listMyActivity(ctx: TenantContext, limit: number): Promise<ActivityItem[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await selectActivity(tx)
      .where(or(eq(tasks.assigneeId, ctx.userId), eq(tasks.creatorId, ctx.userId)))
      .orderBy(desc(taskEvents.createdAt), desc(taskEvents.kind), desc(taskEvents.id))
      .limit(limit);
    return rows.map(toItem);
  });
}
