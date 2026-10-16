import { sameConfig, type ViewConfig } from './view-config';

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

// Le défaut de l'équipe règle l'affichage et les filtres communs, jamais le contexte : le projet,
// « Mes tâches » et la recherche restreignent une liste, chacune la sienne, et un défaut qui les
// porterait les imposerait à toutes.
export function withoutContext(config: ViewConfig): ViewConfig {
  const { assignee } = config.filters;
  return {
    ...config,
    filters: {
      ...config.filters,
      projectId: null,
      creator: null,
      assignee: assignee === 'me' ? null : assignee,
      q: '',
    },
  };
}

type OpenViewState = { isTeamDefault: boolean };

// Ce que la barre d'outils compare à l'affichage. Une vue ouverte se compare à ses réglages
// enregistrés (`base`) ; sans vue, à la liste que la navigation ouvre dans ce contexte. L'affichage
// est le défaut de l'équipe quand il n'a pas bougé : la vue ouverte l'est ou non, une liste sans
// vue l'est si elle ne diffère de la base que par son contexte.
export function viewStatus(config: ViewConfig, base: ViewConfig, view: OpenViewState | null) {
  const reference = view ? base : contextConfig(config, base);
  const modified = !sameConfig(config, reference);
  const isTeamDefault = view
    ? view.isTeamDefault && !modified
    : sameConfig(withoutContext(config), base);
  return { reference, modified, isTeamDefault };
}
