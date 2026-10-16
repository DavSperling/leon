import { TASK_PRIORITIES, type TaskPriority, type ViewGrouping } from '@/lib/enums';
import { NONE_KEY } from '@/lib/tasks/group';
import type { ListContext } from './list-context';

// Une tâche choisie comme parent : de quoi l'afficher et en hériter le projet et la priorité.
export type ParentChoice = {
  id: string;
  ref: string;
  title: string;
  projectId: string;
  priority: TaskPriority;
};

type LabelChoice = ListContext['labels'][number];

// Les propriétés de la tâche en cours de création (hors titre et description).
export type TaskDraft = {
  projectId: string | undefined; // seulement absent s'il n'existe aucun projet
  statusId: string | undefined;
  priority: TaskPriority | undefined; // absent : « sans priorité », ou celle du parent
  assigneeId: string | null;
  labels: LabelChoice[];
  dueDate: string | null;
  parent: ParentChoice | null;
};

// Ce que « + » d'un groupe souffle à la création : le groupe dit où la tâche doit atterrir.
export type TaskPrefill = Partial<
  Pick<TaskDraft, 'projectId' | 'statusId' | 'priority' | 'assigneeId' | 'labels'>
>;

const has = (items: readonly { id: string }[], id: string): boolean =>
  items.some((item) => item.id === id);

// Le préremplissage d'un groupe. Une clé que le contexte ne connaît pas (« none », « other »)
// ne remplit rien, sauf « sans assigné » qui vaut un assigné vide.
export function groupPrefill(
  groupBy: ViewGrouping,
  key: string,
  context: ListContext,
): TaskPrefill {
  const priority = TASK_PRIORITIES.find((value) => value === key);
  const label = context.labels.find((candidate) => candidate.id === key);
  switch (groupBy) {
    case 'status':
      return has(context.statuses, key) ? { statusId: key } : {};
    case 'priority':
      return priority ? { priority } : {};
    case 'assignee':
      if (key === NONE_KEY) return { assigneeId: null };
      return has(context.members, key) ? { assigneeId: key } : {};
    case 'label':
      return label ? { labels: [label] } : {};
    case 'project':
      return has(context.projects, key) ? { projectId: key } : {};
    default:
      return {};
  }
}

// Le premier statut `backlog` du projet, à défaut le premier `todo` : comme le fait le serveur.
// `statuses` arrive rangé par catégorie puis par position.
export function defaultStatusId(
  statuses: ListContext['statuses'],
  projectId: string | undefined,
): string | undefined {
  const own = statuses.filter((status) => status.projectId === projectId);
  return (own.find((s) => s.category === 'backlog') ?? own.find((s) => s.category === 'todo'))?.id;
}

// Le projet vient du préremplissage, du statut visé, du filtre de projet de la vue, puis du premier projet.
export function initialDraft(
  prefill: TaskPrefill,
  filterProjectId: string | null,
  context: ListContext,
): TaskDraft {
  const prefilledStatus = context.statuses.find((status) => status.id === prefill.statusId);
  const projectId =
    prefill.projectId ?? prefilledStatus?.projectId ?? filterProjectId ?? context.projects[0]?.id;
  return {
    projectId,
    statusId: prefilledStatus?.id ?? defaultStatusId(context.statuses, projectId),
    priority: prefill.priority,
    assigneeId: prefill.assigneeId ?? null,
    labels: prefill.labels ?? [],
    dueDate: null,
    parent: null,
  };
}

// Un autre projet a d'autres statuts : le statut redevient celui par défaut. Une sous-tâche
// reste dans le projet de son parent, donc changer de projet retire le parent.
export function withProject(
  draft: TaskDraft,
  projectId: string,
  statuses: ListContext['statuses'],
): TaskDraft {
  if (projectId === draft.projectId) return draft;
  return {
    ...draft,
    projectId,
    statusId: defaultStatusId(statuses, projectId),
    parent: null,
  };
}

// Un parent donne son projet et, faute de choix, sa priorité ; l'ôter ne change rien d'autre.
export function withParent(
  draft: TaskDraft,
  parent: ParentChoice | null,
  statuses: ListContext['statuses'],
): TaskDraft {
  if (!parent) return { ...draft, parent: null };
  const inProject = withProject(draft, parent.projectId, statuses);
  return { ...inProject, parent, priority: inProject.priority ?? parent.priority };
}
