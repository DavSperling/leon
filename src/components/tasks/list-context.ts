import type { ViewConfig } from '@/lib/tasks/view-config';
import type { LabelRow } from '@/server/tasks/labels';
import type { ProjectRow } from '@/server/tasks/projects';
import type { StatusRow } from '@/server/tasks/statuses';
import type { Person, TaskRow } from '@/server/tasks/task-row';

// Ce que la liste connaît de son entourage : de quoi regrouper, nommer, filtrer et modifier.
export type ListContext = {
  statuses: StatusRow[]; // ceux de tous les projets, libellés tels que saisis
  members: Person[];
  labels: LabelRow[];
  projects: ProjectRow[];
  viewerId: string; // « Moi » dans les sélecteurs
};

// Un changement de filtres, que les menus et les pastilles demandent à la barre d'outils.
export type FilterPatch = Partial<ViewConfig['filters']>;

// Les statuts dont la liste fait ses groupes : ceux du projet filtré. Deux projets ont chacun leur
// « Backlog » : sans filtre de projet, la clé du projet distingue les groupes.
export function groupStatuses(
  statuses: readonly StatusRow[],
  projects: readonly ProjectRow[],
  config: ViewConfig,
): StatusRow[] {
  const { projectId } = config.filters;
  if (projectId !== null) return projectStatuses(statuses, projectId);
  if (projects.length < 2) return [...statuses];
  const keys = new Map(projects.map((project) => [project.id, project.key]));
  return statuses.map((status) => ({
    ...status,
    label: `${status.label} · ${keys.get(status.projectId) ?? '?'}`,
  }));
}

// Les statuts qu'une tâche peut prendre : ceux de son projet.
export function projectStatuses(statuses: readonly StatusRow[], projectId: string): StatusRow[] {
  return statuses.filter((status) => status.projectId === projectId);
}

// Ce qu'une ligne ou une carte montre d'un statut, en attendant que le serveur confirme le changement.
export function shownStatus(
  status: StatusRow,
): Pick<TaskRow, 'statusId' | 'statusLabel' | 'statusColor' | 'statusCategory'> {
  return {
    statusId: status.id,
    statusLabel: status.label,
    statusColor: status.color,
    statusCategory: status.category,
  };
}
