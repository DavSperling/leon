import { describe, expect, it } from 'vitest';
import { readText } from './files';

// Deux réglages de la requête de recherche (src/server/search/search.ts) qui ne changent aucun résultat, donc
// qu'aucun test sur la base ne verrait disparaître, mais dont l'absence rend chaque recherche plus lente.
//
// - La compilation à la volée de Postgres (JIT) se déclenche sur le coût estimé de la requête (100 000 par défaut).
//   La passe élargie (T06b) porte ce coût au-delà, même quand elle n'est pas exécutée : chaque recherche de deux
//   mots ou plus compilait alors quelque deux cents fonctions, pour une requête de quelques dizaines de
//   millisecondes. Mesuré à la relecture de T06b : 930 ms au lieu de 318 ms sur 160 000 passages.
// - La passe élargie est calculée une seule fois, quel que soit le plan choisi par Postgres : sur de petites tables
//   sans statistiques, il la réévaluait pour chaque ligne candidate.

const SEARCH = 'src/server/search/search.ts';

// Le corps de `rankedSources`, de sa signature à l'accolade qui ferme la fonction.
function rankedSourcesBody(text: string): string {
  const start = text.indexOf('async function rankedSources(');
  const end = text.indexOf('\n}\n', start);
  return start >= 0 && end > start ? text.slice(start, end) : '';
}

describe('requête de la recherche', () => {
  const body = rankedSourcesBody(readText(SEARCH));

  it('coupe la compilation à la volée dans la transaction de la recherche', () => {
    expect(body).not.toBe('');
    expect(body).toContain('await tx.execute(sql`set local jit = off`);');
  });

  it('calcule la passe élargie une seule fois', () => {
    expect(body).toContain('wide as materialized (');
  });
});
