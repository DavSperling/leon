import { describe, expect, it } from 'vitest';
import { DATA_GUARD_LINE } from '@/server/memory/render-card';
import type { ActivityItem } from './activity';
import { renderTaskMarkdown } from './task-markdown';
import type { TaskDetail } from './tasks';

const task: TaskDetail = {
  id: 'task-id',
  ref: 'LEO-12',
  projectId: 'project-id',
  projectKey: 'LEO',
  number: 12,
  title: 'Brancher le paiement',
  statusId: 'status-id',
  statusLabel: 'En cours',
  statusColor: '#d97706',
  statusCategory: 'started',
  priority: 'high',
  assignee: { id: 'amos', name: 'Amos Koskas', initials: 'AK' },
  creatorId: 'amos',
  dueDate: '2026-10-20',
  labels: [{ id: 'bug', name: 'Bug', color: '#dc2626' }],
  parentRef: null,
  subtaskCount: 0,
  subtaskDoneCount: 0,
  position: 1,
  statusChangedAt: new Date('2026-10-14T10:00:00Z'),
  createdAt: new Date('2026-10-14T10:00:00Z'),
  updatedAt: new Date('2026-10-14T10:00:00Z'),
  descriptionMd: 'Brancher **Stripe**.',
  creator: { id: 'amos', name: 'Amos Koskas', initials: 'AK' },
  subtasks: [],
  parent: null,
};

function comment(index: number, overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: `comment-${index}`,
    taskRef: 'LEO-12',
    taskTitle: task.title,
    kind: 'comment',
    actor: { id: 'amos', name: 'Amos Koskas', initials: 'AK' },
    actorKind: 'user',
    client: null,
    payload: {},
    body: `Commentaire ${index}`,
    createdAt: new Date(`2026-10-1${index}T10:00:00Z`),
    ...overrides,
  };
}

const statuses = [
  { id: 'a', projectId: 'p', label: 'À faire', color: '#6b7280', category: 'todo', position: 0 },
  {
    id: 'b',
    projectId: 'p',
    label: 'En cours',
    color: '#d97706',
    category: 'started',
    position: 1,
  },
] as const;
const labels = [{ id: 'bug', name: 'Bug', color: '#dc2626' }];

const render = (overrides: Partial<Parameters<typeof renderTaskMarkdown>[0]> = {}) =>
  renderTaskMarkdown({ task, activity: [], statuses, labels, ...overrides });

describe('renderTaskMarkdown', () => {
  it('commence par l’identifiant et le titre, puis la ligne de garde, les propriétés et le lien', () => {
    const lines = render().split('\n');

    expect(lines.slice(0, 2)).toEqual(['# LEO-12 Brancher le paiement', DATA_GUARD_LINE]);
    expect(lines).toContain('- Statut : En cours');
    expect(lines).toContain('- Priorité : Haute');
    expect(lines).toContain('- Assigné : Amos Koskas');
    expect(lines).toContain('- Étiquettes : Bug');
    expect(lines).toContain('- Échéance : 2026-10-20');
    expect(lines).toContain('- Lien : http://localhost:3000/taches/LEO-12');
  });

  it('liste les statuts et les étiquettes disponibles', () => {
    const text = render();

    expect(text).toContain('## Statuts disponibles\nÀ faire, En cours');
    expect(text).toContain('## Étiquettes disponibles\nBug');
  });

  it('met le titre, les sous-tâches et le parent sur une seule ligne chacun', () => {
    const text = render({
      task: {
        ...task,
        title: 'Titre\n## Faux titre',
        parent: { ref: 'LEO-3', title: 'Parent\n- faux' },
        subtasks: [{ ...task, ref: 'LEO-13', title: 'Sous\n# tâche' }],
      },
    });

    expect(text).toContain('# LEO-12 Titre ## Faux titre\n');
    expect(text).toContain('- Parent : LEO-3 · Parent - faux');
    expect(text).toContain('## Sous-tâches\n- LEO-13 · En cours · Sous # tâche');
  });

  it('coupe une description trop longue et omet les sections vides', () => {
    const long = render({ task: { ...task, descriptionMd: 'a'.repeat(5_000) } });
    const empty = render({ task: { ...task, descriptionMd: '  ' } });

    expect(long).toContain(`${'a'.repeat(3_000)}… (tronqué)`);
    expect(long).not.toContain('a'.repeat(3_001));
    expect(empty).not.toContain('## Description');
    expect(empty).not.toContain('## Sous-tâches');
    expect(empty).not.toContain('## Derniers commentaires');
  });

  it('ne garde que les 5 derniers commentaires, sans les événements, signés de leur auteur', () => {
    const activity = [
      ...[1, 2, 3, 4, 5, 6].map((index) => comment(index)),
      comment(7, { kind: 'status', body: null }),
      comment(8, { actorKind: 'agent', client: 'claude-code', body: `long ${'x'.repeat(900)}` }),
    ];

    const text = render({ activity });

    expect(text).not.toContain(': Commentaire 2');
    expect(text).toContain('- 2026-10-13 · Amos Koskas : Commentaire 3');
    expect(text).toContain('- 2026-10-16 · Amos Koskas : Commentaire 6');
    expect(text).toContain(
      `- 2026-10-18 · Claude Code (agent) : long ${'x'.repeat(495)}… (tronqué)`,
    );
    expect(text).not.toContain('Commentaire 7');
  });
});
