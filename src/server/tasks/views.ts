import { and, arrayContains, asc, eq, sql } from 'drizzle-orm';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { withoutContext } from '@/lib/tasks/view-context';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskViews } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
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
const DEFAULT_CHANGED_MESSAGE = 'Le défaut de l’équipe vient de changer. Réessayez.';

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

// Au plus un défaut par organisation (index unique, non différable) : l'ancien est retiré avant que
// le nouveau soit posé, dans la même transaction.
const clearTeamDefault = (tx: Tx) =>
  tx.update(taskViews).set({ isTeamDefault: false }).where(eq(taskViews.isTeamDefault, true));

// Une vue d'équipe a pour ACL l'organisation ; une vue personnelle, son auteur seul. `makeDefault`
// (vue d'équipe seulement : la base le vérifie) en fait le défaut de l'équipe, dans la même
// transaction : si la vue n'est pas créée, l'ancien défaut reste. Seul l'index du défaut peut
// refuser l'insertion.
export async function createView(
  ctx: TenantContext,
  input: { name: string; config: ViewConfig; team: boolean; makeDefault?: boolean },
): Promise<ViewRow> {
  const makeDefault = input.makeDefault === true;
  const [row] = await orConflict(DEFAULT_CHANGED_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      if (makeDefault) await clearTeamDefault(tx);
      return tx
        .insert(taskViews)
        .values({
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          name: input.name,
          config: input.config,
          acl: [input.team ? ctx.tenantId : ctx.userId],
          isTeamDefault: makeDefault,
        })
        .returning(VIEW_COLUMNS);
    }),
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

// Choisir le défaut de l'équipe n'est pas modifier la vue : tout membre le peut. `null` ne laisse
// aucun défaut.
export async function setTeamDefault(ctx: TenantContext, viewId: string | null): Promise<void> {
  await orConflict(DEFAULT_CHANGED_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      await clearTeamDefault(tx);
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

// Le défaut de l'équipe, ou celui de Leon quand l'équipe n'en a pas choisi. Il ne porte jamais de
// contexte, même si la vue choisie en a un : chaque liste garde le sien.
export async function getTeamDefaultConfig(ctx: TenantContext): Promise<ViewConfig> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ config: taskViews.config })
      .from(taskViews)
      .where(eq(taskViews.isTeamDefault, true)),
  );
  return row ? withoutContext(row.config) : DEFAULT_VIEW_CONFIG;
}
