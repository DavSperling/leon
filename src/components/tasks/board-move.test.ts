import { describe, expect, it } from 'vitest';
import {
  type Columns,
  canDragCards,
  changePatch,
  columnChange,
  columnOf,
  type Drag,
  dragOver,
  movesAcrossColumns,
  moveToColumn,
  settle,
  shownChange,
  startDrag,
  toColumns,
} from './board-move';

const STATUSES = [
  { id: 's-backlog', projectId: 'p1', label: 'Backlog', color: '#9ca3af', category: 'backlog' },
  { id: 's-started', projectId: 'p1', label: 'En cours', color: '#d97706', category: 'started' },
  { id: 's-other', projectId: 'p2', label: 'Backlog', color: '#9ca3af', category: 'backlog' },
].map((status, position) => ({ ...status, position })) as never;
const PAUL = { id: 'paul', name: 'Paul Martin', initials: 'PM' };
const CONTEXT = { statuses: STATUSES, members: [PAUL] };
const ROW = { projectId: 'p1' };

const columns = (): Columns => ({ a: ['1', '2', '3'], b: ['4'], c: [] });

describe('toColumns', () => {
  it('liste les identifiants de chaque groupe dans son ordre', () => {
    const groups = [
      { key: 'a', label: 'A', rows: [{ id: '1' }, { id: '2' }] },
      { key: 'b', label: 'B', rows: [] },
    ];

    expect(toColumns(groups)).toEqual({ a: ['1', '2'], b: [] });
  });
});

describe('columnOf', () => {
  it('rend la colonne qui contient la tâche, ou celle qui a cette clé', () => {
    expect(columnOf(columns(), '4')).toBe('b');
    expect(columnOf(columns(), 'c')).toBe('c');
  });

  it('ne confond pas un identifiant avec une propriété d’objet', () => {
    expect(columnOf(columns(), 'toString')).toBeUndefined();
    expect(columnOf(columns(), '9')).toBeUndefined();
  });
});

describe('canDragCards', () => {
  it.each([
    ['status', 'priority', true],
    ['priority', 'due_date', true],
    ['assignee', 'created', true],
    ['project', 'manual', true],
    ['none', 'manual', true],
    ['project', 'priority', false],
    ['none', 'updated', false],
    ['label', 'manual', false],
    ['label', 'priority', false],
  ] as const)('regroupé par %s, trié par %s : %s', (groupBy, orderBy, expected) => {
    expect(canDragCards(groupBy, orderBy)).toBe(expected);
  });

  it('ne change de colonne que pour le statut, la priorité et l’assigné', () => {
    expect(movesAcrossColumns('status')).toBe(true);
    expect(movesAcrossColumns('priority')).toBe(true);
    expect(movesAcrossColumns('assignee')).toBe(true);
    expect(movesAcrossColumns('project')).toBe(false);
    expect(movesAcrossColumns('label')).toBe(false);
    expect(movesAcrossColumns('none')).toBe(false);
  });
});

describe('columnChange', () => {
  it('range dans un statut du projet de la tâche', () => {
    expect(columnChange('status', 's-started', ROW, CONTEXT)).toEqual({
      field: 'status',
      value: 's-started',
    });
  });

  it('refuse le statut d’un autre projet et un statut inconnu', () => {
    expect(columnChange('status', 's-other', ROW, CONTEXT)).toBeNull();
    expect(columnChange('status', 'inconnu', ROW, CONTEXT)).toBeNull();
  });

  it('range dans une priorité, y compris « sans priorité »', () => {
    expect(columnChange('priority', 'urgent', ROW, CONTEXT)).toEqual({
      field: 'priority',
      value: 'urgent',
    });
    expect(columnChange('priority', 'none', ROW, CONTEXT)).toEqual({
      field: 'priority',
      value: 'none',
    });
    expect(columnChange('priority', 'critique', ROW, CONTEXT)).toBeNull();
  });

  it('range chez un membre, ou sans assigné', () => {
    expect(columnChange('assignee', 'paul', ROW, CONTEXT)).toEqual({
      field: 'assignee',
      value: 'paul',
    });
    expect(columnChange('assignee', 'none', ROW, CONTEXT)).toEqual({
      field: 'assignee',
      value: null,
    });
    expect(columnChange('assignee', 'other', ROW, CONTEXT)).toBeNull();
    expect(columnChange('assignee', 'inconnu', ROW, CONTEXT)).toBeNull();
  });

  it('ne change rien pour les autres regroupements', () => {
    expect(columnChange('project', 'p1', ROW, CONTEXT)).toBeNull();
    expect(columnChange('label', 'bug', ROW, CONTEXT)).toBeNull();
    expect(columnChange('none', 'all', ROW, CONTEXT)).toBeNull();
  });
});

