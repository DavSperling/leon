import { describe, expect, it } from 'vitest';
import { type GroupableTask, type GroupContext, groupTasks } from './group';

const CONTEXT: GroupContext = {
  statuses: [
    { id: 's-done', label: 'Terminé', category: 'done', position: 1 },
    { id: 's-todo-2', label: 'En attente', category: 'todo', position: 2 },
    { id: 's-started', label: 'En cours', category: 'started', position: 1 },
    { id: 's-backlog', label: 'Backlog', category: 'backlog', position: 5 },
    { id: 's-todo-1', label: 'À faire', category: 'todo', position: 1 },
  ],
  members: [
    { id: 'u-amos', name: 'Amos' },
    { id: 'u-david', name: 'David' },
  ],
  labels: [
    { id: 'l-bug', name: 'Bug' },
    { id: 'l-feature', name: 'Fonctionnalité' },
  ],
  projects: [
    { id: 'p-leo', name: 'Leon' },
    { id: 'p-site', name: 'Site' },
  ],
};

let counter = 0;
function task(overrides: Partial<GroupableTask> & { id?: string } = {}) {
  counter += 1;
  return {
    id: `t${counter}`,
    statusId: 's-todo-1',
    priority: 'none',
    assignee: null,
    projectId: 'p-leo',
    labels: [],
    position: counter,
    dueDate: null,
    createdAt: new Date(2026, 0, counter),
    updatedAt: new Date(2026, 1, counter),
    ...overrides,
  } satisfies GroupableTask & { id: string };
}

const config = {
  groupBy: 'status',
  orderBy: 'manual',
  showEmptyGroups: false,
} as const;

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('groupTasks par statut', () => {
  const rows = [
    task({ id: 'a', statusId: 's-done' }),
    task({ id: 'b', statusId: 's-backlog' }),
    task({ id: 'c', statusId: 's-todo-2' }),
    task({ id: 'd', statusId: 's-todo-1' }),
    task({ id: 'e', statusId: 's-started' }),
  ];

  it('range les statuts par catégorie puis par position', () => {
    const groups = groupTasks(rows, config, CONTEXT);
    expect(groups.map((group) => group.label)).toEqual([
      'Backlog',
      'À faire',
      'En attente',
      'En cours',
      'Terminé',
    ]);
    expect(groups.map((group) => ids(group.rows))).toEqual([['b'], ['d'], ['c'], ['e'], ['a']]);
    expect(groups.map((group) => group.key)).toEqual([
      's-backlog',
      's-todo-1',
      's-todo-2',
      's-started',
      's-done',
    ]);
  });

  it('masque les groupes vides, sauf si la vue les demande', () => {
    const some = rows.filter((row) => row.statusId === 's-started');
    expect(groupTasks(some, config, CONTEXT).map((group) => group.key)).toEqual(['s-started']);
    const all = groupTasks(some, { ...config, showEmptyGroups: true }, CONTEXT);
    expect(all).toHaveLength(5);
    expect(all.filter((group) => group.rows.length > 0).map((group) => group.key)).toEqual([
      's-started',
    ]);
  });

  it('garde une tâche dont le statut manque au contexte, dans un groupe « Autre »', () => {
    const groups = groupTasks([task({ id: 'x', statusId: 's-new' }), ...rows], config, CONTEXT);
    expect(groups.at(-1)).toMatchObject({ key: 'other', label: 'Autre' });
    expect(ids(groups.at(-1)?.rows ?? [])).toEqual(['x']);
  });
});

describe('groupTasks par étiquette', () => {
  const rows = [
    task({ id: 'a', labels: [{ id: 'l-bug' }, { id: 'l-feature' }] }),
    task({ id: 'b', labels: [] }),
    task({ id: 'c', labels: [{ id: 'l-feature' }] }),
  ];

  it('place une tâche à deux étiquettes dans chaque groupe', () => {
    const groups = groupTasks(rows, { ...config, groupBy: 'label' }, CONTEXT);
    expect(groups.map((group) => [group.label, ids(group.rows)])).toEqual([
      ['Bug', ['a']],
      ['Fonctionnalité', ['a', 'c']],
      ['Sans étiquette', ['b']],
    ]);
  });

  it('réunit les étiquettes inconnues du contexte dans un seul groupe « Autre », avant « Sans étiquette »', () => {
    const x = task({ id: 'x', labels: [{ id: 'l-new' }, { id: 'l-bug' }] });
    const groups = groupTasks(
      [...rows, x],
      { ...config, groupBy: 'label' },
      { ...CONTEXT, labels: [{ id: 'l-bug', name: 'Bug' }] },
    );
    expect(groups.map((group) => [group.label, ids(group.rows)])).toEqual([
      ['Bug', ['a', 'x']],
      ['Autre', ['a', 'c', 'x']],
      ['Sans étiquette', ['b']],
    ]);
  });
});

