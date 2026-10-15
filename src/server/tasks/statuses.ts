import { and, asc, eq, max, sql } from 'drizzle-orm';
import { TASK_STATUS_CATEGORIES, type TaskStatusCategory } from '@/lib/enums';
import { positionBetween } from '@/lib/tasks/position';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskStatuses, tasks } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { isEmptyPatch, TaskError } from './errors';
import { assertProject } from './projects';

export type StatusRow = {
  id: string;
  projectId: string;
  label: string;
  color: string;
  category: TaskStatusCategory;
  position: number;
};

const STATUS_COLUMNS = {
  id: taskStatuses.id,
  projectId: taskStatuses.projectId,
  label: taskStatuses.label,
  color: taskStatuses.color,
  category: taskStatuses.category,
  position: taskStatuses.position,
};
const LAST_OF_CATEGORY_MESSAGE = 'Chaque catégorie garde au moins un statut.';

export const isClosedCategory = (category: TaskStatusCategory): boolean =>
  category === 'done' || category === 'canceled';

const categoryRank = (status: StatusRow): number => TASK_STATUS_CATEGORIES.indexOf(status.category);

// Rangés par catégorie puis par position, l'ordre d'affichage des groupes.
export async function listStatuses(ctx: TenantContext, projectId?: string): Promise<StatusRow[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select(STATUS_COLUMNS)
      .from(taskStatuses)
      .where(projectId === undefined ? undefined : eq(taskStatuses.projectId, projectId))
      .orderBy(asc(taskStatuses.position), asc(taskStatuses.id)),
  );
  return rows.sort((a, b) => categoryRank(a) - categoryRank(b));
}

async function findStatus(tx: Tx, id: string): Promise<StatusRow> {
  const [status] = await tx
    .select(STATUS_COLUMNS)
    .from(taskStatuses)
    .where(eq(taskStatuses.id, id));
  if (!status) throw new TaskError('not_found', 'Statut introuvable.');
  return status;
}

async function assertNotLastOfCategory(tx: Tx, status: StatusRow): Promise<void> {
  const sameCategory = and(
    eq(taskStatuses.projectId, status.projectId),
    eq(taskStatuses.category, status.category),
  );
  if ((await tx.$count(taskStatuses, sameCategory)) <= 1) {
    throw new TaskError('conflict', LAST_OF_CATEGORY_MESSAGE);
  }
}

// completed_at suit la catégorie : posé à l'entrée dans une catégorie terminée, retiré à la sortie.
const completionFor = (category: TaskStatusCategory) =>
  isClosedCategory(category) ? sql`coalesce(${tasks.completedAt}, now())` : null;

export async function createStatus(
  ctx: TenantContext,
  input: { projectId: string; label: string; color: string; category: TaskStatusCategory },
): Promise<StatusRow> {
  return withTenant(ctx, async (tx) => {
    await assertProject(tx, input.projectId);
    const [last] = await tx
      .select({ position: max(taskStatuses.position) })
      .from(taskStatuses)
      .where(eq(taskStatuses.projectId, input.projectId));
    const position = positionBetween(last?.position ?? null, null);
    const [status] = await tx
      .insert(taskStatuses)
      .values({ tenantId: ctx.tenantId, position, ...input })
      .returning(STATUS_COLUMNS);
    if (!status) throw new Error('statut non créé');
    return status;
  });
}

// Changer de catégorie ne doit pas vider l'ancienne, et remet la date de fin des tâches en phase.
export function updateStatus(
  ctx: TenantContext,
  id: string,
  patch: { label?: string; color?: string; category?: TaskStatusCategory },
): Promise<void> {
  if (isEmptyPatch(patch)) return Promise.resolve();
  return withTenant(ctx, async (tx) => {
    const status = await findStatus(tx, id);
    const { category } = patch;
    if (category !== undefined && category !== status.category) {
      await assertNotLastOfCategory(tx, status);
      if (isClosedCategory(category) !== isClosedCategory(status.category)) {
        await tx
          .update(tasks)
          .set({ completedAt: completionFor(category) })
          .where(eq(tasks.statusId, id));
      }
    }
    await tx.update(taskStatuses).set(patch).where(eq(taskStatuses.id, id));
  });
}

// Échange la place du statut avec son voisin de la même catégorie ; sans voisin, ne fait rien.
export function moveStatus(
  ctx: TenantContext,
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  return withTenant(ctx, async (tx) => {
    const status = await findStatus(tx, id);
    const peers = await tx
      .select({ id: taskStatuses.id, position: taskStatuses.position })
      .from(taskStatuses)
      .where(
        and(
          eq(taskStatuses.projectId, status.projectId),
          eq(taskStatuses.category, status.category),
        ),
      )
      .orderBy(asc(taskStatuses.position), asc(taskStatuses.id));
    const index = peers.findIndex((peer) => peer.id === id);
    const neighbor = peers[direction === 'up' ? index - 1 : index + 1];
    if (!neighbor) return;
    await tx
      .update(taskStatuses)
      .set({ position: neighbor.position })
      .where(eq(taskStatuses.id, id));
    await tx
      .update(taskStatuses)
      .set({ position: status.position })
      .where(eq(taskStatuses.id, neighbor.id));
  });
}

// Les tâches du statut supprimé passent à `targetStatusId`, du même projet ; pas de journal :
// c'est un réglage du projet, pas le geste d'une personne sur une tâche.
export function deleteStatus(
  ctx: TenantContext,
  id: string,
  targetStatusId: string,
): Promise<void> {
  return withTenant(ctx, async (tx) => {
    const status = await findStatus(tx, id);
    const target = await findStatus(tx, targetStatusId);
    if (target.id === status.id || target.projectId !== status.projectId) {
      throw new TaskError('invalid', 'Choisissez un autre statut du même projet.');
    }
    await assertNotLastOfCategory(tx, status);
    await tx
      .update(tasks)
      .set({
        statusId: target.id,
        statusChangedAt: sql`now()`,
        completedAt: completionFor(target.category),
        updatedAt: sql`now()`,
      })
      .where(eq(tasks.statusId, id));
    await tx.delete(taskStatuses).where(eq(taskStatuses.id, id));
  });
}
