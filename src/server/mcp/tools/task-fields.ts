import { z } from 'zod';
import { TASK_PRIORITIES, type TaskPriority } from '@/lib/enums';
import {
  DESCRIPTION_MAX_CHARS,
  LABEL_NAME_MAX_CHARS,
  PROJECT_KEY_MAX_CHARS,
  STATUS_LABEL_MAX_CHARS,
} from '@/lib/tasks/limits';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { findLabelsByName, listLabels } from '@/server/tasks/labels';
import { findMemberByEmail } from '@/server/tasks/members';
import { ensureDefaultProject, listProjects, type ProjectRow } from '@/server/tasks/projects';
import { listStatuses, type StatusRow } from '@/server/tasks/statuses';
import { getTaskByRef, type TaskDetail } from '@/server/tasks/tasks';
import { ToolInputError } from './guarded';

// Les champs d'une tâche tels qu'un agent les écrit : par leur nom, jamais par un identifiant interne.
// Ce fichier porte leurs schémas et leur traduction. Pour un champ qu'on peut vider, `null` ou
// « aucun » le vide ; un champ absent reste inchangé.
const CLEAR_WORD = 'aucun';
// Le nom d'une priorité, en entrée comme en sortie : task_list rend ce que task_update accepte.
export const PRIORITY_NAMES = {
  urgent: 'urgente',
  high: 'haute',
  medium: 'moyenne',
  low: 'basse',
  none: CLEAR_WORD,
} as const satisfies Record<TaskPriority, string>;

// Champs communs à la création et à la modification.
export const TaskFields = {
  description: z
    .string()
    .max(DESCRIPTION_MAX_CHARS)
    .optional()
    .describe('Description en Markdown.'),
  projet: z.string().max(PROJECT_KEY_MAX_CHARS).optional().describe('Clé du projet (LEO).'),
  statut: z
    .string()
    .max(STATUS_LABEL_MAX_CHARS)
    .optional()
    .describe(
      'Libellé d’un statut du projet (« En cours ») ou catégorie (backlog, todo, started, done, canceled) : le premier statut de la catégorie.',
    ),
  priorite: z
    .enum(Object.values(PRIORITY_NAMES))
    .nullable()
    .optional()
    .describe('Priorité ; « aucun » ou null pour la retirer.'),
  assigne: z
    .string()
    .max(254)
    .nullable()
    .optional()
    .describe('« moi » ou l’e-mail d’un membre ; « aucun » ou null pour retirer l’assigné.'),
  echeance: z
    .union([z.iso.date(), z.literal(CLEAR_WORD)])
    .nullable()
    .optional()
    .describe('Échéance AAAA-MM-JJ ; « aucun » ou null pour la retirer.'),
  parent: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe('Identifiant de la tâche parente (LEO-3) ; « aucun » ou null pour la retirer.'),
};

export const LabelNames = z.array(z.string().min(1).max(LABEL_NAME_MAX_CHARS)).max(20);

export const TaskTitle = z.string().trim().min(1).max(200);

// undefined : champ absent ; null : à vider (null, texte vide ou « aucun ») ; sinon la valeur, sans espaces autour.
export function clearable(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const text = value.trim();
  return text === '' || text.toLowerCase() === CLEAR_WORD ? null : text;
}

export function priorityOf(name: string | null | undefined): TaskPriority | undefined {
  const text = clearable(name);
  if (text === undefined) return undefined;
  return text === null
    ? 'none'
    : TASK_PRIORITIES.find((priority) => PRIORITY_NAMES[priority] === text);
}

// L'organisation qui n'a jamais ouvert /taches n'a pas encore de projet : on crée celui par défaut.
export async function projectsOf(ctx: TenantContext): Promise<ProjectRow[]> {
  const projects = await listProjects(ctx);
  if (projects.length > 0) return projects;
  const { organizationName } = await getViewerProfile(ctx);
  await ensureDefaultProject(ctx, organizationName);
  return listProjects(ctx);
}

// Sans clé, le projet est celui de l'organisation s'il est seul ; sinon l'agent doit choisir.
// La liste est vide pour task_list dans une organisation qui n'a pas encore de projet.
export function pickProject(projects: readonly ProjectRow[], key: string | undefined): ProjectRow {
  const keys = projects.map((project) => project.key).join(', ') || 'aucun';
  const [only] = projects;
  if (key === undefined) {
    if (projects.length === 1 && only) return only;
    throw new ToolInputError(`Précisez le projet. Projets : ${keys}.`);
  }
  const found = projects.find((project) => project.key === key.trim().toUpperCase());
  if (!found) throw new ToolInputError(`Projet inconnu. Projets : ${keys}.`);
  return found;
}

export async function findTask(ctx: TenantContext, ref: string): Promise<TaskDetail> {
  const task = await getTaskByRef(ctx, ref.trim());
  if (!task) throw new ToolInputError(`Tâche introuvable : ${ref.trim()}.`);
  return task;
}

export async function parentIdOf(
  ctx: TenantContext,
  ref: string | null | undefined,
): Promise<string | null | undefined> {
  const text = clearable(ref);
  return text ? (await findTask(ctx, text)).id : text;
}

// Libellé du statut (sans tenir compte de la casse), sinon catégorie : le premier statut de celle-ci.
function pickStatus(statuses: readonly StatusRow[], name: string): StatusRow {
  const wanted = name.trim().toLowerCase();
  const found =
    statuses.find((status) => status.label.toLowerCase() === wanted) ??
    statuses.find((status) => status.category === wanted);
  if (!found) {
    throw new ToolInputError(
      `Statut inconnu. Statuts : ${statuses.map((status) => status.label).join(', ')}.`,
    );
  }
  return found;
}

export async function statusIdOf(
  ctx: TenantContext,
  projectId: string,
  name: string | undefined,
): Promise<string | undefined> {
  if (name === undefined) return undefined;
  return pickStatus(await listStatuses(ctx, projectId), name).id;
}

export async function labelIdsOf(
  ctx: TenantContext,
  names: readonly string[] | undefined,
): Promise<string[] | undefined> {
  if (names === undefined) return undefined;
  const wanted = names.map((name) => name.trim());
  const found = await findLabelsByName(ctx, wanted);
  const known = new Set(found.map((label) => label.name.toLowerCase()));
  if (wanted.some((name) => !known.has(name.toLowerCase()))) {
    const available = (await listLabels(ctx)).map((label) => label.name).join(', ');
    throw new ToolInputError(`Étiquette inconnue. Étiquettes : ${available}.`);
  }
  return found.map((label) => label.id);
}

// « moi », l'e-mail d'un membre de l'organisation, ou rien. Un e-mail inconnu et celui d'une autre
// organisation donnent le même message.
export async function assigneeIdOf(
  ctx: TenantContext,
  who: string | null | undefined,
): Promise<string | null | undefined> {
  const text = clearable(who);
  if (!text) return text;
  if (text.toLowerCase() === 'moi') return ctx.userId;
  const member = await findMemberByEmail(ctx, text);
  if (!member) throw new ToolInputError('Membre introuvable.');
  return member.id;
}
