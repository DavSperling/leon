import { describe, expect, it } from 'vitest';
import type { FactView } from '@/server/memory/card-data';
import { sortFacts } from './card-view';

const fact = (id: string, predicateLabel: string, validFrom: string): FactView =>
  ({ id, predicateLabel, validFrom: new Date(validFrom) }) as FactView;

describe('sortFacts', () => {
  it("groupe les faits d'un même prédicat, le plus récent d'abord, prédicats par ordre alphabétique", () => {
    const facts = [
      fact('a', 'Paiement', '2026-10-01'),
      fact('b', 'Besoin', '2026-09-01'),
      fact('c', 'Paiement', '2026-10-11'),
      fact('d', 'Échéance', '2026-10-05'),
    ];

    expect(sortFacts(facts).map((f) => f.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it("ne modifie pas la liste d'origine", () => {
    const facts = [fact('a', 'Paiement', '2026-10-01'), fact('b', 'Besoin', '2026-09-01')];

    sortFacts(facts);

    expect(facts.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
