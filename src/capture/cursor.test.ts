import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractCursorFacts, parseCursorSession } from './cursor';
import { SessionFactsSchema } from './session-facts';

// Fixture inventée, sur la forme relevée publiquement des transcripts de Cursor 3.13 (jamais une vraie conversation).
// shortcut: à rejouer sur un transcript de l'essai T26.
const content = readFileSync(
  new URL('./fixtures/cursor/transcript-simple.jsonl', import.meta.url),
  'utf8',
);
const RACINE = '/Users/demo/projets/leon';
const CONVERSATION = 'c0ffee00-0000-4000-8000-000000000001';
const FILE = {
  path: `/Users/demo/.cursor/projects/Users-demo-projets-leon/agent-transcripts/${CONVERSATION}/${CONVERSATION}.jsonl`,
  mtime: new Date('2026-11-06T08:06:30.000Z'),
};

const line = (role: string, ...blocks: unknown[]) =>
  JSON.stringify({ role, message: { content: blocks } });
const text = (value: string) => ({ type: 'text', text: value });
const tool = (name: string, input: unknown) => ({ type: 'tool_use', name, input });
const query = (value: string) =>
  text(`<timestamp>Friday</timestamp>\n<user_query>\n${value}\n</user_query>`);

describe('parseCursorSession', () => {
  it('lit les tours de transcript-simple : la conversation, les messages tapés, l’heure du fichier', () => {
    const session = parseCursorSession(content, FILE);

    expect(session).toMatchObject({
      sessionId: CONVERSATION,
      cwd: null,
      title: 'Ajoute le lecteur des sessions Cursor.',
      branche: null,
    });
    // Les messages que Cursor écrit lui-même (retour d'un sous-agent, reprise après interruption) sont marqués par le
    // lecteur ; ils partent marqués, comme le dit l'accord (CURSOR_CONSENT_LINES).
    expect(session?.turns.map((t) => [t.external_id, t.role, t.text, t.injecte])).toEqual([
      [`${CONVERSATION}:000001`, 'user', 'Ajoute le lecteur des sessions Cursor.', false],
      [`${CONVERSATION}:000002`, 'assistant', 'Je regarde le format.', undefined],
      [`${CONVERSATION}:000005`, 'assistant', 'Le lecteur est écrit.', undefined],
      [
        `${CONVERSATION}:000006`,
        'user',
        'Perform any necessary follow-up actions in response to the subagent completion above.',
        true,
      ],
      [`${CONVERSATION}:000007`, 'user', 'Continue where you left off.', true],
      [`${CONVERSATION}:000008`, 'user', 'Merci, ouvre la PR.', false],
      [`${CONVERSATION}:000009`, 'assistant', 'PR ouverte.', undefined],
    ]);
    expect(new Set(session?.turns.map((t) => t.ts))).toEqual(new Set([FILE.mtime.toISOString()]));
  });

  it('un transcript qui n’enveloppe jamais : chaque message de la personne compte', () => {
    const session = parseCursorSession(line('user', text('Bonjour')), FILE);

    expect(session?.turns.map((t) => [t.text, t.injecte])).toEqual([['Bonjour', false]]);
  });

  it('le titre vient du premier message tapé, jamais d’un message injecté', () => {
    const session = parseCursorSession(
      [
        line('user', query('Briefly inform the user about the task result')),
        line('user', query('Relis le diff.')),
      ].join('\n'),
      FILE,
    );

    expect(session?.title).toBe('Relis le diff.');
  });

  it('retire les blocs de Leon, et écarte un message qui n’a rien d’autre', () => {
    const session = parseCursorSession(
      [
        line('user', query('<contexte-leon>\n- 05/11 · Codex\n</contexte-leon>')),
        line('user', query('Question <rappel-leon>bloc</rappel-leon>')),
      ].join('\n'),
      FILE,
    );

    expect(session?.turns.map((t) => t.text)).toEqual(['Question']);
  });

  it('le rang reste stable quand le transcript s’allonge', () => {
    const first = parseCursorSession(line('user', query('Un')), FILE);
    const longer = parseCursorSession(
      [line('user', query('Un')), line('assistant', text('Deux'))].join('\n'),
      FILE,
    );

    expect(longer?.turns[0]?.external_id).toBe(first?.turns[0]?.external_id);
    expect(longer?.turns[1]?.external_id).toBe(`${CONVERSATION}:000002`);
  });

  it('ignore les lignes illisibles', () => {
    expect(
      parseCursorSession(['{', '[]', line('user', query('Ok'))].join('\n'), FILE)?.turns,
    ).toHaveLength(1);
  });
});

