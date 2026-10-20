import { describe, expect, it } from 'vitest';
import { fromSearchParams } from '@/components/search/url-state';
import { pageCount } from '@/components/search/view-model';
import { PAGE_MAX, PAGE_SIZE, QUERY_MAX_CHARS } from '@/lib/search-limits';
import { SEARCH_PAGE_MAX } from '@/server/mcp/tools/search-tool';
import * as serverTypes from '@/server/search/types';
import { productionSources } from './files';

// La recherche, la barre de la page d'accueil et l'outil MCP se règlent sur les mêmes plafonds : une page au-delà
// de PAGE_MAX est ramenée à PAGE_MAX par la recherche, et la page, qui affiche « Page 30 sur N » et fabrique les
// liens précédent et suivant, doit s'arrêter au même endroit. Tant que chacun en recopiait la valeur, seuls des
// commentaires affirmaient l'égalité. Ces plafonds n'ont maintenant qu'une source (src/lib/search-limits.ts, que le
// navigateur peut importer, contrairement à src/server) ; ce test la garde unique.

describe('plafonds de la recherche', () => {
  it('valent ceux du plan : 10 sources par page, 50 pages, 300 caractères de requête', () => {
    expect(PAGE_SIZE).toBe(10);
    expect(PAGE_MAX).toBe(50);
    expect(QUERY_MAX_CHARS).toBe(300);
  });

  it('sont ceux que le serveur de recherche exporte', () => {
    expect(serverTypes.PAGE_SIZE).toBe(PAGE_SIZE);
    expect(serverTypes.PAGE_MAX).toBe(PAGE_MAX);
    expect(serverTypes.QUERY_MAX_CHARS).toBe(QUERY_MAX_CHARS);
  });

  it('sont ceux de la page d’accueil et de l’outil MCP', () => {
    expect(SEARCH_PAGE_MAX).toBe(PAGE_MAX);
    expect(pageCount(PAGE_SIZE * PAGE_MAX * 10)).toBe(PAGE_MAX);
    expect(fromSearchParams({ q: 'x', page: String(PAGE_MAX + 1) }).page).toBe(PAGE_MAX);
    expect(fromSearchParams({ q: 'a'.repeat(QUERY_MAX_CHARS + 1) }).q).toHaveLength(
      QUERY_MAX_CHARS,
    );
  });

  it('ne sont déclarés qu’une fois : aucun fichier n’en recopie la valeur', () => {
    const DECLARATION = /\b(?:const|let|var)\s+(PAGE_MAX|QUERY_MAX_CHARS|SEARCH_PAGE_MAX)\s*=\s*\d/;
    const copies = productionSources('src/**/*.{ts,tsx}')
      .filter(({ path }) => path !== 'src/lib/search-limits.ts')
      .filter(({ text }) => DECLARATION.test(text))
      .map(({ path }) => path);

    expect(copies).toEqual([]);
  });
});
