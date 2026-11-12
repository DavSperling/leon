import { describe, expect, it } from 'vitest';
import { CONTENT_EN, CONTENT_FR } from './content';
import { isFilterQuery } from './parts';

// Le typecheck vérifie la forme des tables anglaises ; les identifiants, les adresses et les outils, eux, doivent
// être les mêmes qu'en français : une équipe absente casserait /cas-usage/<équipe> en anglais.
const ids = <T, K extends keyof T>(rows: readonly T[], key: K) => rows.map((row) => row[key]);

describe('le site en anglais', () => {
  it('a les mêmes équipes, démos, situations et étapes qu’en français', () => {
    expect(ids(CONTENT_EN.teams, 'slug')).toEqual(ids(CONTENT_FR.teams, 'slug'));
    expect(ids(CONTENT_EN.teams, 'tools')).toEqual(ids(CONTENT_FR.teams, 'tools'));
    expect(ids(CONTENT_EN.teams, 'icon')).toEqual(ids(CONTENT_FR.teams, 'icon'));
    expect(CONTENT_EN.teams.map((t) => t.demo.id)).toEqual(CONTENT_FR.teams.map((t) => t.demo.id));
    expect(ids(CONTENT_EN.demos, 'id')).toEqual(ids(CONTENT_FR.demos, 'id'));
    expect(CONTENT_EN.demos.map((d) => d.sources.map((s) => s.tool))).toEqual(
      CONTENT_FR.demos.map((d) => d.sources.map((s) => s.tool)),
    );
    expect(ids(CONTENT_EN.situations, 'id')).toEqual(ids(CONTENT_FR.situations, 'id'));
    expect(ids(CONTENT_EN.situations, 'team')).toEqual(ids(CONTENT_FR.situations, 'team'));
    expect(ids(CONTENT_EN.situations, 'tools')).toEqual(ids(CONTENT_FR.situations, 'tools'));
    expect(ids(CONTENT_EN.pillars, 'id')).toEqual(ids(CONTENT_FR.pillars, 'id'));
    expect(ids(CONTENT_EN.navLinks, 'href')).toEqual(ids(CONTENT_FR.navLinks, 'href'));
  });

  it('écrit ses requêtes en filtres comme en français, et ses renvois [n] vers des sources qui existent', () => {
    const queries = (c: typeof CONTENT_FR) =>
      c.teams.flatMap((t) => t.questions).concat(c.demos.map((d) => d.query));
    expect(queries(CONTENT_EN).map(isFilterQuery)).toEqual(queries(CONTENT_FR).map(isFilterQuery));
    for (const demo of CONTENT_EN.demos) {
      const refs = [...demo.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      expect(Math.max(...refs), demo.id).toBe(demo.sources.length);
    }
  });
});

// Le MCP s'ouvre en collant son adresse dans l'assistant puis en l'autorisant dans Leon, plus par un jeton personnel.
describe('la FAQ du site et le MCP distant', () => {
  it.each([
    ['fr', CONTENT_FR, /adresse/, /autoris/, /jeton/i],
    ['en', CONTENT_EN, /address/, /authorize/, /token/i],
  ] as const)(
    'en %s, la réponse sur l’interrogation depuis un assistant dit adresse collée puis autorisation, pas un jeton',
    (_locale, content, address, authorize, token) => {
      const answer = content.faq.find((entry) => /MCP/.test(entry.a))?.a ?? '';
      expect(answer).toMatch(address);
      expect(answer).toMatch(authorize);
      expect(answer).not.toMatch(token);
    },
  );
});
