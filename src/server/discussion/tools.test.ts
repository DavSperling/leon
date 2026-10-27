import { describe, expect, it } from 'vitest';
import { toolDefinitions } from '@/server/llm/anthropic-llm';
import { QUERY_SYNTAX_DESCRIPTION } from '@/server/search/tool-filters';
import { createSourceNumbering, discussionTools } from './tools';

const CTX = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  principals: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'],
};

const source = (id: string, title: string | null = `Source ${id}`) => ({
  sourceId: id,
  title,
  url: null,
});

describe('createSourceNumbering', () => {
  it('numérote les sources dans l’ordre où l’agent les voit, une seule fois chacune', () => {
    const numbering = createSourceNumbering();

    expect(numbering.number(source('a'), 'pa1')).toBe(1);
    expect(numbering.number(source('b'), 'pb1')).toBe(2);
    expect(numbering.number(source('a'), 'pa2')).toBe(1);
    expect(numbering.has(1)).toBe(true);
    expect(numbering.has(2)).toBe(true);
    expect(numbering.has(3)).toBe(false);
    expect(numbering.numberOf('b')).toBe(2);
    expect(numbering.numberOf('c')).toBeNull();
  });

  // Audit 2 n° 15 c : un résultat de départ devenu invisible laisse un trou ; les autres gardent le numéro
  // qu'affiche la question, et une source nouvelle prend le numéro suivant le plus grand.
  it('garde le numéro donné à un résultat de départ, et numérote les suivantes après lui', () => {
    const numbering = createSourceNumbering();

    expect(numbering.number(source('a'), 'pa1', { n: 1 })).toBe(1);
    expect(numbering.number(source('c'), 'pc1', { n: 3 })).toBe(3);
    expect(numbering.number(source('d'), 'pd1')).toBe(4);
    expect(numbering.has(2)).toBe(false);
    expect(numbering.citations([3]).map((c) => c.sourceId)).toEqual(['c']);
  });

  it('cite le premier passage montré, ou le dernier que l’agent a lu', () => {
    const numbering = createSourceNumbering();
    numbering.number(source('a', 'Ticket A'), 'pa1');
    numbering.number(source('a', 'Ticket A'), 'pa2');
    numbering.number(source('b'), 'pb1');
    numbering.number(source('b'), 'pb2', { read: true });

    expect(numbering.citations([2, 1, 7])).toEqual([
      { n: 1, sourceId: 'a', passageId: 'pa1', title: 'Ticket A', url: null },
      { n: 2, sourceId: 'b', passageId: 'pb2', title: 'Source b', url: null },
    ]);
  });
});

// Un outil que l'API refuserait est un défaut du code (anthropic-llm.ts) : la liste de la discussion passe la
// même vérification que celle de chaque appel.
describe('les outils de la discussion', () => {
  const tools = discussionTools(CTX, {
    embedder: null,
    budget: { chars: 40_000 },
    numbering: createSourceNumbering(),
  });

  it('sont chercher, lire, activite et les outils GitHub', () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'chercher',
      'lire',
      'activite',
      'depots_github',
      'creer_branche_github',
    ]);
  });

  it('passent la vérification des outils de l’API', () => {
    const definitions = toolDefinitions(tools);

    expect(definitions.map((tool) => tool.input_schema.type)).toEqual([
      'object',
      'object',
      'object',
      'object',
      'object',
    ]);
    expect(definitions[0]?.input_schema.required).toEqual(['requete']);
    expect(definitions[2]?.input_schema.required).toEqual(['depuis']);
  });

  it('se décrivent en français et disent qu’elles ne rendent que ce que l’utilisateur voit', () => {
    for (const tool of tools) expect(tool.description.length).toBeGreaterThan(40);
    expect(tools[0]?.description).toContain('ce que l’utilisateur a le droit de voir');
  });

  // T06b : on demande à l'agent de resserrer ; un mot ajouté n'y suffit plus quand la recherche trouve peu de
  // sources (passe élargie). La description de la requête dit comment resserrer.
  it('disent comment resserrer une recherche', () => {
    const properties = toolDefinitions(tools)[0]?.input_schema.properties as
      | Record<string, { description?: string }>
      | undefined;
    expect(properties?.requete?.description).toContain(QUERY_SYNTAX_DESCRIPTION);
  });
});
