import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  antigravityReportTurns,
  extractAntigravityBackstage,
  extractAntigravityFacts,
} from '../capture/antigravity';
import { loadAntigravitySubagents, loadCodexSubagents, loadSubagents } from './subagents';

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

  it('ne lit pas un sous-agent qui n’a que transcript.jsonl ; lit les sous-agents d’un sous-agent lu', async () => {
    const lus: string[] = [];
    const deps = disque(
      {
        [`${fiches(S)}/${R}.json`]: fiche(R),
        [`${fiches(S)}/${N}.json`]: fiche(N),
        [`${logs(R)}/transcript.jsonl`]: 'court R',
        [`${logs(N)}/transcript_full.jsonl`]: 'complet N',
        [`${fiches(N)}/${G}.json`]: fiche(G),
        [`${logs(G)}/transcript_full.jsonl`]: 'complet G',
        [`${logs(G)}/transcript.jsonl`]: 'court G',
      },
      { [fiches(S)]: [`${R}.json`, `${N}.json`], [fiches(N)]: [`${G}.json`] },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadAntigravitySubagents(SESSION_AG, { ...deps, readFile })).toEqual({
      named: new Map([
        [S, [R, N]],
        [N, [G]],
        [G, []],
      ]),
      transcripts: new Map([
        [N, 'complet N'],
        [G, 'complet G'],
      ]),
    });
    expect(lus.filter((path) => path.endsWith('/transcript.jsonl'))).toEqual([]);
  });

  it('un sous-agent qui n’a que transcript.jsonl rend la session externe, sans tour ni bloc rapport pour lui', async () => {
    const brain = fileURLToPath(
      new URL('../capture/fixtures/antigravity-sous-agents/brain', import.meta.url),
    );
    const lu = (id: string) =>
      readFile(`${brain}/${id}/.system_generated/logs/transcript_full.jsonl`, 'utf8');
    const [session, lecture] = await Promise.all([lu(S), lu(R)]);
    const ESSAI = '/Users/demo/projets/essai';
    const fichier = { path: SESSION_AG, mtime: new Date('2026-11-13T12:30:00.000Z') };
    // Deux sous-agents qui ne font que lire le dépôt ; R se lit dans `nom`.
    const juge = async (nom: string) => {
      const sa = await loadAntigravitySubagents(
        SESSION_AG,
        disque(
          {
            [`${fiches(S)}/${R}.json`]: fiche(R),
            [`${fiches(S)}/${N}.json`]: fiche(N),
            [`${logs(R)}/${nom}`]: lecture,
            [`${logs(N)}/transcript_full.jsonl`]: lecture,
          },
          { [fiches(S)]: [`${R}.json`, `${N}.json`] },
        ),
      );
      return {
        externe: extractAntigravityFacts(session, fichier, ESSAI, null, sa).externe,
        tours: antigravityReportTurns(fichier, sa).filter(({ external_id }) =>
          external_id.includes(R),
        ).length,
        rapport: extractAntigravityBackstage(session, fichier, ESSAI, sa).some(
          ({ id }) => id === `${R}:rapport`,
        ),
      };
    };

    expect(await juge('transcript_full.jsonl')).toEqual({
      externe: false,
      tours: 1,
      rapport: true,
    });
    expect(await juge('transcript.jsonl')).toEqual({ externe: true, tours: 0, rapport: false });
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

  // La conversation de la session sert aussi à un chemin : hors d'un UUID, rien n'est lu, même hors de `brain/`.
  it.each([
    ['dont la conversation n’est pas un UUID', `${BRAIN}/essai`],
    ['qui remonte hors de brain', `${BRAIN}/..`],
  ])('ne lit rien pour une session %s', async (_cas, conversation) => {
    const lus: string[] = [];
    const deps = disque(
      {
        [`${conversation}/.system_generated/subagents/${R}.json`]: fiche(R),
        [`/home/demo/.gemini/antigravity/.system_generated/subagents/${R}.json`]: fiche(R),
        [`${logs(R)}/transcript_full.jsonl`]: 'R',
      },
      {
        [`${conversation}/.system_generated/subagents`]: [`${R}.json`],
        '/home/demo/.gemini/antigravity/.system_generated/subagents': [`${R}.json`],
      },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(
      await loadAntigravitySubagents(
        `${conversation}/.system_generated/logs/transcript_full.jsonl`,
        { ...deps, readFile },
      ),
    ).toEqual(vide);
    expect(lus).toEqual([]);
  });

  it('sans listage du disque, rend des tables vides', async () => {
    const { readFile } = disque({ [`${fiches(S)}/${R}.json`]: fiche(R) }, {});
    expect(await loadAntigravitySubagents(SESSION_AG, { readFile })).toEqual(vide);
  });
});

// Codex (annexe 09) : le fichier d'un sous-agent est `rollout-<date>-<fil>.jsonl`, dans le dossier de la session ; ses
// fils viennent des éléments SubAgentActivity démarrés.
describe('loadCodexSubagents', () => {
  const S = '019a7d2c-1111-7111-8111-111111111111';
  const L = '019a7d2c-2222-7222-8222-222222222222';
  const W = '019a7d2c-3333-7333-8333-333333333333';
  const G = '019a7d2c-4444-7444-8444-444444444444';
  const JOUR = '/home/demo/.codex/sessions/2026/11/13';
  const nom = (fil: string) => `rollout-2026-11-13T10-56-00-${fil}.jsonl`;
  const chemin = (fil: string) => `${JOUR}/${nom(fil)}`;
  // Un rollout inventé, en historique paginé, qui lance les fils donnés.
  const lance = (...fils: string[]) =>
    [
      JSON.stringify({
        timestamp: '2026-11-13T10:56:00.000Z',
        ordinal: 0,
        type: 'session_meta',
        payload: { id: 'x', history_mode: 'paginated' },
      }),
      ...fils.map((fil, index) =>
        JSON.stringify({
          timestamp: '2026-11-13T10:56:01.000Z',
          ordinal: index + 1,
          type: 'event_msg',
          payload: {
            type: 'item_completed',
            item: { type: 'SubAgentActivity', kind: 'started', agent_thread_id: fil },
          },
        }),
      ),
    ].join('\n');

  it('lit la fixture : les deux sous-agents lancés par la session, à côté d’elle', async () => {
    const dossier = fileURLToPath(
      new URL('../capture/fixtures/codex-sous-agents', import.meta.url),
    );
    const lire = (date: string, fil: string) =>
      readFile(`${dossier}/rollout-2026-11-13T${date}-${fil}.jsonl`, 'utf8');

    expect(
      await loadCodexSubagents(`${dossier}/rollout-2026-11-13T10-56-00-${S}.jsonl`, {
        readFile: (path) => readFile(path, 'utf8'),
        readdir,
      }),
    ).toEqual(
      new Map([
        [L, await lire('10-56-05', L)],
        [W, await lire('10-56-06', W)],
      ]),
    );
  });

  it('lit les sous-agents d’un sous-agent, une fois chacun', async () => {
    const lus: string[] = [];
    const deps = disque(
      { [chemin(S)]: lance(L), [chemin(L)]: lance(G, L), [chemin(G)]: lance(L) },
      { [JOUR]: [nom(S), nom(L), nom(G)] },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadCodexSubagents(chemin(S), { ...deps, readFile })).toEqual(
      new Map([
        [L, lance(G, L)],
        [G, lance(L)],
      ]),
    );
    expect(lus).toEqual([chemin(S), chemin(L), chemin(G)]);
  });

  it('ignore un fil qui n’est pas un UUID, sans rien lire pour lui', async () => {
    const lus: string[] = [];
    const deps = disque(
      { [chemin(S)]: lance('../x', 'x', `${L}/..`, `${L}.jsonl`), [`${JOUR}/x.jsonl`]: 'x' },
      { [JOUR]: [nom(S), 'x.jsonl', 'rollout-x-x.jsonl'] },
    );
    const readFile = async (path: string) => {
      lus.push(path);
      return deps.readFile(path);
    };

    expect(await loadCodexSubagents(chemin(S), { ...deps, readFile })).toEqual(new Map());
    expect(lus).toEqual([chemin(S)]);
  });

  it.each([
    ['dont le fichier manque', {}, [nom(S), nom(W)]],
    ['dont le fichier ne se lit pas', {}, [nom(S), nom(L), nom(W)]],
    [
      'dont le fichier est dans un autre jour',
      { [`/home/demo/.codex/sessions/2026/11/12/${nom(L)}`]: 'L' },
      [nom(S), nom(W)],
    ],
    [
      'porté par deux fichiers',
      { [chemin(L)]: 'L', [`${JOUR}/rollout-2026-11-13T11-00-00-${L}.jsonl`]: 'L bis' },
      [nom(S), nom(L), `rollout-2026-11-13T11-00-00-${L}.jsonl`, nom(W)],
    ],
  ])(
    'laisse de côté, sans erreur, un sous-agent %s ; les autres se lisent',
    async (_cas, fichiers, noms) => {
      const deps = disque(
        { ...fichiers, [chemin(S)]: lance(L, W), [chemin(W)]: 'W' },
        { [JOUR]: noms },
      );

      expect(await loadCodexSubagents(chemin(S), deps)).toEqual(new Map([[W, 'W']]));
    },
  );

  it.each([
    ['relative', `sessions/2026/11/13/${nom(S)}`],
    ['illisible', `${JOUR}/${nom(G)}`],
  ])('rend une table vide pour une session %s', async (_cas, session) => {
    const deps = disque(
      { [chemin(S)]: lance(L), [`sessions/2026/11/13/${nom(S)}`]: lance(L), [chemin(L)]: 'L' },
      { [JOUR]: [nom(S), nom(L)], 'sessions/2026/11/13': [nom(S), nom(L)] },
    );

    expect(await loadCodexSubagents(session, deps)).toEqual(new Map());
  });

  it('sans listage du disque, rend une table vide', async () => {
    const { readFile } = disque({ [chemin(S)]: lance(L), [chemin(L)]: 'L' }, {});
    expect(await loadCodexSubagents(chemin(S), { readFile })).toEqual(new Map());
  });
});
