import { asc, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { taskEvents, tasks } from '@/server/db/schema/tasks';
import { listLabels } from '@/server/tasks/labels';
import { ensureDefaultProject, listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';
import { adminDb } from './db';
import { createTestTenant } from './fixtures';

const STATUS_LABELS = [
  'Backlog',
  'À faire',
  'En cours',
  'En revue',
  'Terminé',
  'Annulé',
  'Doublon',
] as const;
const LABEL_NAMES = ['Bug', 'Fonctionnalité', 'Amélioration'] as const;

// Scénario des tâches : Paul et Marie partagent le projet « Atelier Nord » (clé ATE, statuts et
// étiquettes par défaut), Zoé est dans une autre organisation, avec son propre projet.
export type TasksScenario = {
  paul: TenantContext;
  marie: TenantContext;
  zoe: TenantContext;
  projectId: string;
  zoeProjectId: string;
  // libellé → identifiant
  status: Record<(typeof STATUS_LABELS)[number], string>;
  label: Record<(typeof LABEL_NAMES)[number], string>;
};

// Associe chaque nom attendu à l'identifiant de la ligne qui le porte.
function idsBy<K extends string, T extends { id: string }>(
  names: readonly K[],
  rows: readonly T[],
  nameOf: (row: T) => string,
): Record<K, string> {
  return Object.fromEntries(
    names.map((name) => {
      const row = rows.find((candidate) => nameOf(candidate) === name);
      if (!row) throw new Error(`${name} absent du scénario`);
      return [name, row.id];
    }),
  ) as Record<K, string>;
}

async function firstProject(ctx: TenantContext, name: string): Promise<string> {
  await ensureDefaultProject(ctx, name);
  const [project] = await listProjects(ctx);
  if (!project) throw new Error('projet par défaut non créé');
  return project.id;
}

export async function seedTasksScenario(): Promise<TasksScenario> {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [paul, marie] = team.members;
  const [zoe] = other.members;
  if (!paul || !marie || !zoe) throw new Error('membres du scénario non créés');
  const projectId = await firstProject(paul, 'Atelier Nord');
  const zoeProjectId = await firstProject(zoe, 'Cabinet Zoé');
  const statuses = await listStatuses(paul, projectId);
  const labels = await listLabels(paul);
  return {
    paul,
    marie,
    zoe,
    projectId,
    zoeProjectId,
    status: idsBy(STATUS_LABELS, statuses, (status) => status.label),
    label: idsBy(LABEL_NAMES, labels, (label) => label.name),
  };
}

// Lectures hors RLS, pour vérifier ce que les fonctions du serveur ont écrit.
export async function readTask(id: string) {
  const [row] = await adminDb.select().from(tasks).where(eq(tasks.id, id));
  if (!row) throw new Error('tâche absente');
  return row;
}

// Les événements d'une même écriture partagent l'heure de la transaction : l'ordre secondaire est le type.
export function readEvents(taskId: string) {
  return adminDb
    .select({
      kind: taskEvents.kind,
      payload: taskEvents.payload,
      actorId: taskEvents.actorId,
      actorKind: taskEvents.actorKind,
      client: taskEvents.client,
    })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.createdAt), asc(taskEvents.kind));
}
