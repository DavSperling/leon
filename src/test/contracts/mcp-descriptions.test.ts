import { describe, expect, it } from 'vitest';
import { ITEM_NATURES, SOURCE_KINDS } from '@/capture/turn';
import { MCP_INSTRUCTIONS } from '@/server/mcp/server';
import {
  FETCH_DESCRIPTION,
  FetchInputSchema,
  NEIGHBOUR_TURNS,
} from '@/server/mcp/tools/fetch-tool';
import {
  SEARCH_DESCRIPTION,
  SEARCH_PAGE_MAX,
  SearchInputSchema,
} from '@/server/mcp/tools/search-tool';
import { SOURCE_MAX_CHARS } from '@/server/search/context';
import { PAGE_SIZE } from '@/server/search/types';
import { readText } from './files';

// Les textes que lit l'assistant du client (instructions du serveur, descriptions des outils et de leurs paramètres)
// citent des noms et des chiffres du code. S'ils ne les reprennent pas, ils mentent sans qu'aucun test ne casse.
// Les chiffres et les listes viennent des constantes ; ce test vérifie que les noms cités sont bien ceux du schéma.

const searchProperties = Object.keys(SearchInputSchema.shape);
const description = (schema: { description?: string }): string => schema.description ?? '';

describe('instructions du serveur MCP', () => {
  it("ne nomment, comme filtres de search, que des paramètres de l'outil", () => {
    const named = /\(filtres : ([^)]+)\)/.exec(MCP_INSTRUCTIONS)?.[1]?.split(', ') ?? [];

    expect(named.length).toBeGreaterThan(0);
    for (const filter of named) expect(searchProperties).toContain(filter);
  });

  it('nomment les trois outils et le rôle de chacun', () => {
    for (const tool of ['search', 'fetch', 'remember']) expect(MCP_INSTRUCTIONS).toContain(tool);
  });
});

describe('description de search', () => {
  it('ne cite en exemple, pour outil, que des outils de Leon', () => {
    const listed = /Limite à un outil : ([^…]+)…/.exec(
      description(SearchInputSchema.shape.outil),
    )?.[1];
    const tools = listed?.split(', ') ?? [];

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(SOURCE_KINDS).toContain(tool);
  });

  it('liste les natures du code', () => {
    const text = description(SearchInputSchema.shape.type);

    for (const nature of ITEM_NATURES) expect(text).toContain(nature);
  });

  it('annonce le nombre de sources par page et la dernière page de la recherche', () => {
    expect(description(SearchInputSchema.shape.page)).toContain(`${PAGE_SIZE} sources par page`);
    const searchSource = readText('src/server/search/search.ts');
    const pageMax = /\bconst PAGE_MAX = (\d+);/.exec(searchSource)?.[1];

    // Une page au-delà de PAGE_MAX est ramenée à PAGE_MAX par la recherche : l'outil doit refuser au même endroit,
    // sinon il numérote les résultats d'une page qu'il n'a pas rendue. Si cette lecture échoue, PAGE_MAX a changé de
    // forme : adapter la lecture, ou l'exporter de search.ts et l'importer ici.
    expect(pageMax).toBeDefined();
    expect(SEARCH_PAGE_MAX).toBe(Number(pageMax));
  });

  it("n'oblige aucun paramètre", () => {
    expect(SearchInputSchema.safeParse({}).success).toBe(true);
  });

  it("dit à l'assistant de lire avec fetch", () => {
    expect(SEARCH_DESCRIPTION).toContain('fetch');
  });
});

describe('description de fetch', () => {
  it('annonce la longueur maximale lue, celle de la lecture', () => {
    const spaced = String(SOURCE_MAX_CHARS).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    expect(description(FetchInputSchema.shape.sourceId)).toContain(`${spaced} caractères`);
  });

  it('annonce les tours voisins que la lecture rend', () => {
    expect(description(FetchInputSchema.shape.passageId)).toContain(
      `les ${NEIGHBOUR_TURNS} tours avant et après`,
    );
  });

  it('nomme les trois identifiants, dont id, le nom que ChatGPT impose', () => {
    expect(Object.keys(FetchInputSchema.shape).sort()).toEqual(['id', 'passageId', 'sourceId']);
    for (const name of ['id', 'passageId', 'sourceId']) expect(FETCH_DESCRIPTION).toContain(name);
  });
});
