import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type AntigravitySubagents,
  conversationOf,
  extractAntigravityBackstage,
  extractAntigravityFacts,
  parseAntigravitySession,
} from './antigravity';
import { SECRET_MASK } from './mask-secrets';
import { SessionFactsSchema } from './session-facts';
import { isTypedTurn, TURN_TEXT_MAX } from './turn';

// Fixture inventée, sur la forme d'un transcript d'Antigravity relevée par un lecteur public (jamais une vraie
// conversation). shortcut: à rejouer sur un transcript de l'essai T31.
const content = readFileSync(
  new URL('./fixtures/antigravity/transcript-simple.jsonl', import.meta.url),
  'utf8',
);
const RACINE = '/Users/demo/projets/leon';
const CONVERSATION = 'a1b2c3d4-0000-4000-8000-000000000001';
const FILE = {
  path: `/Users/demo/.gemini/antigravity/brain/${CONVERSATION}/.system_generated/logs/transcript.jsonl`,
  mtime: new Date('2026-11-06T10:01:10.000Z'),
};

const step = (fields: Record<string, unknown>) =>
  JSON.stringify({ source: 'MODEL', created_at: '2026-11-06T10:00:00Z', ...fields });
const call = (name: string, args: unknown) =>
  step({ type: 'PLANNER_RESPONSE', content: '', tool_calls: [{ name, args }] });

describe('parseAntigravitySession', () => {
  it('lit les tours de transcript-simple : USER_REQUEST et les réponses, sans historique ni message système', () => {
    const session = parseAntigravitySession(content, FILE);

    expect(session).toMatchObject({
      sessionId: CONVERSATION,
      cwd: RACINE,
      title: 'Ajoute le lecteur des sessions Antigravity.',
      branche: null,
    });
    expect(session?.turns.map((t) => [t.external_id, t.role, t.text, t.ts])).toEqual([
      [
        `${CONVERSATION}:000001`,
        'user',
        'Ajoute le lecteur des sessions Antigravity.',
        '2026-11-06T10:00:01Z',
      ],
      [`${CONVERSATION}:000002`, 'assistant', 'Je crée la branche.', '2026-11-06T10:00:03Z'],
      [
        `${CONVERSATION}:000011`,
        'assistant',
        'Le lecteur est écrit, un test échoue encore.',
        '2026-11-06T10:00:25Z',
      ],
      [`${CONVERSATION}:000014`, 'user', 'Corrige le test.', '2026-11-06T10:01:00Z'],
      [`${CONVERSATION}:000015`, 'assistant', 'Corrigé.', '2026-11-06T10:01:05Z'],
    ]);
  });

  it('la conversation est le dossier sous brain', () => {
    expect(conversationOf(FILE.path)).toBe(CONVERSATION);
    expect(conversationOf(FILE.path.replace('transcript.jsonl', 'transcript_full.jsonl'))).toBe(
      CONVERSATION,
    );
  });

  it('ne lit pas la conversation d’un sous-agent ; garde, marqué, un message que l’outil écrit', () => {
    const sub = step({
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      content: '<subagent_reminder>\ncaller agent id: p\n</subagent_reminder>\ntâche',
    });
    expect(parseAntigravitySession(sub, FILE)).toBeNull();

    const lines = [
      step({ step_index: 1, type: 'USER_INPUT', source: 'SYSTEM', content: 'Relance automatique' }),
      step({
        step_index: 2,
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        content: '<USER_REQUEST>Corrige le test.</USER_REQUEST>',
      }),
    ].join('\n');
    const session = parseAntigravitySession(lines, FILE);
    expect(session?.turns.map((t) => [t.external_id, t.text, t.injecte])).toEqual([
      [`${CONVERSATION}:000001`, 'Relance automatique', true],
      [`${CONVERSATION}:000002`, 'Corrige le test.', false],
    ]);
    // Ni titre ni échange tirés du message injecté.
    expect(session?.title).toBe('Corrige le test.');
    expect(extractAntigravityFacts(lines, FILE, RACINE).echanges).toBe(1);
  });

  // Échec fermé : seul `USER_EXPLICIT` dit le message tapé ; une étape sans `source` est un format inconnu.
  it('marque injecté un message sans `source`, qui ne compte pas comme échange', () => {
    const lines = JSON.stringify({
      type: 'USER_INPUT',
      content: '<USER_REQUEST>Sans source</USER_REQUEST>',
    });
    expect(parseAntigravitySession(lines, FILE)?.turns.map((t) => t.injecte)).toEqual([true]);
    expect(extractAntigravityFacts(lines, FILE, RACINE).echanges).toBe(0);
  });

  // Depuis l'appli 2.0.6 (annexe 05, essai du 11/11), ce que Leon injecte s'écrit dans le transcript, en
  // `EPHEMERAL_MESSAGE` : ni le bloc ni le rappel ne reviennent comme un tour.
  it('une étape EPHEMERAL_MESSAGE ne devient jamais un tour, même avec une ligne <rappel-leon>', () => {
    const lines = [
      step({
        step_index: 1,
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        content: '<USER_REQUEST>Où en est la branche etude ?</USER_REQUEST>',
      }),
      ...['SYSTEM', 'USER_EXPLICIT'].map((source, index) =>
        step({
          step_index: 2 + index,
          type: 'EPHEMERAL_MESSAGE',
          source,
          // Du texte autour de la balise : seul le type d'étape l'écarte, pas le retrait des blocs de Leon.
          content:
            'Ajouté par un crochet :\n<rappel-leon>Le fil amos/etude (id 3f2a) touche à ce message.</rappel-leon>',
        }),
      ),
      step({ step_index: 4, type: 'PLANNER_RESPONSE', content: 'La branche est prête.' }),
    ].join('\n');

    const session = parseAntigravitySession(lines, FILE);

    expect(session?.turns.map((t) => [t.external_id, t.role, t.text])).toEqual([
      [`${CONVERSATION}:000001`, 'user', 'Où en est la branche etude ?'],
      [`${CONVERSATION}:000004`, 'assistant', 'La branche est prête.'],
    ]);
    expect(extractAntigravityFacts(lines, FILE, RACINE).echanges).toBe(1);
  });

  it('retire les blocs de Leon ; sans date, un tour prend l’heure du fichier', () => {
    const session = parseAntigravitySession(
      [
        JSON.stringify({
          type: 'USER_INPUT',
          source: 'USER_EXPLICIT',
          content: '<USER_REQUEST>Question <contexte-leon>bloc</contexte-leon></USER_REQUEST>',
        }),
      ].join('\n'),
      FILE,
    );
    expect(session?.turns).toEqual([
      {
        external_id: `${CONVERSATION}:000000`,
        role: 'user',
        text: 'Question',
        ts: FILE.mtime.toISOString(),
        capture_mode: 'file',
        injecte: false,
      },
    ]);
  });
});

