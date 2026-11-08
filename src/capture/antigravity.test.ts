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
      injectes: 0,
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

  it('ne lit pas la conversation d’un sous-agent ; compte à part un message que l’outil écrit', () => {
    const sub = step({
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      content: '<subagent_reminder>\ncaller agent id: p\n</subagent_reminder>\ntâche',
    });
    expect(parseAntigravitySession(sub, FILE)).toBeNull();

    const injected = parseAntigravitySession(
      step({ type: 'USER_INPUT', source: 'SYSTEM', content: 'Relance automatique' }),
      FILE,
    );
    expect(injected).toMatchObject({ turns: [], injectes: 1 });
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

    it('lire, écrire, les commandes locales, `leon` : non', () => {
      expect(
        externe(
          call('view_file', { AbsolutePath: `${RACINE}/a.ts` }),
          call('grep_search', { Query: 'x' }),
          call('write_to_file', { TargetFile: `${RACINE}/a.ts` }),
          call('run_command', { CommandLine: 'pnpm test' }),
          call('run_command', { CommandLine: '~/.leon/bin/leon fil' }),
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