describe('shownChange et changePatch', () => {
  it('montre le statut avec son libellé, sa couleur et sa catégorie', () => {
    expect(shownChange({ field: 'status', value: 's-started' }, CONTEXT)).toEqual({
      statusId: 's-started',
      statusLabel: 'En cours',
      statusColor: '#d97706',
      statusCategory: 'started',
    });
    expect(changePatch({ field: 'status', value: 's-started' })).toEqual({
      statusId: 's-started',
    });
  });

  it('montre la priorité et l’assigné, ou personne', () => {
    expect(shownChange({ field: 'priority', value: 'low' }, CONTEXT)).toEqual({ priority: 'low' });
    expect(shownChange({ field: 'assignee', value: 'paul' }, CONTEXT)).toEqual({ assignee: PAUL });
    expect(shownChange({ field: 'assignee', value: null }, CONTEXT)).toEqual({ assignee: null });
    expect(changePatch({ field: 'priority', value: 'low' })).toEqual({ priority: 'low' });
    expect(changePatch({ field: 'assignee', value: null })).toEqual({ assigneeId: null });
  });
});

describe('moveToColumn', () => {
  it('range la tâche avant la carte survolée', () => {
    expect(moveToColumn(columns(), '4', 'a', '2', false)).toEqual({
      a: ['1', '4', '2', '3'],
      b: [],
      c: [],
    });
  });

  it('la range après la carte survolée quand elle en a dépassé le milieu', () => {
    expect(moveToColumn(columns(), '4', 'a', '3', true).a).toEqual(['1', '2', '3', '4']);
  });

  it('la range en fin de colonne quand c’est la colonne qui est survolée', () => {
    expect(moveToColumn(columns(), '1', 'b', null, false)).toEqual({
      a: ['2', '3'],
      b: ['4', '1'],
      c: [],
    });
    expect(moveToColumn(columns(), '1', 'c', null, false).c).toEqual(['1']);
  });

  it('rend les mêmes colonnes quand la tâche y est déjà ou que la colonne n’existe pas', () => {
    const before = columns();

    expect(moveToColumn(before, '2', 'a', '3', false)).toBe(before);
    expect(moveToColumn(before, '2', 'z', null, false)).toBe(before);
    expect(moveToColumn(before, 'inconnue', 'b', null, false)).toBe(before);
  });

  it('ne modifie pas les colonnes d’origine', () => {
    const before = columns();

    moveToColumn(before, '1', 'b', null, false);

    expect(before).toEqual(columns());
  });
});

describe('startDrag', () => {
  it('note la colonne et la place d’origine de la tâche', () => {
    const start = columns();

    expect(startDrag(start, '2')).toEqual({ id: '2', from: 'a', index: 1, columns: start });
  });

  it('ne commence rien pour une tâche qu’aucune colonne ne contient', () => {
    expect(startDrag(columns(), 'inconnue')).toBeNull();
  });
});

