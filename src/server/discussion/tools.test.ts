import { describe, expect, it } from 'vitest';
import { toolDefinitions } from '@/server/llm/anthropic-llm';
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

  it('sont chercher, lire et activite', () => {
    expect(tools.map((tool) => tool.name)).toEqual(['chercher', 'lire', 'activite']);
  });

  it('passent la vérification des outils de l’API', () => {
    const definitions = toolDefinitions(tools);

    expect(definitions.map((tool) => tool.input_schema.type)).toEqual([
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
});
