import { describe, expect, it } from 'vitest';
import { validityLabel } from './fact-row';

const NOW = new Date('2026-10-13T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe('validityLabel', () => {
  it('dit « depuis le » pour un fait déjà valable', () => {
    const fact = { status: 'active', validFrom: day('2026-09-02'), validTo: null } as const;

    expect(validityLabel(fact, NOW)).toBe('depuis le 2 sept. 2026');
  });

  it('dit « à partir du » pour un fait qui ne vaut pas encore', () => {
    const fact = { status: 'active', validFrom: day('2026-11-01'), validTo: null } as const;

    expect(validityLabel(fact, NOW)).toBe('à partir du 1 nov. 2026');
  });

  it('dit « remplacé le » pour un fait remplacé et terminé', () => {
    const fact = {
      status: 'superseded',
      validFrom: day('2026-09-02'),
      validTo: day('2026-10-03'),
    } as const;

    expect(validityLabel(fact, NOW)).toBe('remplacé le 3 oct. 2026');
  });

  it('dit « terminé le » pour un fait actif dont la validité est passée', () => {
    const fact = {
      status: 'active',
      validFrom: day('2026-01-01'),
      validTo: day('2026-04-01'),
    } as const;

    expect(validityLabel(fact, NOW)).toBe('terminé le 1 avr. 2026');
  });

  it('garde « depuis le » pour un fait remplacé qui vaut encore', () => {
    const fact = { status: 'superseded', validFrom: day('2026-09-02'), validTo: null } as const;

    expect(validityLabel(fact, NOW)).toBe('depuis le 2 sept. 2026');
  });
});
