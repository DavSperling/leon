import { describe, expect, it } from 'vitest';
import type { FicheLine } from '@/server/portrait/fiche';
import { linesOf } from './fiche-view';

describe('linesOf : les lignes d’un genre', () => {
  it('ne rend que les lignes du genre demandé, dans leur ordre', () => {
    const line = (genre: FicheLine['genre'], cle: string, valeur: FicheLine['valeur']) => ({
      id: `${genre}-${cle}`,
      genre,
      cle,
      valeur,
      provenance: 'calcul' as const,
      mails: 3,
      corrigeeLe: null,
    });
    const fiche: FicheLine[] = [
      line('mots', 'tous', { mediane: 40 }),
      line('role', '', { texte: 'Commerciale.' }),
      line('mots', 'externe', { mediane: 80 }),
    ];

    expect(linesOf(fiche, 'mots').map((one) => [one.cle, one.valeur.mediane])).toEqual([
      ['tous', 40],
      ['externe', 80],
    ]);
    expect(linesOf(fiche, 'role').map((one) => one.valeur.texte)).toEqual(['Commerciale.']);
    expect(linesOf(fiche, 'tache')).toEqual([]);
  });
});
