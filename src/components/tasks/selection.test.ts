import { describe, expect, it } from 'vitest';
import {
  commonValue,
  EMPTY_SELECTION,
  type Selection,
  selectRow,
  shownRows,
  visibleSelection,
} from './selection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];
const pick = (selection: Selection, ...ids: string[]) =>
  ids.reduce((current, id) => selectRow(current, ORDER, id, false), selection);
const sorted = (selection: Selection) => [...selection.ids].sort();

describe('selectRow', () => {
  it('coche une tâche, puis la décoche', () => {
    const checked = selectRow(EMPTY_SELECTION, ORDER, 'b', false);
    expect(sorted(checked)).toEqual(['b']);
    expect(sorted(selectRow(checked, ORDER, 'b', false))).toEqual([]);
  });

  it('garde la dernière tâche touchée comme point de départ', () => {
    expect(pick(EMPTY_SELECTION, 'a', 'c').anchor).toBe('c');
  });

  it('coche toute la plage depuis la dernière tâche touchée, dans les deux sens', () => {
    expect(sorted(selectRow(pick(EMPTY_SELECTION, 'b'), ORDER, 'd', true))).toEqual([
      'b',
      'c',
      'd',
    ]);
    expect(sorted(selectRow(pick(EMPTY_SELECTION, 'd'), ORDER, 'b', true))).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('ajoute la plage à la sélection existante et repart de la tâche cliquée', () => {
    const range = selectRow(pick(EMPTY_SELECTION, 'a', 'c'), ORDER, 'e', true);
    expect(sorted(range)).toEqual(['a', 'c', 'd', 'e']);
    expect(range.anchor).toBe('e');
  });

  it('coche la tâche seule quand rien ne sert de point de départ', () => {
    expect(sorted(selectRow(EMPTY_SELECTION, ORDER, 'c', true))).toEqual(['c']);
  });

  it('coche la tâche seule quand le point de départ n’est plus affiché', () => {
    const stale: Selection = { ids: new Set(['x']), anchor: 'x' };
    expect(sorted(selectRow(stale, ORDER, 'c', true))).toEqual(['c', 'x']);
  });

  it('garde cochée une tâche déjà cochée quand le point de départ n’est plus affiché', () => {
    const stale: Selection = { ids: new Set(['a', 'b']), anchor: 'x' };
    const range = selectRow(stale, ORDER, 'a', true);
    expect(sorted(range)).toEqual(['a', 'b']);
    expect(range.anchor).toBe('a');
  });

  it('ne modifie pas la sélection reçue', () => {
    const before = pick(EMPTY_SELECTION, 'a');
    selectRow(before, ORDER, 'b', false);
    expect(sorted(before)).toEqual(['a']);
  });
});

describe('shownRows', () => {
  const group = (key: string, ...ids: string[]) => ({
    key,
    label: key,
    rows: ids.map((id) => ({ id })),
  });
  const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

  it('range les tâches dans l’ordre d’affichage, une fois chacune', () => {
    const groups = [group('bug', 'a', 'b'), group('feature', 'b', 'c')];
    expect(ids(shownRows(groups, new Set()))).toEqual(['a', 'b', 'c']);
  });

  it('écarte les tâches d’un groupe replié, sauf celles qu’un autre groupe montre encore', () => {
    const groups = [group('bug', 'a', 'b'), group('feature', 'b', 'c')];
    expect(ids(shownRows(groups, new Set(['bug'])))).toEqual(['b', 'c']);
    expect(shownRows(groups, new Set(['bug', 'feature']))).toEqual([]);
  });
});

describe('visibleSelection', () => {
  it('retire les tâches que la liste n’affiche plus', () => {
    const selection: Selection = { ids: new Set(['a', 'x']), anchor: 'a' };
    expect([...visibleSelection(selection, ORDER)]).toEqual(['a']);
  });
});

describe('commonValue', () => {
  const items = [{ n: 1 }, { n: 1 }, { n: 2 }];
  const read = (item: { n: number }) => item.n;

  it('rend la valeur que toutes les tâches partagent', () => {
    expect(commonValue(items.slice(0, 2), read)).toBe(1);
  });

  it('rend undefined quand les valeurs diffèrent ou qu’il n’y a rien', () => {
    expect(commonValue(items, read)).toBeUndefined();
    expect(commonValue([], read)).toBeUndefined();
  });

  it('distingue « aucune valeur » (null) de « valeurs différentes »', () => {
    expect(commonValue([{ n: null }, { n: null }], (item) => item.n)).toBeNull();
  });
});
