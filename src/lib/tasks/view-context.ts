import type { ViewConfig } from './view-config';

// Le contexte d'une liste : « Toutes », « Mes tâches » ou un projet. Il se lit dans les filtres,
// comme la navigation le lit dans l'URL ; les vues enregistrées d'un même contexte forment ses onglets.
export type ViewContext = 'all' | 'mine' | `project:${string}`;

export function viewContextOf({ filters }: ViewConfig): ViewContext {
  if (filters.projectId) return `project:${filters.projectId}`;
  return filters.assignee === 'me' || filters.creator === 'me' ? 'mine' : 'all';
}

// Ce que la liste montre sans réglage dans son contexte : la base (défaut d'équipe), restreinte par
// le critère de navigation (projet, Mes tâches). « Réinitialiser » y revient, sans quitter le contexte.
export function contextConfig(config: ViewConfig, base: ViewConfig): ViewConfig {
  const { projectId, assignee, creator } = config.filters;
  const scope = projectId
    ? { projectId }
    : assignee === 'me'
      ? { assignee }
      : creator === 'me'
        ? { creator }
        : {};
  return { ...base, filters: { ...base.filters, ...scope } };
}
