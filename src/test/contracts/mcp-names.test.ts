import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

const sources = productionSources('src/server/mcp/**/*.ts');

const REGISTERED = new Set(
  sources.flatMap(({ text }) => [...text.matchAll(/registerTool\(\s*'([^']+)'/g)].map((m) => m[1])),
);

// Les consignes (MCP_INSTRUCTIONS, descriptions, mentions) citent des outils par leur nom : un
// renommage qui les laisserait en l'état donnerait à l'agent une consigne qu'il ne peut pas suivre.
describe('noms des outils MCP des tâches', () => {
  it('trouve les outils enregistrés', () => {
    expect([...REGISTERED]).toEqual(expect.arrayContaining(['search', 'task_list', 'task_start']));
  });

  it('n’en cite aucun qui ne soit pas enregistré', () => {
    const cited = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/\btask_[a-z]+\b/g)].map((match) => ({ path, name: match[0] })),
    );
    expect(cited.length).toBeGreaterThan(10);
    expect(cited.filter(({ name }) => !REGISTERED.has(name))).toEqual([]);
  });
});