describe('extractAntigravityFacts', () => {
  it('relève les gestes de transcript-simple', () => {
    const faits = extractAntigravityFacts(content, FILE, RACINE, 'demo/antigravity');

    expect(faits).toEqual({
      branche: 'demo/antigravity',
      prs: [],
      commits: ['5e6f7a8'],
      fichiers: ['src/capture/antigravity.ts'],
      commandes: [
        { texte: 'git checkout', erreur: false },
        { texte: 'pnpm vitest', erreur: true },
        { texte: 'git commit', erreur: false },
      ],
      taches: [],
      erreurs: 1,
      externe: false,
      echanges: 2,
      debut: '2026-11-06T10:00:00Z',
      fin: '2026-11-06T10:01:05Z',
    });
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  describe('externe', () => {
    const externe = (...lines: string[]) =>
      extractAntigravityFacts(lines.join('\n'), FILE, RACINE).externe;

    it('SEARCH_WEB, CALL_MCP_TOOL, un sous-agent, une page web, une commande réseau : oui', () => {
      expect(externe(step({ type: 'SEARCH_WEB', content: 'résultats' }))).toBe(true);
      expect(externe(step({ type: 'CALL_MCP_TOOL', content: 'x' }))).toBe(true);
      expect(externe(step({ type: 'INVOKE_SUBAGENT', content: 'x' }))).toBe(true);
      expect(externe(call('search_web', { query: 'x' }))).toBe(true);
      expect(externe(call('read_url_content', { Url: 'https://example.com' }))).toBe(true);
      expect(externe(call('run_command', { CommandLine: 'curl -s https://example.com' }))).toBe(
        true,
      );
    });

    // Échec fermé (#160) : seuls les outils locaux relevés à l'essai T31 laissent la session non externe.
    it('un outil inconnu, ou `schedule` tant qu’on ne sait pas ce qu’il fait : oui', () => {
      expect(externe(call('outil_invente', { Query: 'x' }))).toBe(true);
      expect(externe(call('schedule', { Prompt: 'x' }))).toBe(true);
    });

    // shortcut d'antigravity.ts : la forme d'un appel MCP n'est pas relevée, même un outil local de Leon compte.
    it('un outil du serveur MCP de Leon : oui, faute d’en connaître la forme', () => {
      expect(externe(call('mcp_leon_thread', {}))).toBe(true);
    });

    it('lire, écrire, chercher, lister, la liste de tâches, les commandes locales, `leon` : non', () => {
      expect(
        externe(
          call('view_file', { AbsolutePath: `${RACINE}/a.ts` }),
          call('grep_search', { Query: 'x' }),
          call('list_dir', { DirectoryPath: RACINE }),
          call('write_to_file', { TargetFile: `${RACINE}/a.ts` }),
          call('replace_file_content', { TargetFile: `${RACINE}/a.ts` }),
          call('manage_task', {}),
          call('run_command', { CommandLine: 'pnpm test' }),
          call('run_command', { CommandLine: '~/.leon/bin/leon thread' }),
          call('run_command', {
            CommandLine: '~/.leon/bin/leon note --tool antigravity --session s-1 "reprendre"',
          }),
        ),
      ).toBe(false);
    });
  });

  // T31 : l'IDE écrit le code de sortie d'une commande dans l'étape (`exit_code`).
  it('le code de sortie de l’étape RUN_COMMAND compte avant celui que cite la sortie', () => {
    const faits = extractAntigravityFacts(
      [
        call('run_command', { CommandLine: 'pnpm test' }),
        step({ type: 'RUN_COMMAND', content: 'FAIL', exit_code: 1 }),
        call('run_command', { CommandLine: 'git status' }),
        step({ type: 'RUN_COMMAND', content: 'exit code: 1 (cité, pas réel)', exit_code: 0 }),
      ].join('\n'),
      FILE,
      RACINE,
    );
    expect(faits.commandes).toEqual([
      { texte: 'pnpm test', erreur: true },
      { texte: 'git status', erreur: false },
    ]);
    expect(faits.erreurs).toBe(1);
  });

  it('un fichier lu ou hors du dépôt n’est pas un fichier écrit', () => {
    const faits = extractAntigravityFacts(
      [
        call('view_file', { AbsolutePath: `${RACINE}/lu.ts` }),
        call('write_to_file', { TargetFile: '/tmp/ailleurs.ts' }),
        call('replace_file_content', { TargetFile: `${RACINE}/b.ts` }),
      ].join('\n'),
      FILE,
      RACINE,
    );
    expect(faits.fichiers).toEqual(['b.ts']);
  });
});

// --- La forme de l'appli 2.31.0 (annexe 11) ------------------------------------------------------------------------
// Fixture inventée dans la forme du relevé de l'annexe 11 : une session qui lance deux sous-agents (l'un lit a.txt,
// l'autre ouvre le navigateur), un send_message, des commandes ; le résultat d'un appel est l'étape qui le suit.
const S = '11111111-1111-4111-8111-111111111111';
const R = '22222222-2222-4222-8222-222222222222'; // le sous-agent qui ne fait que lire
const N = '33333333-3333-4333-8333-333333333333'; // le sous-agent du navigateur
const G = '44444444-4444-4444-8444-444444444444'; // un sous-agent de sous-agent
const ESSAI = '/Users/demo/projets/essai';
const transcript = (id: string) =>
  readFileSync(
    new URL(
      `./fixtures/antigravity-sous-agents/brain/${id}/.system_generated/logs/transcript_full.jsonl`,
      import.meta.url,
    ),
    'utf8',
  );
const SESSION = transcript(S);
const RECHERCHE = transcript(R);
const NAVIGATEUR = transcript(N);
const FICHIER = {
  path: `/Users/demo/.gemini/antigravity/brain/${S}/.system_generated/logs/transcript_full.jsonl`,
  mtime: new Date('2026-11-13T12:30:00.000Z'),
};
const sousAgents = (
  named: Record<string, string[]>,
  transcripts: Record<string, string> = {},
): AntigravitySubagents => ({
  named: new Map(Object.entries(named)),
  transcripts: new Map(Object.entries(transcripts)),
});
const FIXTURE = sousAgents({ [S]: [R, N], [R]: [], [N]: [] }, { [R]: RECHERCHE, [N]: NAVIGATEUR });
const FAUX_SECRET = `ghp_${'a'.repeat(36)}`;
const TS = '2026-11-06T10:00:00Z';

// Des étapes inventées dans la même forme.
const etape = (step_index: number, fields: Record<string, unknown>) =>
  step({ step_index, status: 'DONE', ...fields });
const appels = (step_index: number, ...calls: [string, unknown][]) =>
  etape(step_index, {
    type: 'PLANNER_RESPONSE',
    tool_calls: calls.map(([name, args]) => ({ name, args })),
  });
const resultat = (step_index: number, status = 'DONE', content = 'fait') =>
  etape(step_index, { type: 'GENERIC', status, content });
const fin = (step_index: number) =>
  etape(step_index, { type: 'PLANNER_RESPONSE', content: 'Fini.' });
// Un sous-agent qui a rendu la main : sa consigne, chaque appel suivi de son résultat, puis une réponse sans appel.
const sousAgent = (...calls: [string, unknown][]) =>
  [
    etape(0, {
      source: 'SYSTEM',
      type: 'SYSTEM_MESSAGE',
      content: '<SYSTEM_MESSAGE>Tâche.</SYSTEM_MESSAGE>',
    }),
    ...calls.flatMap((call, index) => [appels(2 * index + 1, call), resultat(2 * index + 2)]),
    fin(2 * calls.length + 1),
  ].join('\n');
// Une session qui lance un sous-agent, puis répond.
const LANCE = [appels(1, ['invoke_subagent', { Prompt: 'Cherche.' }]), resultat(2), fin(3)].join(
  '\n',
);
// Une conversation ordinaire, finie, qu'une fiche de sous-agent nommerait : sa première étape est la personne.
const ORDINAIRE = [
  etape(0, { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'Lis le plan.' }),
  appels(1, ['read_file', { Path: `${ESSAI}/a.txt` }]),
  resultat(2),
  fin(3),
].join('\n');
const coupe = (contenu: string) => contenu.trimEnd().split('\n').slice(0, -1).join('\n');
const illisible = (contenu: string) => contenu.replace('\n', '\n{pas du JSON\n');

describe('Antigravity 2.31.0 (annexe 11)', () => {
  it('la conversation d’un sous-agent (première étape SYSTEM_MESSAGE) n’est pas une session', () => {
    expect(parseAntigravitySession(RECHERCHE, FICHIER)).toBeNull();
    expect(parseAntigravitySession(NAVIGATEUR, FICHIER)).toBeNull();
    expect(extractAntigravityFacts(NAVIGATEUR, FICHIER, ESSAI).echanges).toBe(0);
    expect(parseAntigravitySession(SESSION, FICHIER)?.turns.filter(isTypedTurn)).toHaveLength(2);
  });

  it('relève les gestes de la fixture : le résultat d’un appel est l’étape qui le suit', () => {
    const faits = extractAntigravityFacts(SESSION, FICHIER, ESSAI, 'main', FIXTURE);

    expect(faits).toEqual({
      branche: 'main',
      prs: [],
      commits: ['9a8b7c6'],
      fichiers: [],
      commandes: [
        { texte: 'ls', erreur: false }, // échoue, mais l'appli ne l'écrit plus : DONE
        { texte: 'git commit', erreur: false },
        { texte: 'rm', erreur: true }, // refusée : ERROR
      ],
      taches: [],
      erreurs: 1,
      externe: true,
      echanges: 2,
      debut: '2026-11-13T11:45:00Z',
      fin: '2026-11-13T11:46:21Z',
    });
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('une commande en ERROR, ou qui cite un code de sortie non nul, est en erreur ; la PR créée se lit dans son résultat', () => {
    const faits = extractAntigravityFacts(
      [
        appels(
          1,
          ['run_command', { CommandLine: 'pnpm test' }],
          ['run_command', { CommandLine: 'pnpm lint' }],
        ),
        resultat(2, 'ERROR', 'refusée'),
        resultat(3, 'DONE', 'Found 2 errors.\nexit code: 1'),
        appels(4, ['run_command', { CommandLine: 'gh pr create --fill' }]),
        resultat(5, 'DONE', 'https://github.com/demo/essai/pull/12'),
        appels(6, ['run_command', { CommandLine: 'git status' }]),
      ].join('\n'),
      FICHIER,
      ESSAI,
    );

    expect(faits.commandes).toEqual([
      { texte: 'pnpm test', erreur: true },
      { texte: 'pnpm lint', erreur: true },
      { texte: 'gh pr', erreur: false },
      { texte: 'git status', erreur: false }, // sans étape de résultat
    ]);
    expect(faits.erreurs).toBe(2);
    expect(faits.prs).toEqual([{ repo: 'demo/essai', numero: 12, par: 'gh-pr-create' }]);
  });

  it('un appel sans étape de résultat ne prend pas celle de l’appel suivant', () => {
    const faits = extractAntigravityFacts(
      [
        appels(1, ['run_command', { CommandLine: 'pnpm test' }]),
        appels(2, ['run_command', { CommandLine: 'pnpm lint' }]),
        resultat(3, 'ERROR'),
      ].join('\n'),
      FICHIER,
      ESSAI,
    );

    expect(faits.commandes).toEqual([
      { texte: 'pnpm test', erreur: false },
      { texte: 'pnpm lint', erreur: true },
    ]);
  });

  it('une étape de source SYSTEM entre un appel et son résultat n’en est pas le résultat', () => {
    const contenu = [
      appels(
        1,
        ['run_command', { CommandLine: 'pnpm test' }],
        ['run_command', { CommandLine: 'pnpm lint' }],
      ),
      etape(2, {
        source: 'SYSTEM',
        type: 'SYSTEM_MESSAGE',
        content: '<SYSTEM_MESSAGE>Un sous-agent a fini.</SYSTEM_MESSAGE>',
      }),
      resultat(3, 'DONE'),
      resultat(4, 'ERROR', 'refusée'),
    ].join('\n');
    const faits = extractAntigravityFacts(contenu, FICHIER, ESSAI);
    const blocs = extractAntigravityBackstage(contenu, FICHIER, ESSAI, sousAgents({}));

    expect(faits.commandes).toEqual([
      { texte: 'pnpm test', erreur: false },
      { texte: 'pnpm lint', erreur: true },
    ]);
    expect(faits.erreurs).toBe(1);
    expect(blocs.map((bloc) => bloc.role === 'appel_outil' && [bloc.id, bloc.statut])).toEqual([
      ['1:0', 'ok'],
      ['1:1', 'erreur'],
    ]);
  });

  describe('le sous-agent (T63)', () => {
    const externe = (contenu: string, sa?: AntigravitySubagents) =>
      extractAntigravityFacts(contenu, FICHIER, ESSAI, null, sa).externe;

    it('un sous-agent qui va sur le web (le navigateur de la fixture) rend la session externe', () => {
      expect(externe(SESSION, FIXTURE)).toBe(true);
    });

    it('des sous-agents qui ne font que lire le dépôt la laissent non externe, send_message et read_file compris', () => {
      expect(externe(LANCE, sousAgents({ [S]: [R] }, { [R]: RECHERCHE }))).toBe(false);
      expect(
        externe(SESSION, sousAgents({ [S]: [R, N] }, { [R]: RECHERCHE, [N]: RECHERCHE })),
      ).toBe(false);
    });

    it('sans le chargeur, ou avec moins de sous-agents nommés que d’appels : externe', () => {
      expect(externe(LANCE)).toBe(true);
      expect(externe(SESSION, sousAgents({ [S]: [R] }, { [R]: RECHERCHE }))).toBe(true);
    });

    it.each([
      ['dont la conversation ne se retrouve pas', undefined],
      ['dont une ligne est illisible', illisible(RECHERCHE)],
      ['dont une étape est hors forme', RECHERCHE.replace('\n', '\n{"step_index":1}\n')],
      ['qui n’a pas rendu la main', coupe(RECHERCHE)],
      [
        'dont la dernière étape appelle encore un outil',
        coupe(coupe(sousAgent(['read_file', { Path: `${ESSAI}/a.txt` }]))),
      ],
    ])('un sous-agent %s : externe', (_cas, contenu) => {
      const transcripts: Record<string, string> = contenu === undefined ? {} : { [R]: contenu };
      expect(externe(LANCE, sousAgents({ [S]: [R] }, transcripts))).toBe(true);
    });

    it('un sous-agent de sous-agent suit la même règle', () => {
      const relais = sousAgent(['invoke_subagent', { Prompt: 'Va plus loin.' }]);
      const avec = (petit: string) =>
        externe(LANCE, sousAgents({ [S]: [R], [R]: [G] }, { [R]: relais, [G]: petit }));

      expect(avec(sousAgent(['read_file', { Path: `${ESSAI}/a.txt` }]))).toBe(false);
      expect(avec(sousAgent(['search_web', { query: 'x' }]))).toBe(true);
      expect(externe(LANCE, sousAgents({ [S]: [R] }, { [R]: relais }))).toBe(true);
      // Un sous-agent qui se nomme lui-même, ou nomme la session : rien de plus à juger, et pas de boucle.
      expect(externe(LANCE, sousAgents({ [S]: [R], [R]: [R] }, { [R]: relais }))).toBe(false);
      expect(externe(LANCE, sousAgents({ [S]: [R], [R]: [S] }, { [R]: relais }))).toBe(false);
    });

    it('une conversation ordinaire nommée comme sous-agent (première étape USER_INPUT) : externe', () => {
      expect(externe(LANCE, sousAgents({ [S]: [R] }, { [R]: ORDINAIRE }))).toBe(true);
    });

    it('un sous-agent qui lance Leon ne la rend pas externe (D36) ; une commande réseau, si', () => {
      const avec = (CommandLine: string) =>
        externe(
          LANCE,
          sousAgents({ [S]: [R] }, { [R]: sousAgent(['run_command', { CommandLine }]) }),
        );

      expect(avec('~/.leon/bin/leon thread')).toBe(false);
      expect(avec('curl -s https://exemple.test')).toBe(true);
    });

    it('un appel hors de la forme { name, args } rend la session externe (échec fermé)', () => {
      expect(externe(etape(1, { type: 'PLANNER_RESPONSE', tool_calls: [{ args: {} }] }))).toBe(
        true,
      );
      expect(externe(etape(1, { type: 'PLANNER_RESPONSE', tool_calls: ['read_file'] }))).toBe(true);
    });
  });
});

describe('extractAntigravityBackstage', () => {
  const VIDE = sousAgents({});
  const extraire = (lignes: string[], sa: AntigravitySubagents = VIDE) =>
    extractAntigravityBackstage(lignes.join('\n'), FICHIER, ESSAI, sa);
  const appelSeul = (name: string, args: unknown) =>
    extraire([appels(1, [name, args]), resultat(2)]);
  const appel = (id: string, ts: string, outil: string, statut: string, cible?: string) => ({
    role: 'appel_outil',
    id,
    ts,
    outil,
    ...(cible === undefined ? {} : { cible }),
    statut,
  });

  it('relève la fixture dans l’ordre du temps : le raisonnement, les sous-agents et leurs appels', () => {
    const at = (secondes: string) => `2026-11-13T11:${secondes}Z`;

    expect(extractAntigravityBackstage(SESSION, FICHIER, ESSAI, FIXTURE)).toEqual([
      {
        role: 'raisonnement',
        id: '1',
        ts: at('45:02'),
        texte: "Deux tâches indépendantes : un sous-agent lit le fichier, l'autre ouvre la page.",
      },
      appel('1:0', at('45:02'), 'invoke_subagent', 'ok'),
      {
        role: 'sous_agent',
        id: '1:0:consigne',
        ts: at('45:02'),
        partie: 'consigne',
        texte: 'Lis a.txt et rends son contenu.',
      },
      appel('1:1', at('45:02'), 'invoke_subagent', 'ok'),
      {
        role: 'sous_agent',
        id: '1:1:consigne',
        ts: at('45:02'),
        partie: 'consigne',
        texte: "Ouvre la page d'exemple et dis ce qu'elle affiche.",
      },
      appel(`${R}:1:0`, at('45:06'), 'Read', 'ok', 'a.txt'),
      appel(`${N}:1:0`, at('45:06'), 'webview_browser', 'erreur'),
      appel(`${R}:3:0`, at('45:08'), 'send_message', 'ok'),
      {
        role: 'sous_agent',
        id: `${R}:rapport`,
        ts: at('45:08'),
        partie: 'rapport',
        texte: 'a.txt contient « bonjour ».',
      },
      appel(`${N}:3:0`, at('45:09'), 'send_message', 'ok'),
      {
        role: 'raisonnement',
        id: '7',
        ts: at('45:13'),
        texte: "Le lecteur a rendu le contenu, j'attends le navigateur.",
      },
      appel(`${N}:7:0`, at('45:22'), 'webview_browser', 'ok'),
      appel(`${N}:9:0`, at('45:28'), 'send_message', 'ok'),
      {
        role: 'sous_agent',
        id: `${N}:rapport`,
        ts: at('45:28'),
        partie: 'rapport',
        texte: 'La page affiche « Exemple ».',
      },
      { role: 'raisonnement', id: '9', ts: at('45:31'), texte: 'Les deux rapports sont arrivés.' },
      {
        role: 'raisonnement',
        id: '11',
        ts: at('46:02'),
        texte: "Un message au navigateur d'abord.",
      },
      appel('11:0', at('46:02'), 'send_message', 'ok'),
      { role: 'raisonnement', id: '13', ts: at('46:04'), texte: 'Deux commandes à la suite.' },
      appel('13:0', at('46:04'), 'Bash', 'ok', 'ls'),
      appel('13:1', at('46:04'), 'Bash', 'ok', 'git commit'),
      appel('16:0', at('46:07'), 'Bash', 'erreur', 'rm'),
    ]);
  });

  it('sans les conversations des sous-agents, la consigne part seule, sans leurs appels ni leur rapport', () => {
    const ids = extractAntigravityBackstage(
      SESSION,
      FICHIER,
      ESSAI,
      sousAgents({ [S]: [R, N] }),
    ).map(({ id }) => id);

    expect(ids).toEqual([
      '1',
      '1:0',
      '1:0:consigne',
      '1:1',
      '1:1:consigne',
      '7',
      '9',
      '11',
      '11:0',
      '13',
      '13:0',
      '13:1',
      '16:0',
    ]);
  });

  it.each([
    ['qui n’a pas fini', coupe(RECHERCHE)],
    ['qui porte une ligne illisible', illisible(RECHERCHE)],
    ['qui est une conversation ordinaire', ORDINAIRE],
  ])('un sous-agent %s : la consigne sans rapport, et aucun de ses appels', (_cas, contenu) => {
    const ids = (sa: AntigravitySubagents) => extraire([LANCE], sa).map(({ id }) => id);

    expect(ids(sousAgents({ [S]: [R] }, { [R]: RECHERCHE }))).toEqual([
      '1:0',
      '1:0:consigne',
      `${R}:1:0`,
      `${R}:3:0`,
      `${R}:rapport`,
    ]);
    expect(ids(sousAgents({ [S]: [R] }, { [R]: contenu }))).toEqual(['1:0', '1:0:consigne']);
  });

  it('le rapport est le Message du dernier send_message vers la conversation qui a lancé le sous-agent', () => {
    const petit = sousAgent(
      ['send_message', { Message: 'Premier.', Recipient: S }],
      ['send_message', { Message: 'Rapport.', Recipient: S }],
      ['send_message', { Message: 'À un autre.', Recipient: N }],
    );

    const blocs = extraire([LANCE], sousAgents({ [S]: [R] }, { [R]: petit }));

    expect(blocs.filter((bloc) => bloc.role === 'sous_agent')).toEqual([
      { role: 'sous_agent', id: '1:0:consigne', ts: TS, partie: 'consigne', texte: 'Cherche.' },
      { role: 'sous_agent', id: `${R}:rapport`, ts: TS, partie: 'rapport', texte: 'Rapport.' },
    ]);
  });

  describe('la préparation des textes', () => {
    const pense = (thinking: string) =>
      extraire([etape(1, { type: 'PLANNER_RESPONSE', thinking })]);

    it('masque un faux secret et retire un bloc de Leon', () => {
      expect(pense(`<contexte-leon>Le sommaire.</contexte-leon>Je garde ${FAUX_SECRET}.`)).toEqual([
        { role: 'raisonnement', id: '1', ts: TS, texte: `Je garde ${SECRET_MASK}.` },
      ]);
    });

    it('coupe à 20 000 caractères', () => {
      const [bloc] = pense('x'.repeat(30_000));

      expect(bloc?.role === 'raisonnement' && bloc.texte.length).toBe(TURN_TEXT_MAX);
    });

    it('prépare aussi la consigne et le rapport d’un sous-agent', () => {
      const petit = sousAgent([
        'send_message',
        { Message: `<rappel-leon>Rappel.</rappel-leon>Trouvé ${FAUX_SECRET}.`, Recipient: S },
      ]);
      const blocs = extraire(
        [
          appels(1, ['invoke_subagent', { Prompt: `Cherche ${FAUX_SECRET}.` }]),
          resultat(2),
          fin(3),
        ],
        sousAgents({ [S]: [R] }, { [R]: petit }),
      );

      expect(blocs.filter((bloc) => bloc.role === 'sous_agent')).toMatchObject([
        { id: '1:0:consigne', texte: `Cherche ${SECRET_MASK}.` },
        { id: `${R}:rapport`, texte: `Trouvé ${SECRET_MASK}.` },
      ]);
    });

    it.each([
      ['vide', ''],
      ['blanc', '  \n'],
      ['un bloc de Leon seul', '<contexte-leon>Le sommaire.</contexte-leon>'],
    ])('un raisonnement %s n’est pas relevé', (_cas, thinking) => {
      expect(pense(thinking)).toEqual([]);
    });

    it('le raisonnement d’un sous-agent ne part pas', () => {
      const blocs = extractAntigravityBackstage(SESSION, FICHIER, ESSAI, FIXTURE);

      expect(blocs.filter((bloc) => bloc.role === 'raisonnement').map(({ id }) => id)).toEqual([
        '1',
        '7',
        '9',
        '11',
        '13',
      ]);
    });
  });

  describe('les appels d’outils', () => {
    it.each([
      ['curl -u a:X https://exemple.test', 'curl'],
      ['PGPASSWORD=X psql -h base', 'psql'],
    ])('run_command « %s » donne Bash, réduit à %s', (CommandLine, cible) => {
      expect(appelSeul('run_command', { CommandLine })).toEqual([
        appel('1:0', TS, 'Bash', 'ok', cible),
      ]);
    });

    it.each([
      ['read_file', 'Read', { Path: `${ESSAI}/src/a.ts` }],
      ['view_file', 'Read', { AbsolutePath: `${ESSAI}/src/a.ts` }],
      ['write_to_file', 'Write', { TargetFile: `${ESSAI}/src/a.ts`, CodeContent: 'x' }],
      ['replace_file_content', 'Edit', { TargetFile: `${ESSAI}/src/a.ts` }],
    ])('%s donne %s, avec le chemin dans le dépôt', (name, outil, args) => {
      expect(appelSeul(name, args)).toEqual([appel('1:0', TS, outil, 'ok', 'src/a.ts')]);
    });

    it.each([
      [
        'un chemin hors du dépôt',
        'write_to_file',
        { TargetFile: '/Users/demo/ailleurs/x.ts' },
        'Write',
      ],
      ['un chemin en ~/…', 'read_file', { Path: '~/.aws/credentials' }, 'Read'],
      ['un chemin en $HOME/…', 'view_file', { AbsolutePath: '$HOME/.ssh/id' }, 'Read'],
      [
        'grep_search, jamais son motif',
        'grep_search',
        { Query: 'motif', SearchPath: ESSAI },
        'Grep',
      ],
      ['list_dir', 'list_dir', { DirectoryPath: `${ESSAI}/src` }, 'LS'],
      ['search_web, jamais sa requête', 'search_web', { query: 'requête' }, 'search_web'],
      [
        'read_url_content, jamais son URL',
        'read_url_content',
        { Url: 'https://x.test' },
        'read_url_content',
      ],
      ['schedule', 'schedule', { Prompt: 'Relance.' }, 'schedule'],
      ['un nom inconnu', 'outil_invente', { Path: `${ESSAI}/a.ts` }, '[outil]'],
      ['un outil MCP', 'mcp_leon_thread', { id: 'x' }, '[outil]'],
      ['un nom d’outil MCP de Claude Code', 'mcp__linear__get_issue', {}, '[outil]'],
    ])('%s : sans cible', (_cas, name, args, outil) => {
      expect(appelSeul(name, args)).toEqual([appel('1:0', TS, outil, 'ok')]);
    });

    it('les trois statuts : DONE ok, ERROR erreur (un refus), sans étape de résultat sans_resultat', () => {
      const blocs = extraire([
        appels(
          1,
          ['run_command', { CommandLine: 'pnpm test' }],
          ['run_command', { BypassSandbox: true, CommandLine: 'rm -rf build' }],
          ['read_file', { Path: `${ESSAI}/a.txt` }],
        ),
        resultat(2, 'DONE'),
        resultat(3, 'ERROR'),
        appels(4, ['run_command', { CommandLine: 'pnpm lint' }]),
      ]);

      expect(blocs.map((bloc) => bloc.role === 'appel_outil' && [bloc.id, bloc.statut])).toEqual([
        ['1:0', 'ok'],
        ['1:1', 'erreur'],
        ['1:2', 'sans_resultat'],
        ['4:0', 'sans_resultat'],
      ]);
    });

    it('un appel d’un sous-agent et d’un sous-agent de sous-agent est relevé dans la même forme', () => {
      const relais = sousAgent(
        ['write_to_file', { TargetFile: `${ESSAI}/a.ts` }],
        ['invoke_subagent', { Prompt: 'Va plus loin.' }],
      );
      const petit = sousAgent(['replace_file_content', { TargetFile: `${ESSAI}/b.ts` }]);

      expect(
        extraire([LANCE], sousAgents({ [S]: [R], [R]: [G] }, { [R]: relais, [G]: petit })),
      ).toEqual([
        appel('1:0', TS, 'invoke_subagent', 'ok'),
        { role: 'sous_agent', id: '1:0:consigne', ts: TS, partie: 'consigne', texte: 'Cherche.' },
        appel(`${R}:1:0`, TS, 'Write', 'ok', 'a.ts'),
        appel(`${R}:3:0`, TS, 'invoke_subagent', 'ok'),
        {
          role: 'sous_agent',
          id: `${R}:3:0:consigne`,
          ts: TS,
          partie: 'consigne',
          texte: 'Va plus loin.',
        },
        appel(`${G}:1:0`, TS, 'Edit', 'ok', 'b.ts'),
      ]);
    });

    it('un appel hors de la forme { name, args } ne part pas ; le suivant garde son rang', () => {
      const blocs = extraire([
        etape(1, {
          type: 'PLANNER_RESPONSE',
          tool_calls: [
            { args: { Path: 'x' } },
            { name: 'read_file', args: { Path: `${ESSAI}/a.txt` } },
          ],
        }),
        resultat(2, 'ERROR'),
        resultat(3),
      ]);

      expect(blocs).toEqual([appel('1:1', TS, 'Read', 'ok', 'a.txt')]);
    });

    it('lit aussi l’ancienne forme : les étapes RUN_COMMAND, VIEW_FILE… sont les résultats', () => {
      const at = (secondes: string) => `2026-11-06T10:00:${secondes}Z`;

      expect(extractAntigravityBackstage(content, FILE, RACINE, VIDE)).toEqual([
        { role: 'raisonnement', id: '2', ts: at('03'), texte: 'Planifier.' },
        appel('2:0', at('03'), 'Bash', 'ok', 'git checkout'),
        appel('4:0', at('06'), 'Read', 'ok', 'src/capture/codex.ts'),
        appel('4:1', at('06'), 'Write', 'ok', 'src/capture/antigravity.ts'),
        appel('7:0', at('10'), 'Bash', 'ok', 'pnpm vitest'),
        appel('9:0', at('22'), 'Bash', 'ok', 'git commit'),
      ]);
    });
  });

  it('une chaîne témoin dans la sortie d’un outil, l’argument d’un autre et un argument de invoke_subagent autre que Prompt n’apparaît nulle part', () => {
    const TEMOIN = 'temoin-4b7e2d';
    const petit = [
      etape(0, {
        source: 'SYSTEM',
        type: 'SYSTEM_MESSAGE',
        content: `<SYSTEM_MESSAGE>${TEMOIN}</SYSTEM_MESSAGE>`,
      }),
      appels(1, ['read_file', { Path: `${ESSAI}/a.txt`, toolSummary: TEMOIN }]),
      resultat(2, 'DONE', `contenu ${TEMOIN}`),
      appels(
        3,
        ['send_message', { Message: 'Trouvé.', Recipient: S }],
        ['send_message', { Message: TEMOIN, Recipient: N }],
      ),
      resultat(4),
      resultat(5),
      fin(6),
    ].join('\n');

    const blocs = extraire(
      [
        appels(
          1,
          [
            'invoke_subagent',
            { Prompt: 'Cherche.', Role: TEMOIN, TypeName: TEMOIN, Model: TEMOIN },
          ],
          ['grep_search', { Query: TEMOIN, SearchPath: `${ESSAI}/src`, toolSummary: TEMOIN }],
          ['run_command', { CommandLine: `echo ${TEMOIN}`, toolSummary: TEMOIN }],
          ['send_message', { Message: TEMOIN, Recipient: R }],
          ['webview_browser', { intention: TEMOIN, observation: TEMOIN, script: TEMOIN }],
          ['write_to_file', { TargetFile: `~/${TEMOIN}`, CodeContent: TEMOIN }],
          ['search_web', { query: TEMOIN }],
        ),
        resultat(2, 'DONE', `lancé ${TEMOIN}`),
        etape(3, { type: 'GENERIC', status: 'ERROR', error: TEMOIN, content: TEMOIN }),
        ...[4, 5, 6, 7, 8].map((index) => resultat(index, 'DONE', TEMOIN)),
        etape(9, { type: 'PLANNER_RESPONSE', content: TEMOIN }),
      ],
      sousAgents({ [S]: [R] }, { [R]: petit }),
    );

    expect(blocs).toHaveLength(12);
    expect(JSON.stringify(blocs)).not.toContain(TEMOIN);
  });

  it('tout identifiant tient dans la forme du contrat, et n’y figure qu’une fois', () => {
    const ids = extractAntigravityBackstage(SESSION, FICHIER, ESSAI, FIXTURE).map(({ id }) => id);

    expect(ids).toHaveLength(21);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_.:-]{1,200}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('une étape relue deux fois n’est relevée qu’une fois', () => {
    const lignes = [appels(1, ['read_file', { Path: `${ESSAI}/a.txt` }]), resultat(2)];

    expect(extraire([...lignes, ...lignes])).toEqual([appel('1:0', TS, 'Read', 'ok', 'a.txt')]);
  });

  it('un bloc hors du contrat (un sous-agent nommé hors forme) est écarté, les autres partent', () => {
    const ids = extraire([LANCE], sousAgents({ [S]: ['a b'] }, { 'a b': RECHERCHE })).map(
      ({ id }) => id,
    );

    expect(ids).toEqual(['1:0', '1:0:consigne']);
  });
});
