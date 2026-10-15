import { EMPTY_GROUP_LABELS, PRIORITY_LABELS } from '@/lib/tasks/labels';
import { actorLabel, isoDate, oneLine } from '@/server/memory/labels';
import { DATA_GUARD_LINE } from '@/server/memory/render-card';
import type { ActivityItem } from './activity';
import type { LabelRow } from './labels';
import type { StatusRow } from './statuses';
import { taskUrl } from './task-url';
import type { TaskDetail } from './tasks';

// La tâche en Markdown, pour un agent : l'outil MCP task_get et le bouton « Copier pour un agent ».
const DESCRIPTION_MAX_CHARS = 3_000;
const COMMENT_MAX_CHARS = 500;
const COMMENTS_SHOWN = 5;

export type TaskMarkdownInput = {
  task: TaskDetail;
  activity: readonly ActivityItem[]; // de listActivity : seuls les derniers commentaires sont repris
  statuses: readonly StatusRow[]; // ceux du projet de la tâche
  labels: readonly LabelRow[];
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}… (tronqué)`;
}

const listOf = (names: readonly string[], empty: string): string =>
  names.length > 0 ? names.map(oneLine).join(', ') : empty;

function properties(task: TaskDetail): string[] {
  return [
    `- Statut : ${oneLine(task.statusLabel)}`,
    `- Priorité : ${PRIORITY_LABELS[task.priority]}`,
    `- Assigné : ${task.assignee ? oneLine(task.assignee.name) : EMPTY_GROUP_LABELS.assignee}`,
    `- Étiquettes : ${listOf(
      task.labels.map((label) => label.name),
      'aucune',
    )}`,
    `- Échéance : ${task.dueDate ?? 'aucune'}`,
    `- Projet : ${task.projectKey}`,
    ...(task.parent ? [`- Parent : ${task.parent.ref} · ${oneLine(task.parent.title)}`] : []),
    ...(task.creator ? [`- Créée par : ${oneLine(task.creator.name)}`] : []),
    `- Lien : ${taskUrl(task.ref)}`,
  ];
}

function recentComments(activity: readonly ActivityItem[]): string[] {
  return activity
    .filter((item) => item.kind === 'comment' && item.body !== null)
    .slice(-COMMENTS_SHOWN)
    .map(
      (item) =>
        `- ${isoDate(item.createdAt)} · ${oneLine(actorLabel(item))} : ${truncate(oneLine(item.body ?? ''), COMMENT_MAX_CHARS)}`,
    );
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length > 0 ? ['', `## ${title}`, ...lines] : [];
}

export function renderTaskMarkdown({
  task,
  activity,
  statuses,
  labels,
}: TaskMarkdownInput): string {
  const description = task.descriptionMd.trim();
  return [
    `# ${task.ref} ${oneLine(task.title)}`,
    DATA_GUARD_LINE,
    ...properties(task),
    ...section(
      'Description',
      description === '' ? [] : [truncate(description, DESCRIPTION_MAX_CHARS)],
    ),
    ...section(
      'Sous-tâches',
      task.subtasks.map(
        (subtask) =>
          `- ${subtask.ref} · ${oneLine(subtask.statusLabel)} · ${oneLine(subtask.title)}`,
      ),
    ),
    ...section('Derniers commentaires', recentComments(activity)),
    ...section('Statuts disponibles', [
      listOf(
        statuses.map((status) => status.label),
        'aucun',
      ),
    ]),
    ...section('Étiquettes disponibles', [
      listOf(
        labels.map((label) => label.name),
        'aucune',
      ),
    ]),
  ].join('\n');
}
