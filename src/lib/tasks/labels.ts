// Libellés français des énumérations des tâches (C3).
import type {
  DueFilter,
  TaskPriority,
  TaskStatusCategory,
  ViewGrouping,
  ViewLayout,
  ViewOrdering,
  ViewProperty,
} from '@/lib/enums';

export const PRIORITY_LABELS = {
  urgent: 'Urgente',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
  none: 'Sans priorité',
} as const satisfies Record<TaskPriority, string>;

export const STATUS_CATEGORY_LABELS = {
  backlog: 'Backlog',
  todo: 'À faire',
  started: 'En cours',
  done: 'Terminé',
  canceled: 'Annulé',
} as const satisfies Record<TaskStatusCategory, string>;

export const VIEW_LAYOUT_LABELS = {
  list: 'Liste',
  board: 'Tableau',
} as const satisfies Record<ViewLayout, string>;

export const VIEW_GROUPING_LABELS = {
  status: 'Statut',
  priority: 'Priorité',
  assignee: 'Assigné',
  project: 'Projet',
  label: 'Étiquette',
  none: 'Aucun',
} as const satisfies Record<ViewGrouping, string>;

export const VIEW_ORDERING_LABELS = {
  manual: 'Manuel',
  priority: 'Priorité',
  due_date: 'Échéance',
  created: 'Création',
  updated: 'Mise à jour',
} as const satisfies Record<ViewOrdering, string>;

export const VIEW_PROPERTY_LABELS = {
  id: 'Identifiant',
  status: 'Statut',
  priority: 'Priorité',
  labels: 'Étiquettes',
  project: 'Projet',
  assignee: 'Assigné',
  due_date: 'Échéance',
  subtasks: 'Sous-tâches',
  parent: 'Parent',
  status_age: 'Dans ce statut depuis',
  created: 'Création',
  updated: 'Mise à jour',
} as const satisfies Record<ViewProperty, string>;

export const DUE_FILTER_LABELS = {
  overdue: 'En retard',
  week: 'Cette semaine',
  none: 'Sans échéance',
} as const satisfies Record<DueFilter, string>;

// Groupes de valeur absente, toujours rangés en dernier ; leur clé est 'none'.
export const EMPTY_GROUP_LABELS = {
  assignee: 'Sans assigné',
  label: 'Sans étiquette',
  project: 'Sans projet',
} as const;

// Le refus de retirer le dernier statut d'une catégorie : le serveur le dit, et la liste des
// réglages le répète dans l'infobulle du bouton désactivé.
export const LAST_OF_CATEGORY_MESSAGE = 'Chaque catégorie garde au moins un statut.';