describe('extractCursorFacts', () => {
  it('relève les gestes de transcript-simple', () => {
    const faits = extractCursorFacts(content, FILE, RACINE, 'demo/cursor');

    expect(faits).toEqual({
      branche: 'demo/cursor',
      prs: [],
      commits: [],
      fichiers: ['src/capture/cursor.ts', 'src/capture/turn.ts', 'README.md'],
      commandes: [
        { texte: 'git checkout', erreur: false },
        { texte: 'pnpm vitest', erreur: false },
      ],
      taches: [
        { texte: 'Ouvrir la PR', etat: 'a_faire' },
        { texte: 'Lire le format', etat: 'fait' },
        { texte: 'Écrire le lecteur', etat: 'fait' },
      ],
      erreurs: 1,
      externe: false,
      echanges: 2,
      debut: null,
      fin: FILE.mtime.toISOString(),
    });
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  describe('externe', () => {
    const externe = (...blocks: unknown[]) =>
      extractCursorFacts(line('assistant', ...blocks), FILE, RACINE).externe;

    it('la recherche web, une page web, un sous-agent, un outil MCP ou inconnu, une commande réseau : oui', () => {
      expect(externe(tool('WebSearch', { search_term: 'x' }))).toBe(true);
      expect(externe(tool('WebFetch', { url: 'https://example.com' }))).toBe(true);
      expect(externe(tool('Task', { prompt: 'x' }))).toBe(true);
      expect(externe(tool('mcp_leon_fil', {}))).toBe(true);
      expect(externe(tool('OutilInconnu', {}))).toBe(true);
      expect(externe(tool('Shell', { command: 'cd x && curl -s https://example.com' }))).toBe(true);
    });

    it('lire, écrire, chercher dans le dépôt, les commandes locales, `leon` : non', () => {
      expect(
        externe(
          tool('Read', { path: `${RACINE}/a.ts` }),
          tool('Grep', { pattern: 'x' }),
          tool('Glob', { glob_pattern: '*.ts' }),
          tool('Write', { path: `${RACINE}/a.ts` }),
          tool('Shell', { command: 'pnpm test' }),
          tool('Shell', { command: '~/.leon/bin/leon fil' }),
          tool('run_terminal_cmd', { command: 'git status' }),
          tool('edit_file', { target_file: 'b.ts' }),
        ),
      ).toBe(false);
    });
  });

  it('un fichier hors du dépôt ne compte pas ; les anciens noms d’outils se lisent', () => {
    const faits = extractCursorFacts(
      line(
        'assistant',
        tool('Write', { path: '/tmp/ailleurs.txt' }),
        tool('edit_file', { target_file: `${RACINE}/b.ts` }),
        tool('todo_write', { todos: [{ id: 'a', content: 'Tâche', status: 'pending' }] }),
      ),
      FILE,
      RACINE,
    );

    expect(faits.fichiers).toEqual(['b.ts']);
    expect(faits.taches).toEqual([{ texte: 'Tâche', etat: 'a_faire' }]);
  });

  it('masque un secret dans une commande et ne garde que l’exécutable', () => {
    const faits = extractCursorFacts(
      line('assistant', tool('Shell', { command: 'PGPASSWORD=s3cret psql -h db' })),
      FILE,
      RACINE,
    );
    expect(faits.commandes).toEqual([{ texte: 'psql', erreur: false }]);
  });
});
