import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAntigravitySubagents, loadSubagents } from './subagents';

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

  // Deux fichiers pour un même appel : on ne sait pas lequel juger, l'appel reste externe, quel que soit l'ordre.
  it.each([
    [['agent-a1.meta.json', 'agent-b2.meta.json', 'agent-c3.meta.json']],
    [['agent-c3.meta.json', 'agent-b2.meta.json', 'agent-a1.meta.json']],
  ])('écarte un toolUseId porté par deux meta.json (ordre %j)', async (noms) => {
    const deps = disque(
      {
        [`${DOSSIER}/agent-a1.meta.json`]: meta('toolu_1'),
        [`${DOSSIER}/agent-a1.jsonl`]: 'web',
        [`${DOSSIER}/agent-b2.meta.json`]: meta('toolu_1'),
        [`${DOSSIER}/agent-b2.jsonl`]: 'depot',
        [`${DOSSIER}/agent-c3.meta.json`]: meta('toolu_2'),
        [`${DOSSIER}/agent-c3.jsonl`]: 'y',
      },
      { [DOSSIER]: noms },
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

// Antigravity (annexe 11) : la session nomme ses sous-agents dans `.system_generated/subagents/<id>.json` ; chacun est
// une conversation à part, `brain/<id>/`, dans la même variante.
describe('loadAntigravitySubagents', () => {
  const S = '11111111-1111-4111-8111-111111111111';
  const R = '22222222-2222-4222-8222-222222222222';
  const N = '33333333-3333-4333-8333-333333333333';
  const G = '44444444-4444-4444-8444-444444444444';
  const BRAIN = '/home/demo/.gemini/antigravity/brain';
  const logs = (id: string) => `${BRAIN}/${id}/.system_generated/logs`;
  const fiches = (id: string) => `${BRAIN}/${id}/.system_generated/subagents`;
  const fiche = (id: string) =>
    JSON.stringify({ conversationId: id, state: 'SUBAGENT_STATE_ALIVE' });
  const SESSION_AG = `${logs(S)}/transcript_full.jsonl`;
  const vide = { named: new Map(), transcripts: new Map() };

  it('lit la fixture : les deux sous-agents nommés par la session et leur transcript complet', async () => {
    const brain = fileURLToPath(
      new URL('../capture/fixtures/antigravity-sous-agents/brain', import.meta.url),
    );
    const transcript = (id: string) =>
      readFile(`${brain}/${id}/.system_generated/logs/transcript_full.jsonl`, 'utf8');

    const sousAgents = await loadAntigravitySubagents(
      `${brain}/${S}/.system_generated/logs/transcript_full.jsonl`,
      { readFile: (path) => readFile(path, 'utf8'), readdir },
    );

    expect(sousAgents).toEqual({
      named: new Map([
        [S, [R, N]],
        [R, []],
        [N, []],
      ]),
      transcripts: new Map([
        [R, await transcript(R)],
        [N, await transcript(N)],
      ]),
    });
  });

  it('lit transcript.jsonl quand transcript_full.jsonl manque, puis les sous-agents d’un sous-agent', async () => {
    const deps = disque(
      {
        [`${fiches(S)}/${R}.json`]: fiche(R),
        [`${logs(R)}/transcript.jsonl`]: 'court R',
        [`${fiches(R)}/${G}.json`]: fiche(G),
        [`${logs(G)}/transcript_full.jsonl`]: 'complet G',
        [`${logs(G)}/transcript.jsonl`]: 'court G',
      },
      { [fiches(S)]: [`${R}.json`], [fiches(R)]: [`${G}.json`] },
    );

    expect(await loadAntigravitySubagents(SESSION_AG, deps)).toEqual({
      named: new Map([
        [S, [R]],
        [R, [G]],
        [G, []],
      ]),
      transcripts: new Map([
        [R, 'court R'],
        [G, 'complet G'],
      ]),
    });
  });

  it('ignore un nom de fiche qui n’est pas un UUID, sans rien lire pour lui', async () => {
    const lus: string[] = [];
    const deps = disque(
      { [`${BRAIN}/x.json`]: fiche('x') },
      { [fiches(S)]: ['../x.json', 'x.json', `${R}.JSON`, `${R}.json.bak`, 'read.json'] },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadAntigravitySubagents(SESSION_AG, { ...deps, readFile })).toEqual({
      named: new Map([[S, []]]),
      transcripts: new Map(),
    });
    expect(lus).toEqual([]);
  });

  it.each([
    ['une fiche illisible', '{pas du JSON'],
    ['une fiche sans conversationId', '{"state":"SUBAGENT_STATE_ALIVE"}'],
    ['une fiche d’une autre conversation', fiche(N)],
  ])('ne nomme pas le sous-agent d’%s, ni ne lit sa conversation', async (_cas, contenu) => {
    const deps = disque(
      {
        [`${fiches(S)}/${R}.json`]: contenu,
        [`${logs(R)}/transcript_full.jsonl`]: 'R',
        [`${logs(N)}/transcript_full.jsonl`]: 'N',
      },
      { [fiches(S)]: [`${R}.json`] },
    );

    expect(await loadAntigravitySubagents(SESSION_AG, deps)).toEqual({
      named: new Map([[S, []]]),
      transcripts: new Map(),
    });
  });

  it('nomme un sous-agent dont la conversation ne se lit pas, sans transcript', async () => {
    const deps = disque({ [`${fiches(S)}/${R}.json`]: fiche(R) }, { [fiches(S)]: [`${R}.json`] });

    expect(await loadAntigravitySubagents(SESSION_AG, deps)).toEqual({
      named: new Map([[S, [R]]]),
      transcripts: new Map(),
    });
  });

  it('ne relit pas une conversation déjà lue (un sous-agent qui nomme la session ou lui-même)', async () => {
    const lus: string[] = [];
    const deps = disque(
      {
        [`${fiches(S)}/${R}.json`]: fiche(R),
        [`${logs(R)}/transcript_full.jsonl`]: 'R',
        [`${fiches(R)}/${S}.json`]: fiche(S),
        [`${fiches(R)}/${R}.json`]: fiche(R),
      },
      { [fiches(S)]: [`${R}.json`], [fiches(R)]: [`${S}.json`, `${R}.json`] },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadAntigravitySubagents(SESSION_AG, { ...deps, readFile })).toEqual({
      named: new Map([
        [S, [R]],
        [R, [S, R]],
      ]),
      transcripts: new Map([[R, 'R']]),
    });
    expect(lus.filter((path) => path.includes('/logs/'))).toEqual([
      `${logs(R)}/transcript_full.jsonl`,
    ]);
  });

  it.each([
    ['relatif', `antigravity/brain/${S}/.system_generated/logs/transcript_full.jsonl`],
    ['hors d’un dossier brain', `/home/demo/ailleurs/${S}/.system_generated/logs/transcript.jsonl`],
    ['d’un autre nom', `${logs(S)}/autre.jsonl`],
  ])('rend des tables vides pour un fichier de session %s', async (_cas, chemin) => {
    const deps = disque(
      { [`${fiches(S)}/${R}.json`]: fiche(R), [`${logs(R)}/transcript_full.jsonl`]: 'R' },
      { [fiches(S)]: [`${R}.json`] },
    );

    expect(await loadAntigravitySubagents(chemin, deps)).toEqual(vide);
  });

  it('sans listage du disque, rend des tables vides', async () => {
    const { readFile } = disque({ [`${fiches(S)}/${R}.json`]: fiche(R) }, {});
    expect(await loadAntigravitySubagents(SESSION_AG, { readFile })).toEqual(vide);
  });
});
