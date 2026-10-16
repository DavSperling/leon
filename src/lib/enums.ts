// Énumérations partagées par le schéma, la mémoire, le pipeline et l'interface. Module pur : aucun import.
export const CARD_STATUSES = ['confirmed', 'unconfirmed'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const FACT_STATUSES = ['active', 'superseded', 'conflict', 'pending_review'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
export const SENSITIVE_CATEGORIES = ['rh', 'remuneration', 'juridique', 'sante', 'perso'] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

// Tâches : l'ordre de TASK_PRIORITIES est l'ordre de tri (urgente d'abord, sans priorité en dernier),
// celui de TASK_STATUS_CATEGORIES l'ordre d'affichage des statuts.
export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_STATUS_CATEGORIES = ['backlog', 'todo', 'started', 'done', 'canceled'] as const;
export type TaskStatusCategory = (typeof TASK_STATUS_CATEGORIES)[number];
export const TASK_ORIGINS = ['ui', 'mcp'] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];
export const TASK_ACTOR_KINDS = ['user', 'agent'] as const;
export type TaskActorKind = (typeof TASK_ACTOR_KINDS)[number];
export const TASK_EVENT_KINDS = [
  'created',
  'title',
  'description',
  'status',
  'priority',
  'assignee',
  'labels',
  'due_date',
  'parent',
  'project',
  'comment',
] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

// Réglages d'affichage d'une vue de tâches.
export const VIEW_LAYOUTS = ['list', 'board'] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];
export const VIEW_GROUPINGS = [
  'status',
  'priority',
  'assignee',
  'project',
  'label',
  'none',
] as const;
export type ViewGrouping = (typeof VIEW_GROUPINGS)[number];
export const VIEW_ORDERINGS = ['manual', 'priority', 'due_date', 'created', 'updated'] as const;
export type ViewOrdering = (typeof VIEW_ORDERINGS)[number];
export const VIEW_PROPERTIES = [
  'id',
  'status',
  'priority',
  'labels',
  'project',
  'assignee',
  'due_date',
  'subtasks',
  'parent',
  'status_age',
  'created',
  'updated',
] as const;
export type ViewProperty = (typeof VIEW_PROPERTIES)[number];
export const DUE_FILTERS = ['overdue', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
