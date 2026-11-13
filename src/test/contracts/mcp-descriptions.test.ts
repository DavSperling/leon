import { describe, expect, it } from 'vitest';
import { VERSION_N_MAX } from '@/capture/api-contract';
import { TOOL_KINDS } from '@/capture/turn';
import { MCP_INSTRUCTIONS } from '@/server/mcp/server';
import {
  FETCH_DESCRIPTION,
  FetchInputSchema,
  NEIGHBOUR_TURNS,
} from '@/server/mcp/tools/fetch-tool';
import { SearchOutputSchema } from '@/server/mcp/tools/output-schemas';
import {
  NOTES_TURNED_OFF,
  REMEMBER_DESCRIPTION,
  RememberInputSchema,
} from '@/server/mcp/tools/remember-tool';
import {
  SEARCH_DESCRIPTION,
  SEARCH_PAGE_MAX,
  SearchInputSchema,
} from '@/server/mcp/tools/search-tool';
import { SOURCE_MAX_CHARS } from '@/server/search/context';
import { queryTerms } from '@/server/search/query-terms';
import {
  BACKSTAGE_ROLE_NAMES_EN,
  NATURE_NAMES_EN,
  QUERY_SYNTAX_DESCRIPTION_EN,
  readToolFilters,
} from '@/server/search/tool-filters';
import { PAGE_MAX, PAGE_SIZE } from '@/server/search/types';
import en from '../../../messages/en.json';

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

  it('nomment les huit outils et le rôle de chacun', () => {
    for (const tool of [
      'search',
      'fetch',
      'threads',
      'thread',
      'versions',
      'lessons',
      'briefing',
      'remember',
    ]) {
      expect(MCP_INSTRUCTIONS).toContain(tool);
    }
  });

  // D27 : sur un dépôt, les fils d'abord, puis la recherche bornée au dépôt ; la recherche générale reste.
  it('disent de lire les fils sur un dépôt, sans retirer la recherche générale', () => {
    expect(MCP_INSTRUCTIONS).toContain(
      'When working on a code repository, call threads, then thread; search with depot.',
    );
    expect(MCP_INSTRUCTIONS).toContain('search first with search');
  });
});

describe('description du filtre fil de search', () => {
  it('nomme l’outil qui donne l’id d’un fil', () => {
    expect(description(SearchInputSchema.shape.fil)).toContain('threads');
  });
});

describe('description de search', () => {
  it('ne cite en exemple, pour outil, que des outils de Leon', () => {
    const listed = /Limit to one tool: ([^…]+)…/.exec(
      description(SearchInputSchema.shape.outil),
    )?.[1];
    const tools = listed?.split(', ') ?? [];

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(TOOL_KINDS).toContain(tool);
  });

  // T39 : le fil de travail n'est pas un outil (D21) ; l'assistant ne le voit ni accepté ni proposé.
  it('refuse outil leon_fil, sans le citer parmi les outils connus, et accepte la nature fil_de_travail', () => {
    const refused = readToolFilters({ outil: 'leon_fil' }, new Date());
    const known = 'error' in refused ? refused.error.split('Known tools:')[1] : undefined;
    expect(known).toContain('github');
    expect(known).not.toContain('leon_fil');
    expect(readToolFilters({ type: 'fil_de_travail' }, new Date())).toEqual({
      filters: { natures: ['fil_de_travail'] },
    });
  });

  it('liste les natures du code, par des noms que la recherche lit', () => {
    const text = description(SearchInputSchema.shape.type);

    for (const name of NATURE_NAMES_EN) {
      expect(text).toContain(name);
      expect(readToolFilters({ type: name }, new Date()), name).not.toHaveProperty('error');
    }
  });

  // T51 (QD9) : les coulisses d'une session de code se ciblent par `type`, nommées comme les natures.
  it('liste les trois rôles des coulisses, par des noms que la recherche lit comme rôles', () => {
    const text = description(SearchInputSchema.shape.type);

    for (const [role, name] of Object.entries(BACKSTAGE_ROLE_NAMES_EN)) {
      expect(text).toContain(name);
      expect(readToolFilters({ type: name }, new Date())).toEqual({ filters: { roles: [role] } });
    }
    const refused = readToolFilters({ type: 'inconnu' }, new Date());
    expect('error' in refused ? refused.error : '').toContain('tool call');
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
    // Refusée sans être recopiée : une adresse de remote peut porter un jeton.
    const refused = readToolFilters({ depot: 'gitlab.com/owner/repo' }, new Date());
    expect(refused).toHaveProperty('error');
    expect('error' in refused ? refused.error : '').toContain('github.com/owner/repo');
    expect('error' in refused ? refused.error : '').not.toContain('gitlab');
  });

  // Sur GitHub, un propriétaire fait jusqu'à 39 caractères et un dépôt jusqu'à 100 : l'outil prend son adresse https.
  it('accepte depot pour un dépôt au nom le plus long que permet GitHub', () => {
    const repo = `${'o'.repeat(39)}/${'r'.repeat(100)}`;
    const url = `https://github.com/${repo}.git`;

    expect(SearchInputSchema.shape.depot.safeParse(url).success).toBe(true);
    expect(readToolFilters({ depot: url }, new Date())).toEqual({
      filters: { depot: `github.com/${repo}` },
    });
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

// T57 (C14) : remember écrit aussi la version suivante d'une note qu'il a déposée ; ses paramètres le disent, et rien
// n'y restaure (D33).
describe('description de remember', () => {
  it('nomme note, l’id d’une note de remember, et version, le numéro de sa dernière version lue', () => {
    expect(Object.keys(RememberInputSchema.shape).sort()).toEqual([
      'about',
      'note',
      'text',
      'version',
    ]);
    expect(description(RememberInputSchema.shape.note)).toContain('remember');
    expect(description(RememberInputSchema.shape.version)).toContain('note');
    expect(RememberInputSchema.shape.version.safeParse(VERSION_N_MAX + 1).success).toBe(false);
    expect(
      Object.values(RememberInputSchema.shape)
        .map((schema) => description(schema))
        .join(' '),
    ).not.toMatch(/restor|restaur/i);
  });

  // Décision 3 d'Amos du 12/11 : une note se lit comme les sessions, par l'auteur et ses managers sur le site (0057).
  it('dit qui lit la note : l’utilisateur et, sur le site, ses managers, pas « private »', () => {
    expect(REMEMBER_DESCRIPTION).toContain(
      "It is read like the user's sessions: by the user and, on the Leon website, by the managers above them.",
    );
    expect(REMEMBER_DESCRIPTION).not.toMatch(/private/i);
  });
});

// T65 (C16) : le refus de remember, réglage `noter` daté, dit où le rouvrir, par les noms anglais du site : la section
// Mémoire (son onglet) des réglages.
describe('refus de remember quand les notes sont coupées', () => {
  it('nomme l’onglet Mémoire et les réglages du site, tels que le site anglais les nomme', () => {
    expect(NOTES_TURNED_OFF).toContain(`${en.settings.tabMemory} section`);
    expect(NOTES_TURNED_OFF).toContain(`website ${en.navigation.settings.toLowerCase()}`);
  });
});