describe('groupTasks par assigné', () => {
  it('range « Sans assigné » en dernier', () => {
    const rows = [
      task({ id: 'a', assignee: null }),
      task({ id: 'b', assignee: { id: 'u-david' } }),
      task({ id: 'c', assignee: { id: 'u-amos' } }),
    ];
    const groups = groupTasks(rows, { ...config, groupBy: 'assignee' }, CONTEXT);
    expect(groups.map((group) => [group.key, group.label, ids(group.rows)])).toEqual([
      ['u-amos', 'Amos', ['c']],
      ['u-david', 'David', ['b']],
      ['none', 'Sans assigné', ['a']],
    ]);
  });

  it('affiche « Sans assigné » même vide avec les groupes vides', () => {
    const groups = groupTasks(
      [task({ assignee: { id: 'u-amos' } })],
      { ...config, groupBy: 'assignee', showEmptyGroups: true },
      CONTEXT,
    );
    expect(groups.map((group) => group.label)).toEqual(['Amos', 'David', 'Sans assigné']);
  });
});

describe('groupTasks par projet, priorité ou sans regroupement', () => {
  it('regroupe par projet, « Sans projet » en dernier', () => {
    const rows = [task({ id: 'a', projectId: 'p-site' }), task({ id: 'b', projectId: null })];
    const groups = groupTasks(rows, { ...config, groupBy: 'project' }, CONTEXT);
    expect(groups.map((group) => [group.label, ids(group.rows)])).toEqual([
      ['Site', ['a']],
      ['Sans projet', ['b']],
    ]);
  });

  it('regroupe par priorité dans l’ordre de tri', () => {
    const rows = [
      task({ id: 'a', priority: 'none' }),
      task({ id: 'b', priority: 'low' }),
      task({ id: 'c', priority: 'urgent' }),
      task({ id: 'd', priority: 'medium' }),
      task({ id: 'e', priority: 'high' }),
    ];
    const groups = groupTasks(rows, { ...config, groupBy: 'priority' }, CONTEXT);
    expect(groups.map((group) => group.label)).toEqual([
      'Urgente',
      'Haute',
      'Moyenne',
      'Basse',
      'Sans priorité',
    ]);
    expect(groups.map((group) => group.key)).toEqual(['urgent', 'high', 'medium', 'low', 'none']);
  });

  it('renvoie un seul groupe sans regroupement, et aucun s’il n’y a pas de tâche', () => {
    const rows = [task({ id: 'a' }), task({ id: 'b' })];
    const groups = groupTasks(rows, { ...config, groupBy: 'none' }, CONTEXT);
    expect(groups).toHaveLength(1);
    expect(ids(groups[0]?.rows ?? [])).toEqual(['a', 'b']);
    expect(groupTasks([], { ...config, groupBy: 'none' }, CONTEXT)).toEqual([]);
    expect(
      groupTasks([], { ...config, groupBy: 'none', showEmptyGroups: true }, CONTEXT),
    ).toHaveLength(1);
  });
});

describe('groupTasks, tri dans les groupes', () => {
  const sorted = (
    orderBy: 'manual' | 'priority' | 'due_date' | 'created' | 'updated',
    rows: ReturnType<typeof task>[],
  ) => ids(groupTasks(rows, { ...config, groupBy: 'none', orderBy }, CONTEXT)[0]?.rows ?? []);

  it('trie à la main par position', () => {
    expect(
      sorted('manual', [
        task({ id: 'a', position: 30 }),
        task({ id: 'b', position: -5 }),
        task({ id: 'c', position: 10 }),
      ]),
    ).toEqual(['b', 'c', 'a']);
  });

  it('trie par priorité, urgente d’abord, puis par position', () => {
    const rows = [
      task({ id: 'a', priority: 'none', position: 1 }),
      task({ id: 'b', priority: 'low', position: 2 }),
      task({ id: 'c', priority: 'urgent', position: 4 }),
      task({ id: 'd', priority: 'urgent', position: 3 }),
    ];
    expect(sorted('priority', rows)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('trie par échéance, sans échéance en dernier', () => {
    const rows = [
      task({ id: 'a', dueDate: null, position: 1 }),
      task({ id: 'b', dueDate: '2026-11-02', position: 2 }),
      task({ id: 'c', dueDate: '2026-10-20', position: 3 }),
      task({ id: 'd', dueDate: null, position: 0 }),
    ];
    expect(sorted('due_date', rows)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('trie par création et par mise à jour, le plus récent d’abord', () => {
    const rows = [
      task({ id: 'a', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-05-01') }),
      task({ id: 'b', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-15') }),
      task({ id: 'c', createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-06-01') }),
    ];
    expect(sorted('created', rows)).toEqual(['b', 'a', 'c']);
    expect(sorted('updated', rows)).toEqual(['c', 'a', 'b']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const rows = [task({ id: 'a', position: 2 }), task({ id: 'b', position: 1 })];
    sorted('manual', rows);
    expect(ids(rows)).toEqual(['a', 'b']);
  });
});
