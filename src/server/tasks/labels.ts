import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskLabels } from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { distinctList, isEmptyPatch, orConflict, TaskError } from './errors';

export type LabelRow = { id: string; name: string; color: string };

const LABEL_COLUMNS = { id: taskLabels.id, name: taskLabels.name, color: taskLabels.color };
const DUPLICATE_MESSAGE = 'Une étiquette porte déjà ce nom.';

export function listLabels(ctx: TenantContext): Promise<LabelRow[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select(LABEL_COLUMNS)
      .from(taskLabels)
      .orderBy(asc(sql`lower(${taskLabels.name})`), asc(taskLabels.id)),
  );
}

// Le nom est unique sans tenir compte de la casse (index task_labels_name_idx).
export function createLabel(
  ctx: TenantContext,
  input: { name: string; color: string },
): Promise<LabelRow> {
  return orConflict(DUPLICATE_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      // Le spread vient d'abord : l'entrée ne peut écraser ni le tenant ni l'ACL.
      const [label] = await tx
        .insert(taskLabels)
        .values({ ...input, tenantId: ctx.tenantId, acl: [ctx.tenantId] })
        .returning(LABEL_COLUMNS);
      if (!label) throw new Error('étiquette non créée');
      return label;
    }),
  );
}

export function updateLabel(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  if (isEmptyPatch(patch)) return Promise.resolve();
  return orConflict(DUPLICATE_MESSAGE, () =>
    withTenant(ctx, async (tx) => {
      const rows = await tx
        .update(taskLabels)
        .set(patch)
        .where(eq(taskLabels.id, id))
        .returning({ id: taskLabels.id });
      if (rows.length === 0) throw new TaskError('not_found', 'Étiquette introuvable.');
    }),
  );
}

// Les liens vers les tâches partent avec l'étiquette (cascade). Les vues enregistrées gardent leur
// filtre d'étiquette : la RLS cache à celui qui supprime les vues personnelles des autres, aucun
// nettoyage ne serait complet. Le filtre devient une pastille « Inconnu », que l'on retire.
export async function deleteLabel(ctx: TenantContext, id: string): Promise<void> {
  const rows = await withTenant(ctx, (tx) =>
    tx.delete(taskLabels).where(eq(taskLabels.id, id)).returning({ id: taskLabels.id }),
  );
  if (rows.length === 0) throw new TaskError('not_found', 'Étiquette introuvable.');
}

// Les étiquettes visibles dont le nom, sans tenir compte de la casse, est dans `names` ;
// un nom inconnu est simplement absent du résultat.
export async function findLabelsByName(
  ctx: TenantContext,
  names: readonly string[],
): Promise<LabelRow[]> {
  const lowered = distinctList(names.map((name) => name.toLowerCase()));
  if (lowered.length === 0) return [];
  return withTenant(ctx, (tx) =>
    tx
      .select(LABEL_COLUMNS)
      .from(taskLabels)
      .where(inArray(sql`lower(${taskLabels.name})`, lowered))
      .orderBy(asc(sql`lower(${taskLabels.name})`), asc(taskLabels.id)),
  );
}

// Nom de chaque étiquette visible parmi `ids` ; une étiquette invisible ou absente manque à la carte.
export async function labelNamesById(tx: Tx, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: taskLabels.id, name: taskLabels.name })
    .from(taskLabels)
    .where(inArray(taskLabels.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.name]));
}
