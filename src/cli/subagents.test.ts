import { describe, expect, it } from 'vitest';
import { loadSubagents } from './subagents';

// Un disque inventé : chemin → contenu ; un dossier se liste par ses noms.
const SESSION = '/home/demo/.claude/projects/-demo/55555555-5555-4555-8555-555555555555.jsonl';
const DOSSIER = '/home/demo/.claude/projects/-demo/55555555-5555-4555-8555-555555555555/subagents';
const meta = (toolUseId: string) => JSON.stringify({ agentType: 'general-purpose', toolUseId });

function disque(fichiers: Record<string, string>, dossiers: Record<string, string[]>) {
  const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' });
  return {
    readFile: async (path: string) => {
      const contenu = fichiers[path];
      if (contenu === undefined) throw absent();
      return contenu;
    },
    readdir: async (path: string) => {
      const noms = dossiers[path];
      if (noms === undefined) throw absent();
      return noms;
    },
  };
}

describe('loadSubagents', () => {
  it('relie chaque appel à son fichier par le toolUseId du meta.json, dans le dossier à plat', async () => {
    const deps = disque(
      {
        [`${DOSSIER}/agent-a1.meta.json`]: meta('toolu_1'),
        [`${DOSSIER}/agent-a1.jsonl`]: 'echanges 1',
        [`${DOSSIER}/agent-b2.meta.json`]: meta('toolu_2'),
        [`${DOSSIER}/agent-b2.jsonl`]: 'echanges 2',
        [`${DOSSIER}/workflows/agent-c3.meta.json`]: meta('toolu_3'),
        [`${DOSSIER}/workflows/agent-c3.jsonl`]: 'echanges 3',
      },
      {
        [DOSSIER]: [
          'agent-a1.jsonl',
          'agent-a1.meta.json',
          'agent-b2.meta.json',
          'agent-b2.jsonl',
          'workflows',
        ],
        [`${DOSSIER}/workflows`]: ['agent-c3.meta.json', 'agent-c3.jsonl'],
      },
    );

    expect(await loadSubagents(SESSION, deps)).toEqual(
      new Map([
        ['toolu_1', 'echanges 1'],
        ['toolu_2', 'echanges 2'],
      ]),
    );
  });

  it('ignore un nom hors forme (agentId hors de [a-z0-9]{1,64}), sans lire son fichier', async () => {
    const lus: string[] = [];
    const deps = disque(
      {
        [`${DOSSIER}/agent-A1.meta.json`]: meta('toolu_1'),
        [`${DOSSIER}/agent-a1.jsonl`]: 'x',
        [`${DOSSIER}/agent-..%2fx.meta.json`]: meta('toolu_2'),
        [`${DOSSIER}/agent-${'a'.repeat(65)}.meta.json`]: meta('toolu_3'),
        [`${DOSSIER}/prefix.json`]: meta('toolu_4'),
      },
      {
        [DOSSIER]: [
          'agent-A1.meta.json',
          'agent-..%2fx.meta.json',
          `agent-${'a'.repeat(65)}.meta.json`,
          'prefix.json',
        ],
      },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadSubagents(SESSION, { ...deps, readFile })).toEqual(new Map());
    expect(lus).toEqual([]);
  });

  it.each([
    ['un .jsonl absent', { [`${DOSSIER}/agent-a1.meta.json`]: meta('toolu_1') }],
    [
      'un meta.json illisible',
      { [`${DOSSIER}/agent-a1.meta.json`]: '{pas du JSON', [`${DOSSIER}/agent-a1.jsonl`]: 'x' },
    ],
    [
      'un meta.json sans toolUseId',
      {
        [`${DOSSIER}/agent-a1.meta.json`]: '{"agentType":"x"}',
        [`${DOSSIER}/agent-a1.jsonl`]: 'x',
      },
    ],
  ])('laisse de côté, sans erreur, %s ; les autres se lisent', async (_cas, fichiers) => {
    const deps = disque(
      {
        ...fichiers,
        [`${DOSSIER}/agent-b2.meta.json`]: meta('toolu_2'),
        [`${DOSSIER}/agent-b2.jsonl`]: 'y',
      },
      { [DOSSIER]: ['agent-a1.meta.json', 'agent-b2.meta.json'] },
    );

    expect(await loadSubagents(SESSION, deps)).toEqual(new Map([['toolu_2', 'y']]));
  });

  it('rend une table vide pour un dossier absent', async () => {
    expect(await loadSubagents(SESSION, disque({}, {}))).toEqual(new Map());
  });

  it('rend une table vide pour un chemin de session relatif', async () => {
    const relatif = 'projects/-demo/s1/subagents';
    const deps = disque(
      { [`${relatif}/agent-a1.meta.json`]: meta('toolu_1'), [`${relatif}/agent-a1.jsonl`]: 'x' },
      { [relatif]: ['agent-a1.meta.json'] },
    );

    expect(await loadSubagents('projects/-demo/s1.jsonl', deps)).toEqual(new Map());
  });

  it('sans listage du disque, rend une table vide', async () => {
    const { readFile } = disque({}, {});
    expect(await loadSubagents(SESSION, { readFile })).toEqual(new Map());
  });
});
