import type { TaskActorKind, TaskEventKind } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskEvents } from '@/server/db/schema/tasks';
import type { Tx } from '@/server/db/with-tenant';

// Qui écrit : une personne depuis l'interface, ou un agent MCP (avec le nom de son client).
export type TaskActor = { kind: TaskActorKind; userId: string; client?: string };

// payload : le avant (`from`) et l'après (`to`) du champ changé, jamais la description.
//   title, priority, due_date : valeurs ; status : libellés ; assignee : identifiants d'utilisateurs ;
//   parent, project : références (LEO-12) ; labels : { added, removed } (noms) ;
//   comment : { commentId } (jamais le texte) ; autres : {}.
export type TaskEventDraft = { kind: TaskEventKind; payload?: Record<string, unknown> };

// Dans la transaction de l'écriture qui les cause : un échec annule les deux.
export async function recordEvents(
  tx: Tx,
  ctx: TenantContext,
  taskId: string,
  actor: TaskActor,
  events: readonly TaskEventDraft[],
): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(taskEvents).values(
    events.map((event) => ({
      tenantId: ctx.tenantId,
      taskId,
      actorId: actor.userId,
      actorKind: actor.kind,
      client: actor.client ?? null,
      kind: event.kind,
      payload: event.payload ?? {},
    })),
  );
}
