import { describe, expect, it } from 'vitest';
import type { TreeType } from '@/server/memory/tree';
import { keyAction, type TreeRow, visibleRows } from './tree-view';

const type = (slug: string, overrides: Partial<TreeType> = {}): TreeType => ({
  slug,
  label: slug,
  status: 'validated',
  isBase: true,
  cardCount: 0,
  cards: [],
  children: [],
  ...overrides,
});

const TREE: TreeType[] = [
  type('client', {
    cardCount: 2,
    cards: [
      { id: 'c1', title: 'ACME', status: 'confirmed' },
      { id: 'c2', title: 'Zeta', status: 'unconfirmed' },
    ],
  }),
  type('projet', {
    cardCount: 1,
    cards: [{ id: 'p1', title: 'Orion', status: 'confirmed' }],
    children: [
      type('chantier', {
        isBase: false,
        status: 'proposed',
        cardCount: 1,
        cards: [{ id: 'k1', title: 'Quai', status: 'confirmed' }],
      }),
    ],
  }),
  type('outil'),
];

const keys = (rows: TreeRow[]) => rows.map((row) => row.key);

describe('visibleRows', () => {
  it('ne montre que les types quand tout est replié', () => {
    expect(keys(visibleRows(TREE, new Set()))).toEqual(['t:client', 't:projet', 't:outil']);
  });

  it('montre sous un type déplié ses types enfants puis ses fiches, avec leur niveau', () => {
    const rows = visibleRows(TREE, new Set(['t:projet', 't:chantier']));

    expect(rows.map((row) => [row.key, row.level, row.parentKey])).toEqual([
      ['t:client', 1, null],
      ['t:projet', 1, null],
      ['t:chantier', 2, 't:projet'],
      ['c:k1', 3, 't:chantier'],
      ['c:p1', 2, 't:projet'],
      ['t:outil', 1, null],
    ]);
  });

  it("marque un type sans fiche ni enfant comme non dépliable, même s'il est dans l'ensemble", () => {
    const [row] = visibleRows([type('outil')], new Set(['t:outil']));

    expect(row).toMatchObject({ kind: 'type', expandable: false, open: false });
  });
});

describe('keyAction', () => {
  const rows = visibleRows(TREE, new Set(['t:client']));
  // t:client, c:c1, c:c2, t:projet, t:outil
  const at = (key: string, pressed: string) =>
    keyAction(
      rows,
      rows.findIndex((row) => row.key === key),
      pressed,
    );

  it('descend et monte sans déborder', () => {
    expect(at('t:client', 'ArrowDown')).toEqual({ focus: 'c:c1' });
    expect(at('c:c1', 'ArrowUp')).toEqual({ focus: 't:client' });
    expect(at('t:client', 'ArrowUp')).toBeNull();
    expect(at('t:outil', 'ArrowDown')).toBeNull();
  });

  it('Début et Fin vont aux extrémités', () => {
    expect(at('c:c2', 'Home')).toEqual({ focus: 't:client' });
    expect(at('c:c2', 'End')).toEqual({ focus: 't:outil' });
  });

  it('→ déplie un type replié, puis passe à son premier enfant', () => {
    expect(at('t:projet', 'ArrowRight')).toEqual({ toggle: 't:projet' });
    expect(at('t:client', 'ArrowRight')).toEqual({ focus: 'c:c1' });
    expect(at('c:c1', 'ArrowRight')).toBeNull();
    expect(at('t:outil', 'ArrowRight')).toBeNull();
  });

  it('← replie un type déplié, sinon remonte au parent', () => {
    expect(at('t:client', 'ArrowLeft')).toEqual({ toggle: 't:client' });
    expect(at('c:c2', 'ArrowLeft')).toEqual({ focus: 't:client' });
    expect(at('t:projet', 'ArrowLeft')).toBeNull();
  });

  it('Entrée et Espace plient ou déplient un type, et laissent la fiche au lien', () => {
    expect(at('t:projet', 'Enter')).toEqual({ toggle: 't:projet' });
    expect(at('t:client', ' ')).toEqual({ toggle: 't:client' });
    expect(at('t:outil', 'Enter')).toBeNull();
    expect(at('c:c1', 'Enter')).toBeNull();
  });
});
