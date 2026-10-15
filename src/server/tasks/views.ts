import { and, arrayContains, asc, eq, sql } from 'drizzle-orm';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskViews } from '@/server/db/schema/tasks';
import { withTenant } from '@/server/db/with-tenant';
import { orConflict, TaskError } from './errors';

export type ViewRow = {
  id: string;
  name: string;
  config: ViewConfig;
  ownerId: string;
  team: boolean; // vue d'équipe : visible de tous ; sinon, de son auteur seul
  isTeamDefault: boolean;
};

const VIEW_COLUMNS = {
  id: taskViews.id,
  name: taskViews.name,
  config: taskViews.config,
  ownerId: taskViews.ownerId,
  acl: taskViews.acl,
  isTeamDefault: taskViews.isTeamDefault,
};

const NOT_FOUND_MESSAGE = 'Vue introuvable.';

function toView(
  ctx: TenantContext,
  { acl, ...row }: Omit<ViewRow, 'team'> & { acl: string[] },
): ViewRow {
  return { ...row, team: acl.includes(ctx.tenantId) };
}

// La RLS laisse tout membre modifier une vue d'équipe : seul l'auteur le peut, ce que la
// condition sur `ownerId` garantit ici.
const ownView = (ctx: TenantContext, id: string) =>
  and(eq(taskViews.id, id), eq(taskViews.ownerId, ctx.userId));

export async function listViews(ctx: TenantContext): Promise<ViewRow[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.select(VIEW_COLUMNS).from(taskViews).orderBy(asc(taskViews.createdAt), asc(taskViews.id)),
  );
  return rows.map((row) => toView(ctx, row));
}

export async function getView(ctx: TenantContext, id: string): Promise<ViewRow | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx.select(VIEW_COLUMNS).from(taskViews).where(eq(taskViews.id, id)),
  );
  return row ? toView(ctx, row) : null;
}

// Une vue d'équipe a pour ACL l'organisation ; une vue personnelle, son auteur seul.
export async function createView(
  ctx: TenantContext,
  input: { name: string; config: ViewConfig; team: boolean },
): Promise<ViewRow> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .insert(taskViews)
      .values({
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        name: input.name,
        config: input.config,
        acl: [input.team ? ctx.tenantId : ctx.userId],
      })
      .returning(VIEW_COLUMNS),
  );
  if (!row) throw new Error('vue non créée');
  return toView(ctx, row);
}

export async function updateView(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; config?: ViewConfig },
): Promise<void> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(taskViews)
      .set({ name: patch.name, config: patch.config, updatedAt: sql`now()` })
      .where(ownView(ctx, id))
      .returning({ id: taskViews.id }),
  );
  if (rows.length === 0) throw new TaskError('not_found', NOT_FOUND_MESSAGE);
}

export async function deleteView(ctx: TenantContext, id: string): Promise<void> {
  const rows = await withTenant(ctx, (tx) =>
    tx.delete(taskViews).where(ownView(ctx, id)).returning({ id: taskViews.id }),
  );
  if (rows.length === 0) throw new TaskError('not_found', NOT_FOUND_MESSAGE);
}

// Choisir le défaut de l'équipe n'est pas modifier la vue : tout membre le peut. Au plus un
// défaut par organisation (index unique, non différable) : on retire l'ancien avant de poser le
// nouveau, dans la même transaction, et `null` ne laisse aucun défaut.
export async function setTeamDefault(ctx: TenantContext, viewId: string | null): Promise<void> {
  await orConflict('Le défaut de l’équipe vient de changer. Réessayez.', () =>
    withTenant(ctx, async (tx) => {
      await tx
        .update(taskViews)
        .set({ isTeamDefault: false })
        .where(eq(taskViews.isTeamDefault, true));
      if (viewId === null) return;
      const rows = await tx
        .update(taskViews)
        .set({ isTeamDefault: true })
        .where(and(eq(taskViews.id, viewId), arrayContains(taskViews.acl, [ctx.tenantId])))
        .returning({ id: taskViews.id });
      if (rows.length === 0) throw new TaskError('not_found', 'Vue d’équipe introuvable.');
    }),
  );
}

// Le défaut de l'équipe, ou celui de Leon quand l'équipe n'en a pas choisi.
export async function getTeamDefaultConfig(ctx: TenantContext): Promise<ViewConfig> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ config: taskViews.config })
      .from(taskViews)
      .where(eq(taskViews.isTeamDefault, true)),
  );
  return row?.config ?? DEFAULT_VIEW_CONFIG;
}