describe('dragOver', () => {
  const dragging = (): Drag => ({ id: '2', from: 'a', index: 1, columns: columns() });

  it('passe la tâche dans la colonne de la carte survolée, avant elle', () => {
    expect(dragOver(dragging(), '4', false).columns).toEqual({
      a: ['1', '3'],
      b: ['2', '4'],
      c: [],
    });
  });

  it('la passe en fin de la colonne survolée quand c’est la colonne', () => {
    expect(dragOver(dragging(), 'c', false).columns).toEqual({ a: ['1', '3'], b: ['4'], c: ['2'] });
  });

  it('garde l’origine, et ne bouge pas pour ce qu’il ne connaît pas', () => {
    const drag = dragging();

    expect(dragOver(drag, '4', true)).toMatchObject({ from: 'a', index: 1 });
    expect(dragOver(drag, 'inconnu', false)).toBe(drag);
  });
});

describe('settle', () => {
  const drag = (overrides: Partial<Drag> = {}): Drag => ({
    id: '2',
    from: 'a',
    index: 1,
    columns: columns(),
    ...overrides,
  });
  const MANUAL = { groupBy: 'status', orderBy: 'manual' } as const;
  const BY_PRIORITY = { groupBy: 'status', orderBy: 'priority' } as const;

  it('range la tâche entre ses nouvelles voisines dans sa colonne en tri manuel', () => {
    const drop = settle(drag(), '3', MANUAL, ROW, CONTEXT);

    expect(drop).toEqual({
      columns: { a: ['1', '3', '2'], b: ['4'], c: [] },
      change: null,
      beforeId: '3',
      afterId: null,
    });
  });

  it('ne fait rien quand la tâche revient à sa place', () => {
    expect(settle(drag(), '2', MANUAL, ROW, CONTEXT)).toBeNull();
    expect(settle(drag(), 'a', MANUAL, ROW, CONTEXT)).toBeNull();
  });

  it('ne réordonne pas une colonne hors du tri manuel', () => {
    expect(settle(drag(), '3', BY_PRIORITY, ROW, CONTEXT)).toBeNull();
  });

  it('ne réordonne rien quand la carte survolée est dans une autre colonne', () => {
    expect(settle(drag(), '4', MANUAL, ROW, CONTEXT)).toBeNull();
  });

  // La carte a déjà changé de colonne en direct ; au dépôt, le pointeur est sur sa propre place.
  describe('vers une autre colonne', () => {
    const statusColumns = (): Columns => ({
      's-backlog': ['1', '2'],
      's-started': ['4', '5'],
      's-other': [],
    });
    const landed = (to: string, overId: string | null, after = true): Drag => ({
      id: '2',
      from: 's-backlog',
      index: 1,
      columns: moveToColumn(statusColumns(), '2', to, overId, after),
    });

    it('rend le changement de colonne et les voisines de la colonne d’arrivée', () => {
      const drop = settle(landed('s-started', '5'), '2', MANUAL, ROW, CONTEXT);

      expect(drop).toEqual({
        columns: { 's-backlog': ['1'], 's-started': ['4', '5', '2'], 's-other': [] },
        change: { field: 'status', value: 's-started' },
        beforeId: '5',
        afterId: null,
      });
    });

    it('rend les deux voisines d’une carte déposée entre deux autres', () => {
      const drop = settle(landed('s-started', '5', false), '2', MANUAL, ROW, CONTEXT);

      expect(drop).toMatchObject({ beforeId: '4', afterId: '5' });
    });

    it('compte aussi hors du tri manuel', () => {
      const drop = settle(landed('s-started', null), '2', BY_PRIORITY, ROW, CONTEXT);

      expect(drop?.change).toEqual({ field: 'status', value: 's-started' });
    });

    it('refuse le statut d’un autre projet', () => {
      expect(settle(landed('s-other', null), '2', MANUAL, ROW, CONTEXT)).toBeNull();
    });

    it('ne change rien quand le regroupement n’a pas de valeur à donner', () => {
      const byProject = { groupBy: 'project', orderBy: 'manual' } as const;

      expect(settle(landed('s-started', '5'), '2', byProject, ROW, CONTEXT)).toBeNull();
    });
  });
});
