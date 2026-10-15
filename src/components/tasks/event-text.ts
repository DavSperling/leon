import { TASK_PRIORITIES, type TaskPriority } from '@/lib/enums';
import { formatDay } from '@/lib/tasks/dates';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import type { ActivityItem } from '@/server/tasks/activity';

// Les libellés des événements d'une tâche, tels que le fil d'activité les écrit (C8) :
// « Amos a changé le statut : À faire → En cours », « Claude Code (agent) a commenté ».

type Payload = ActivityItem['payload'];
type Names = ReadonlyMap<string, string>; // identifiant d'utilisateur → nom

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const change = (label: string, from: string, to: string) => `${label} : ${from} → ${to}`;

const priorityLabel = (value: unknown): string => {
  const priority = TASK_PRIORITIES.find(
    (candidate): candidate is TaskPriority => candidate === value,
  );
  return priority ? PRIORITY_LABELS[priority] : '?';
};

const dayLabel = (value: unknown): string => {
  const day = text(value);
  return day ? formatDay(day) : 'aucune';
};

const refLabel = (value: unknown): string => text(value) ?? 'aucun';

function labelsText({ added, removed }: { added: string[]; removed: string[] }): string {
  const one = (names: string[], verb: string) =>
    names.length === 0
      ? []
      : [`${verb} ${names.length > 1 ? 'les étiquettes' : 'l’étiquette'} ${names.join(', ')}`];
  return [...one(added, 'a ajouté'), ...one(removed, 'a retiré')].join(', ');
}

// Ce que l'événement a changé, sans l'auteur : « a changé le statut : À faire → En cours ».
export function eventText({ kind, payload }: ActivityItem, names: Names): string {
  const { from, to }: Payload = payload;
  const person = (id: unknown): string =>
    typeof id === 'string' ? (names.get(id) ?? 'un ancien membre') : 'personne';
  switch (kind) {
    case 'created':
      return 'a créé la tâche';
    case 'title':
      return `a ${change('changé le titre', `« ${text(from) ?? ''} »`, `« ${text(to) ?? ''} »`)}`;
    case 'description':
      return 'a modifié la description';
    case 'status':
      return `a ${change('changé le statut', text(from) ?? '?', text(to) ?? '?')}`;
    case 'priority':
      return `a ${change('changé la priorité', priorityLabel(from), priorityLabel(to))}`;
    case 'assignee':
      return `a ${change('changé l’assigné', person(from), person(to))}`;
    case 'labels':
      return labelsText({ added: strings(payload.added), removed: strings(payload.removed) });
    case 'due_date':
      return `a ${change('changé l’échéance', dayLabel(from), dayLabel(to))}`;
    case 'parent':
      return `a ${change('changé le parent', refLabel(from), refLabel(to))}`;
    case 'project':
      return `a ${change('changé de projet', refLabel(from), refLabel(to))}`;
    case 'comment':
      return 'a commenté';
  }
}
