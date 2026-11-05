import { describe, expect, it } from 'vitest';
import { SOURCE_KINDS } from '@/capture/turn';
import { MCP_INSTRUCTIONS } from '@/server/mcp/server';
import {
  FETCH_DESCRIPTION,
  FetchInputSchema,
  NEIGHBOUR_TURNS,
} from '@/server/mcp/tools/fetch-tool';
import { SearchOutputSchema } from '@/server/mcp/tools/output-schemas';
import {
  SEARCH_DESCRIPTION,
  SEARCH_PAGE_MAX,
  SearchInputSchema,
} from '@/server/mcp/tools/search-tool';
import { SOURCE_MAX_CHARS } from '@/server/search/context';
import { queryTerms } from '@/server/search/query-terms';
import {
  NATURE_NAMES_EN,
  QUERY_SYNTAX_DESCRIPTION_EN,
  readToolFilters,
} from '@/server/search/tool-filters';
import { PAGE_MAX, PAGE_SIZE } from '@/server/search/types';

// Les textes que lit l'assistant du client (instructions du serveur, descriptions des outils et de leurs paramètres)
// citent des noms et des chiffres du code. S'ils ne les reprennent pas, ils mentent sans qu'aucun test ne casse.
// Les chiffres et les listes viennent des constantes ; ce test vérifie que les noms cités sont bien ceux du schéma.

const searchProperties = Object.keys(SearchInputSchema.shape);
const description = (schema: { description?: string }): string => schema.description ?? '';

describe('instructions du serveur MCP', () => {
  it("ne nomment, comme filtres de search, que des paramètres de l'outil", () => {
    const named = /\(filters: ([^)]+)\)/.exec(MCP_INSTRUCTIONS)?.[1]?.split(', ') ?? [];

    expect(named.length).toBeGreaterThan(0);
    for (const filter of named) expect(searchProperties).toContain(filter);
  });

  it('nomment les quatre outils et le rôle de chacun', () => {
    for (const tool of ['search', 'fetch', 'briefing', 'remember']) {
      expect(MCP_INSTRUCTIONS).toContain(tool);
    }
  });
});

describe('description de search', () => {
  it('ne cite en exemple, pour outil, que des outils de Leon', () => {
    const listed = /Limit to one tool: ([^…]+)…/.exec(
      description(SearchInputSchema.shape.outil),
    )?.[1];
    const tools = listed?.split(', ') ?? [];

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(SOURCE_KINDS).toContain(tool);
  });

  it('liste les natures du code, par des noms que la recherche lit', () => {
    const text = description(SearchInputSchema.shape.type);

    for (const name of NATURE_NAMES_EN) {
      expect(text).toContain(name);
      expect(readToolFilters({ type: name }, new Date()), name).not.toHaveProperty('error');
    }
  });

  // T25 : les formes que la description de depot propose sont celles que la recherche lit ; une autre est refusée.
  it('décrit depot par les formes de dépôt que la recherche lit', () => {
    const text = description(SearchInputSchema.shape.depot);

    for (const form of ['github.com/owner/repo', 'owner/repo']) {
      expect(text).toContain(form);
      expect(readToolFilters({ depot: form }, new Date())).toEqual({
        filters: { depot: 'github.com/owner/repo' },
      });
    }
    const refused = readToolFilters({ depot: 'gitlab.com/owner/repo' }, new Date());
    expect(refused).toHaveProperty('error');
    expect('error' in refused ? refused.error : '').toContain('github.com/owner/repo');
  });

  it('annonce le nombre de sources par page et la dernière page de la recherche', () => {
    expect(description(SearchInputSchema.shape.page)).toContain(`${PAGE_SIZE} sources per page`);

    // Une page au-delà de PAGE_MAX est ramenée à PAGE_MAX par la recherche : l'outil doit refuser au même endroit,
    // sinon il numérote les résultats d'une page qu'il n'a pas rendue. Les deux lisent la même constante
    // (src/lib/search-limits.ts, gardée par search-limits.test.ts).
    expect(SEARCH_PAGE_MAX).toBe(PAGE_MAX);
  });

  it("n'oblige aucun paramètre", () => {
    expect(SearchInputSchema.safeParse({}).success).toBe(true);
  });

  it("dit à l'assistant de lire avec fetch", () => {
    expect(SEARCH_DESCRIPTION).toContain('fetch');
  });

  // T06b : quand la première passe trouve peu de sources, un mot ajouté élargit au lieu de resserrer. La description
  // de `query` donne les deux façons de resserrer, et la recherche les lit bien ainsi.
  it('dit comment resserrer, avec la syntaxe que la recherche lit', () => {
    expect(description(SearchInputSchema.shape.query)).toContain(QUERY_SYNTAX_DESCRIPTION_EN);
    expect(QUERY_SYNTAX_DESCRIPTION_EN).toContain('"straight quotes"');
    expect(QUERY_SYNTAX_DESCRIPTION_EN).toContain('-word');
    const terms = queryTerms('remise "plan b" -ovh');
    expect(terms.phrases).toEqual(['"plan b"']);
    expect(terms.negated).toEqual(['ovh']);
  });

  it('dit que le score n’est pas l’ordre des sources', () => {
    const score = SearchOutputSchema.shape.hits.element.shape.score;
    expect(score.description).toContain('order');
  });
});

describe('description de fetch', () => {
  it('annonce la longueur maximale lue, celle de la lecture', () => {
    expect(description(FetchInputSchema.shape.sourceId)).toContain(
      `${SOURCE_MAX_CHARS.toLocaleString('en-US')} characters`,
    );
  });

  it('annonce les tours voisins que la lecture rend', () => {
    expect(description(FetchInputSchema.shape.passageId)).toContain(
      `the ${NEIGHBOUR_TURNS} turns before and after`,
    );
  });

  it('nomme les trois identifiants, dont id, le nom que ChatGPT impose', () => {
    expect(Object.keys(FetchInputSchema.shape).sort()).toEqual(['id', 'passageId', 'sourceId']);
    for (const name of ['id', 'passageId', 'sourceId']) expect(FETCH_DESCRIPTION).toContain(name);
  });
});
