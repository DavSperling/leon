import { describe, expect, it, vi } from 'vitest';
import { withUnchecked } from './depots-equipe';

vi.mock('@/app/(app)/reglages/actions', () => ({ setDepotEquipeAction: vi.fn() }));

// C07 : un dépôt décoché que la page ne relit plus (saisi à la main, ou coché par un autre administrateur) garde sa
// ligne, décochée, à sa place : sa case garde le focus, et on peut le recocher sans le ressaisir.
describe('withUnchecked', () => {
  it('garde à sa place, décoché, un dépôt que la page ne relit plus', () => {
    expect(
      withUnchecked(
        [
          { depot: 'acme/app', coche: true },
          { depot: 'acme/site', coche: false },
        ],
        ['acme/outil'],
      ),
    ).toEqual([
      { depot: 'acme/app', coche: true },
      { depot: 'acme/outil', coche: false },
      { depot: 'acme/site', coche: false },
    ]);
  });

  it('suit la page pour un dépôt qu’elle relit, recoché depuis', () => {
    expect(withUnchecked([{ depot: 'acme/outil', coche: true }], ['acme/outil'])).toEqual([
      { depot: 'acme/outil', coche: true },
    ]);
  });
});
