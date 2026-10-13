import { describe, expect, it } from 'vitest';
import { windowTurns } from './windows';

const turn = (id: string, size: number) => ({ id, text: 'x'.repeat(size) });
const ids = (windows: Array<Array<{ id: string }>>) => windows.map((w) => w.map((t) => t.id));

describe('windowTurns', () => {
  it('renvoie une seule fenêtre quand tout tient', () => {
    expect(ids(windowTurns([turn('a', 10), turn('b', 10)], 100))).toEqual([['a', 'b']]);
  });

  it('coupe en conservant l ordre quand la fenêtre est pleine', () => {
    const windows = windowTurns([turn('a', 60), turn('b', 60), turn('c', 30), turn('d', 30)], 100);

    expect(ids(windows)).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('accepte une fenêtre remplie exactement', () => {
    expect(ids(windowTurns([turn('a', 50), turn('b', 50), turn('c', 1)], 100))).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });

  it('donne sa propre fenêtre à un tour plus long que la limite', () => {
    const windows = windowTurns([turn('a', 10), turn('geant', 500), turn('b', 10)], 100);

    expect(ids(windows)).toEqual([['a'], ['geant'], ['b']]);
  });

  it('renvoie aucune fenêtre sans tour', () => {
    expect(windowTurns([], 100)).toEqual([]);
  });
});
