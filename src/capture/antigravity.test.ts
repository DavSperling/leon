import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conversationOf, extractAntigravityFacts, parseAntigravitySession } from './antigravity';
import { SessionFactsSchema } from './session-facts';

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
