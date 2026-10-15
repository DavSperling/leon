import { asc, eq, sql } from 'drizzle-orm';
import { projectKeyFrom } from '@/lib/tasks/ref';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskLabels, taskProjects, taskStatuses } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { isEmptyPatch, orConflict, TaskError } from './errors';

export type ProjectRow = { id: string; key: string; name: string };

const PROJECT_COLUMNS = { id: taskProjects.id, key: taskProjects.key, name: taskProjects.name };
const NAME_MAX_CHARS = 80;
const DUPLICATE_KEY_MESSAGE = 'Un projet porte déjà cette clé.';

// Les statuts de Linear, rangés par catégorie.
const DEFAULT_STATUSES = [
  { label: 'Backlog', color: '#9ca3af', category: 'backlog' },
  { label: 'À faire', color: '#6b7280', category: 'todo' },
  { label: 'En cours', color: '#d97706', category: 'started' },
  { label: 'En revue', color: '#059669', category: 'started' },
  { label: 'Terminé', color: '#4f46c8', category: 'done' },
  { label: 'Annulé', color: '#9ca3af', category: 'canceled' },
  { label: 'Doublon', color: '#9ca3af', category: 'canceled' },
] as const;

const DEFAULT_LABELS = [
  { name: 'Bug', color: '#dc2626' },
  { name: 'Fonctionnalité', color: '#7c3aed' },
  { name: 'Amélioration', color: '#2563eb' },
] as const;

export function listProjects(ctx: TenantContext): Promise<ProjectRow[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select(PROJECT_COLUMNS)
      .from(taskProjects)
      .orderBy(asc(taskProjects.createdAt), asc(taskProjects.id)),
  );
}

// Les clés étrangères ignorent la RLS : un projet doit être lu pour qu'on y rattache quoi que ce soit.
export async function assertProject(tx: Tx, projectId: string): Promise<void> {
  const count = await tx.$count(taskProjects, eq(taskProjects.id, projectId));
  if (count === 0) throw new TaskError('not_found', 'Projet introuvable.');
}

async function insertProject(
  tx: Tx,
  ctx: TenantContext,
  input: { name: string; key: string },
): Promise<ProjectRow> {
  const [project] = await tx
    .insert(taskProjects)
    .values({ tenantId: ctx.tenantId, acl: [ctx.tenantId], ...input })
    .returning(PROJECT_COLUMNS);
  if (!project) throw new Error('projet non créé');
  return project;
}

async function insertDefaultStatuses(tx: Tx, ctx: TenantContext, projectId: string): Promise<void> {
  await tx.insert(taskStatuses).values(
    DEFAULT_STATUSES.map((status, position) => ({
      tenantId: ctx.tenantId,
      projectId,
      position,
      ...status,
    })),
  );
}

// Le verrou consultatif (relâché à la fin de la transaction) range les appels concurrents l'un
// derrière l'autre : le premier crée, les suivants voient le projet et ne font rien.
export async function ensureDefaultProject(ctx: TenantContext, orgName: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(('x' || substr(md5(${ctx.tenantId}), 1, 16))::bit(64)::bigint)`,
    );
    if ((await tx.$count(taskProjects)) > 0) return;
    const name = orgName.trim().slice(0, NAME_MAX_CHARS);
    const project = await insertProject(tx, ctx, { name, key: projectKeyFrom(name) });
    await insertDefaultStatuses(tx, ctx, project.id);
    await tx
      .insert(taskLabels)
      .values(
        DEFAULT_LABELS.map((label) => ({ tenantId: ctx.tenantId, acl: [ctx.tenantId], ...label })),
      );
  });
}

export function createProject(
  ctx: TenantContext,
  input: { name: string; key: string },
): Promise<ProjectRow> {
  return orConflict(DUPLICATE_KEY_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      const project = await insertProject(tx, ctx, input);
      await insertDefaultStatuses(tx, ctx, project.id);
      return project;
    }),
  );
}

// Changer la clé change les identifiants affichés (LEO-12 → NEW-12) : le numéro, lui, reste.
export function updateProject(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; key?: string },
): Promise<void> {
  if (isEmptyPatch(patch)) return Promise.resolve();
  return orConflict(DUPLICATE_KEY_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      const rows = await tx
        .update(taskProjects)
        .set(patch)
        .where(eq(taskProjects.id, id))
        .returning({ id: taskProjects.id });
      if (rows.length === 0) throw new TaskError('not_found', 'Projet introuvable.');
    }),
  );
}
