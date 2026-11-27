import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { READ_FIRST_MARK } from './api-contract';
import {
  type AgentActions,
  buildAgentCommands,
  extractAgentActions,
  extractClaudeCodeFacts,
  isChainedCommand,
  isExternalWorkflowAgent,
  recheckCommand,
  reduceToolName,
  SessionFactsSchema,
} from './session-facts';

// session-gestes vit à part : les tests de la CLI copient tout fixtures/claude-code/ comme dossier de sessions.
const fixture = (path: string) =>
  readFileSync(new URL(`./fixtures/${path}.jsonl`, import.meta.url), 'utf8');

const RACINE = '/Users/demo/projets/leon';

const appel = (id: string, name: string, input: unknown, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
    ...extra,
  });
const resultat = (id: string, content: string, extra = {}) =>
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
    ...extra,
  });

describe('extractClaudeCodeFacts', () => {
  it('relève les gestes de session-gestes', () => {
    const faits = extractClaudeCodeFacts(fixture('claude-code-faits/session-gestes'), RACINE);

    expect(faits).toEqual({
      branche: 'demo/faits',
      prs: [
        { repo: 'demo/leon', numero: 112, par: 'gh-pr-create' },
        { repo: 'demo/site', numero: 5, par: 'gh-pr-create' },
      ],
      commits: ['1a2b3c4'],
      fichiers: [
        'src/capture/session-facts.ts',
        'src/capture/turn.ts',
        'README.md',
        'docs/essai.ipynb',
      ],
      commandes: [
        { texte: 'git checkout', erreur: false, suite: false },
        { texte: 'mysql', erreur: true, suite: false },
        { texte: 'sshpass', erreur: false, suite: false },
        { texte: 'curl', erreur: false, suite: false },
        { texte: 'redis-cli', erreur: false, suite: false },
        { texte: 'psql', erreur: false, suite: false },
        { texte: 'pnpm vitest', erreur: false, suite: false },
        { texte: 'npx', erreur: false, suite: false },
        { texte: 'git add', erreur: false, suite: true },
        { texte: 'git push', erreur: false, suite: false },
        { texte: 'gh pr', erreur: false, suite: false },
        { texte: 'gh pr', erreur: false, suite: false },
      ],
      taches: [
        { texte: 'Brancher la route', etat: 'en_cours' },
        { texte: 'Écrire le schéma des faits', etat: 'fait' },
      ],
      erreurs: 2,
      outils_en_erreur: [{ outil: 'Edit', nombre: 1 }],
      externe: true,
      echanges: 3,
      debut: '2026-11-02T14:00:00.000Z',
      fin: '2026-11-02T14:06:03.000Z',
    });
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('ne laisse aucun mot de passe passé en argument, ni en préfixe NOM=valeur', () => {
    const faits = JSON.stringify(
      extractClaudeCodeFacts(fixture('claude-code-faits/session-gestes'), RACINE),
    );

    expect(faits).not.toContain('S3cret');
  });

  it('recheckCommand, la barrière de la réception, rend telle quelle toute commande réduite', () => {
    const { commandes } = extractClaudeCodeFacts(
      fixture('claude-code-faits/session-gestes'),
      RACINE,
    );

    expect(commandes.length).toBeGreaterThan(5);
    for (const { texte } of commandes) expect(recheckCommand(texte)).toBe(texte);
    expect(recheckCommand('mysql -pS3cret')).toBe('[commande]');
    // Un second mot n'est gardé que pour un exécutable de la liste fermée, comme dans reduceCommand.
    expect(recheckCommand('mysql motdepasse')).toBe('[commande]');
    expect(recheckCommand('pnpm test')).toBe('pnpm test');
  });

  it.each([
    ['PGPASSWORD=my\\ S3cret psql -h db', 'psql'],
    ['MYSQL_PWD="a\\" S3cret" mysql', 'mysql'],
    ['API_TOKEN=abc\\ S3cret curl x', 'curl'],
    ["PGPASSWORD=$'it\\'s S3cret' psql -h db", 'psql'],
    ["$'mysql -pS3cret' db", '[commande]'],
    ['"mysql -pS3cret" db', '[commande]'],
    ['"PGPASSWORD=S3cret" psql -h db', '[commande]'],
    ['(PGPASSWORD=S3cret psql -h db)', '[commande]'],
    ['$(PGPASSWORD=S3cret psql -h db)', '[commande]'],
    ['PGPASSWORD="my S3cret psql -h db', '[commande]'],
    ["PGPASSWORD='my S3cret psql -h db", '[commande]'],
    ['PGPASSWORD=$(echo S3cret) psql -h db', '[commande]'],
    ['PGPASSWORD=`echo S3cret` psql -h db', '[commande]'],
    ['PGPASSWORD=x \\\n  S3cret -h db', '[commande]'],
  ])(
    'ne garde aucun mot de passe de l’exécutable ni de ses préfixes NOM=valeur : %s',
    (command, texte) => {
      const contenu = [appel('b1', 'Bash', { command }), resultat('b1', '')].join('\n');
      const faits = extractClaudeCodeFacts(contenu, RACINE);

      expect(faits.commandes).toMatchObject([{ texte, erreur: false }]);
      expect(JSON.stringify(faits)).not.toContain('S3cret');
    },
  );

  // L'exécutable entre guillemets ou après un antislash n'a pas la forme d'un exécutable : seul le texte fixe part.
  it.each([
    ['"curl" -u a:S3cret https://x.example', '[commande]'],
    ['\\curl -u a:S3cret https://x.example', '[commande]'],
    ['/usr/bin/curl -u a:S3cret https://x.example', 'curl'],
  ])('réduit un exécutable écrit autrement sans ses arguments : %s', (command, texte) => {
    const contenu = [appel('b1', 'Bash', { command }), resultat('b1', '')].join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.commandes).toEqual([{ texte, erreur: false, suite: false }]);
    expect(JSON.stringify(faits)).not.toContain('S3cret');
  });

  it.each([
    'git -C sub commit -m x',
    'git -C "/Users/demo/Mobile Documents/leon" commit -m x',
    'git -c user.name=demo commit -m x',
  ])('relève le SHA d’un commit fait par %s', (command) => {
    const contenu = [appel('c1', 'Bash', { command }), resultat('c1', '[main abcdef1] x')];

    expect(extractClaudeCodeFacts(contenu.join('\n'), RACINE).commits).toEqual(['abcdef1']);
  });

  it('ne compte pas la PR qu’un gh pr create en erreur dit exister déjà', () => {
    const contenu = [
      appel('p1', 'Bash', { command: 'gh pr create --fill' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'p1',
              content:
                'a pull request for branch "x" into branch "main" already exists:\nhttps://github.com/o/r/pull/12',
              is_error: true,
            },
          ],
        },
      }),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).prs).toEqual([]);
  });

  // Claude Code 2.1.322 recopie des messages déjà écrits dans des lignes api-request-blob (annexe 08) : l'appel dans un
  // message `assistant`, son résultat dans un message `user`. Ces copies ne sont pas des gestes de plus.
  describe('les copies d’appels des lignes api-request-blob', () => {
    const copie = (role: 'assistant' | 'user', content: unknown[]) =>
      JSON.stringify({
        type: 'api-request-blob',
        sessionId: 's1',
        hash: 'f'.repeat(64),
        message: { role, content },
      });
    const sessionAvecCopies = (commande: string, sortie: string, erreur: boolean) => {
      const bloc = { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: commande } };
      const retour = { type: 'tool_result', tool_use_id: 'b1', content: sortie, is_error: erreur };
      return [
        appel('b1', 'Bash', { command: commande }),
        JSON.stringify({ type: 'user', message: { content: [retour] } }),
        copie('assistant', [{ type: 'thinking', thinking: '' }, bloc]),
        copie('user', [retour]),
      ].join('\n');
    };

    it('une commande en erreur n’est rangée qu’une fois, et l’erreur comptée une fois', () => {
      const faits = extractClaudeCodeFacts(sessionAvecCopies('pnpm test', 'boom', true), RACINE);

      expect(faits.commandes).toEqual([{ texte: 'pnpm test', erreur: true, suite: false }]);
      expect(faits.erreurs).toBe(1);
    });

    it('un gh pr create réussi n’est rangé qu’une fois, avec une seule PR', () => {
      const url = 'https://github.com/o/r/pull/12';
      const faits = extractClaudeCodeFacts(
        sessionAvecCopies('gh pr create --fill', url, false),
        RACINE,
      );

      expect(faits.commandes).toEqual([{ texte: 'gh pr', erreur: false, suite: false }]);
      expect(faits.prs).toEqual([{ repo: 'o/r', numero: 12, par: 'gh-pr-create' }]);
    });
  });

  // Postgres refuse les deux dans un jsonb : un seul ferait échouer l'écriture des faits (T02).
  it('ne coupe pas un emoji en deux et retire le caractère nul, sans recoller un secret', () => {
    const contenu = [
      appel('t1', 'TodoWrite', {
        todos: [
          { content: `${'a'.repeat(199)}😀b`, status: 'pending' },
          { content: `Clé sk-ant-${'a'.repeat(10)}\u0000${'b'.repeat(15)}`, status: 'pending' },
        ],
      }),
      resultat('t1', 'ok'),
      appel('b1', 'Bash', { command: `${'x'.repeat(199)}😀 -v` }),
      resultat('b1', ''),
    ].join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.taches.map((tache) => tache.texte)).toEqual([
      `${'a'.repeat(199)}�`,
      'Clé [secret masqué]',
    ]);
    // Un exécutable hors de [A-Za-z0-9._+-]{1,40} ne garde que le texte fixe.
    expect(faits.commandes).toEqual([{ texte: '[commande]', erreur: false, suite: false }]);
    expect(JSON.stringify(faits)).not.toMatch(/\\u(?:d[89a-f]|0000)/i);
  });

  it('masque un faux jeton placé en sous-commande d’un outil listé', () => {
    const contenu = [appel('t1', 'Bash', { command: 'npx sk-ant-faux0000000000000000000' })];
    const faits = extractClaudeCodeFacts(
      [...contenu, resultat('t1', 'npm error')].join('\n'),
      RACINE,
    );

    expect(faits.commandes).toEqual([{ texte: 'npx', erreur: false, suite: false }]);
    expect(JSON.stringify(faits)).not.toContain('sk-ant-faux');
  });

  it('retire un chemin hors du dépôt, même voisin par son nom', () => {
    const contenu = [
      appel('w1', 'Write', { file_path: '/Users/demo/.zshrc' }),
      resultat('w1', 'ok'),
      appel('w2', 'Edit', { file_path: '/Users/demo/projets/leon-autre/x.ts' }),
      resultat('w2', 'ok'),
      appel('w3', 'Edit', { file_path: `${RACINE}/src/a.ts` }),
      resultat('w3', 'ok'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).fichiers).toEqual(['src/a.ts']);
  });

  // Le flux de l'équipe (CLAUDE.md) : la session s'ouvre dans le clone, le travail se fait dans un worktree.
  it('rend relatif au worktree un fichier écrit dans .claude/worktrees/<nom>/ du clone', () => {
    const contenu = [
      appel('w1', 'Write', { file_path: `${RACINE}/.claude/worktrees/sujet/src/a.ts` }),
      resultat('w1', 'ok'),
      appel('w2', 'Write', { file_path: `${RACINE}/README.md` }),
      resultat('w2', 'ok'),
      appel('w3', 'Edit', { file_path: `${RACINE}-wt/src/b.ts` }),
      resultat('w3', 'ok'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).fichiers).toEqual(['src/a.ts', 'README.md']);
  });

  it('sans racine de dépôt (session ouverte hors de tout dépôt), aucun fichier', () => {
    const contenu = [
      appel('w1', 'Write', { file_path: '/Users/demo/Documents/perso/notes.md' }),
      resultat('w1', 'ok'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, null).fichiers).toEqual([]);
  });

  // L'ancienne forme : le sous-agent dans le fichier de la session, sans fichier à part. Ses échanges ne se retrouvent
  // pas : l'appel reste externe (T63, échec fermé).
  it('ignore un sous-agent de l’ancienne forme (isSidechain), dont l’appel Agent sans échanges marque la session externe', () => {
    const sousAgent = { isSidechain: true };
    const contenu = [
      appel('a1', 'Agent', { description: 'Chercher', prompt: 'Cherche Delta.' }),
      appel('s1', 'Write', { file_path: `${RACINE}/src/sous-agent.ts` }, sousAgent),
      resultat('s1', 'ok', sousAgent),
      appel('s2', 'Bash', { command: 'git commit -m x' }, sousAgent),
      resultat('s2', '[main 9f9f9f9] x', { ...sousAgent, gitBranch: 'autre' }),
      resultat('a1', 'Rapport du sous-agent.'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE)).toMatchObject({
      branche: null,
      fichiers: [],
      commandes: [],
      commits: [],
      externe: true,
    });
  });

  it.each([
    ['WebFetch', {}],
    ['WebSearch', {}],
    ['mcp__github__get_issue', {}],
    ['Agent', {}],
    ['Task', {}],
    ['Bash', { command: 'wget https://x.example' }],
    ['Bash', { command: 'gh api repos/demo/leon' }],
    ['Bash', { command: 'gh pr view 12' }],
    ['Bash', { command: 'gh issue view 4' }],
    ['Bash', { command: 'gh run view 9' }],
    ['Bash', { command: 'git clone https://github.com/demo/x' }],
    ['Bash', { command: 'cd /tmp && curl -s https://x.example' }],
    ['ReadMcpResourceTool', {}],
    ['ListMcpResourcesTool', {}],
    ['OutilInconnu', {}],
    ['Bash', { command: 'gh pr list' }],
    ['Bash', { command: 'gh pr diff 12' }],
    ['Bash', { command: 'gh -R o/r pr view 12' }],
    ['Bash', { command: 'gh --repo o/r issue view 4' }],
    ['Bash', { command: 'git -C /x clone https://github.com/o/r' }],
    ['Bash', { command: 'ssh host cat notes.txt' }],
    ['Bash', { command: 'npm view leftpad readme' }],
    ['Bash', { command: 'pnpm test; http GET https://x.example' }],
    ['Bash', { command: 'echo "$(TOKEN=x wget -qO- https://x.example)"' }],
    // L'exécutable écrit autrement : le shell lance le même programme.
    ['Bash', { command: '"curl" -s https://x.example' }],
    ['Bash', { command: "'wget' https://x.example" }],
    ['Bash', { command: '\\curl -s https://x.example' }],
    ['Bash', { command: '/usr/bin/curl -s https://x.example' }],
    ['Bash', { command: 'cd /tmp && /opt/homebrew/bin/ssh host' }],
    ['Bash', { command: '"/usr/bin/curl" https://x.example' }],
    ['Bash', { command: 'TOKEN=x \\wget https://x.example' }],
    ['Bash', { command: '"gh" pr view 12' }],
    ['Bash', { command: '/usr/local/bin/gh api repos/demo/leon' }],
    ['Bash', { command: '"git" clone https://github.com/o/r' }],
    ['Bash', { command: '"npm" view leftpad' }],
    // Les autres outils de l'app de bureau restent externes : seuls trois noms exacts sont locaux (D36, 23/11).
    ['mcp__ccd_session_mgmt__search_session_transcripts', {}],
    ['mcp__ccd_session__read_widget_context', {}],
    ['mcp__ccd_session_mgmt__send_message', {}],
    ['mcp__ccd_pr__get_status', {}],
    ['mcp__ccd_turn__update_plan_x', {}],
  ])('marque la session externe sur %s %j', (name, input) => {
    expect(extractClaudeCodeFacts(appel('e1', name, input), RACINE).externe).toBe(true);
  });

  it.each([
    ['Bash', { command: 'gh pr create --fill' }],
    ['Bash', { command: 'gh pr create --body "voir https://x"' }],
    ['Bash', { command: 'gh -R demo/site pr create --fill' }],
    ['Bash', { command: 'gh auth status' }],
    ['Bash', { command: 'git push' }],
    ['Bash', { command: 'git fetch origin' }],
    ['Bash', { command: 'git commit -m "fix http"' }],
    ['Bash', { command: 'cat src/ssh-keys.ts' }],
    ['Bash', { command: '/usr/bin/git fetch origin' }],
    ['Bash', { command: '"gh" pr create --fill' }],
    ['Bash', { command: '/opt/homebrew/bin/gh pr create --fill' }],
    ['Bash', { command: './node_modules/.bin/vitest run src/ssh' }],
    ['Bash', { command: 'ls /usr/bin/curl' }],
    ['Bash', { command: 'echo "curl is cool"' }],
    ['Bash', { command: 'git commit -m "curl"' }],
    ['Bash', { command: '"curl is cool"' }],
    ['Bash', { command: 'cat ./curl.md' }],
    ['TaskCreate', { subject: 'x' }],
    ['Read', { file_path: `${RACINE}/a.ts` }],
    ['mcp__ccd_turn__update_plan', { items: [{ content: 'x', status: 'pending' }] }],
    ['mcp__ccd_turn__wrap_up', { recap: 'x' }],
    ['mcp__ccd_session__mark_chapter', { title: 'x' }],
  ])('ne marque pas externe %s %j', (name, input) => {
    expect(extractClaudeCodeFacts(appel('e1', name, input), RACINE).externe).toBe(false);
  });

  // Lire Leon ne rend plus la session externe (D36, A14) : aucune commande `leon` n'est une commande réseau, et les
  // outils locaux du serveur MCP de Leon ne comptent que s'il est reconnu (son URL, lue par la CLI : leon-mcp.ts).
  describe('lire Leon (T44)', () => {
    const LEON = true;

    it.each([
      'leon threads',
      'leon thread',
      'leon thread 0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b',
      'leon search "route des faits"',
      '~/.leon/bin/leon search route',
      'pnpm leon versions 0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b --read 2',
      'leon lessons',
      'leon lessons 0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b',
      // T57 : `leon note`, à la place de `leon noter`, telle que la phrase du bloc la donne.
      'leon note "reprendre la route"',
      '~/.leon/bin/leon note --tool claude_code --session 0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b "reprendre la route"',
      'pnpm --dir ~/code/leon leon note --tool claude_code --note 0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b --version 2 "suite"',
      '~/.leon/bin/leon note --tool claude_code --session s-1 -- "- reprendre la route"',
    ])('la commande « %s » ne rend pas la session externe', (command) => {
      expect(extractClaudeCodeFacts(appel('l1', 'Bash', { command }), RACINE).externe).toBe(false);
    });

    it.each(['threads', 'thread', 'versions', 'lessons', 'remember'])(
      'l’outil %s du serveur de Leon reconnu ne rend pas la session externe',
      (tool) => {
        const contenu = appel('l1', `mcp__leon__${tool}`, {});
        expect(extractClaudeCodeFacts(contenu, RACINE, LEON).externe).toBe(false);
      },
    );

    it.each([
      // search, fetch et briefing rendent du texte d'ailleurs.
      ['mcp__leon__search', LEON],
      ['mcp__leon__fetch', LEON],
      ['mcp__leon__briefing', LEON],
      // le nom complet exact, jamais un suffixe ni un autre serveur
      ['mcp__autre__thread', LEON],
      ['mcp__leon_bis__thread', LEON],
      ['mcp__claude_ai_Leon__thread', LEON],
      ['mcp__plugin_leon_leon__thread', LEON],
      ['mcp__leon__thread_x', LEON],
      // le même nom, mais le serveur pas reconnu (une autre URL, une configuration illisible) : échec fermé
      ['mcp__leon__thread', false],
      ['Agent', LEON],
      ['Task', LEON],
    ])('%s (serveur reconnu : %s) rend la session externe', (name, leon) => {
      expect(extractClaudeCodeFacts(appel('l1', name, {}), RACINE, leon).externe).toBe(true);
    });

    it.each([
      'leon search "x; curl https://x.example"',
      'leon search "$(curl -s https://x.example)"',
    ])('une commande réseau glissée dans « %s » compte (échec fermé)', (command) => {
      expect(extractClaudeCodeFacts(appel('l1', 'Bash', { command }), RACINE).externe).toBe(true);
    });
  });

  // T63 : un appel Agent ou Task se juge sur les échanges de son sous-agent (annexe 08), lus par la CLI (subagents.ts).
  describe('le sous-agent qui ne lit que le dépôt (T63)', () => {
    const SA = { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' };
    const consigne = JSON.stringify({ type: 'user', ...SA, message: { content: 'Consigne.' } });
    const rapport = JSON.stringify({
      type: 'assistant',
      ...SA,
      message: { content: [{ type: 'text', text: 'Rapport.' }], stop_reason: 'end_turn' },
    });
    // Un fichier de sous-agent : la consigne, ses lignes, puis son rapport final.
    const sousAgent = (...lignes: string[]) => [consigne, ...lignes, rapport].join('\n');
    const geste = (id: string, name: string, input: unknown) => [
      appel(id, name, input, SA),
      resultat(id, 'ok', SA),
    ];
    const session = appel('a1', 'Agent', { prompt: 'Cherche.' });
    const externe = (subagents?: Map<string, string>, leonMcp = false, contenu = session) =>
      extractClaudeCodeFacts(contenu, RACINE, leonMcp, subagents).externe;

    it('un sous-agent qui ne fait que Read, Grep et pnpm test (fixture, avec un sous-agent de sous-agent) : non externe', () => {
      const dossier = 'claude-code-sous-agents/55555555-5555-4555-8555-555555555555';
      const subagents = new Map([
        ['toolu_01Depot', fixture(`${dossier}/subagents/agent-a1b2c3d4e5f6a7b8c`)],
        ['toolu_01Petit', fixture(`${dossier}/subagents/agent-b9c8d7e6f5a4b3c2d`)],
      ]);

      expect(extractClaudeCodeFacts(fixture(dossier), RACINE).externe).toBe(true);
      expect(extractClaudeCodeFacts(fixture(dossier), RACINE, false, subagents).externe).toBe(
        false,
      );
    });

    it.each([
      ['WebFetch', { url: 'https://x.example' }],
      ['Bash', { command: 'curl -s https://x.example' }],
      ['mcp__github__get_issue', {}],
      ['Workflow', {}],
    ])('un sous-agent qui appelle %s %j : externe', (name, input) => {
      expect(externe(new Map([['a1', sousAgent(...geste('s1', name, input))]]))).toBe(true);
    });

    // Les accusés courts ne rendent pas externe, ni dans la session ni dans un sous-agent (décision d'Amos du 23/11).
    const accuses: [string, unknown][] = [
      ['SubagentHandback', { message: 'Fini.' }],
      ['SendUserFile', { files: ['a.md'], status: 'normal' }],
    ];
    it.each(accuses)('un sous-agent qui appelle %s %j : non externe', (name, input) => {
      expect(externe(new Map([['a1', sousAgent(...geste('s1', name, input))]]))).toBe(false);
    });
    it.each(accuses)('la session qui appelle %s %j : non externe', (name, input) => {
      expect(extractClaudeCodeFacts(appel('e1', name, input), RACINE).externe).toBe(false);
    });
    // SendMessage reste externe : la réponse d'une autre session n'est jugée par rien (décision d'Amos du 23/11).
    it.each([
      ['SendMessage', { to: 'autre-session', message: 'x' }],
      ['SubagentHandbacks', {}],
    ])('la session qui appelle %s %j : externe', (name, input) => {
      expect(extractClaudeCodeFacts(appel('e1', name, input), RACINE).externe).toBe(true);
    });
    it('un sous-agent qui appelle SendMessage : externe', () => {
      const lignes = geste('s1', 'SendMessage', { to: 'autre-session', message: 'x' });
      expect(externe(new Map([['a1', sousAgent(...lignes)]]))).toBe(true);
    });

    it.each([
      ['sans table', undefined],
      ['l’appel absent de la table', new Map([['autre', sousAgent()]])],
      ['un fichier vide', new Map([['a1', '']])],
    ])('des échanges absents (%s) : externe', (_cas, subagents) => {
      expect(externe(subagents)).toBe(true);
    });

    it.each([
      [
        'dernier message en tool_use',
        [
          consigne,
          JSON.stringify({
            type: 'assistant',
            ...SA,
            message: {
              content: [{ type: 'tool_use', id: 's1', name: 'Read', input: {} }],
              stop_reason: 'tool_use',
            },
          }),
        ],
      ],
      ['dernière ligne user', [consigne, ...geste('s1', 'Read', {})]],
      ['rapport suivi d’un tour user', [rapport, consigne]],
    ])('un fichier qui s’arrête avant son rapport (%s) : externe', (_cas, lignes) => {
      expect(externe(new Map([['a1', lignes.join('\n')]]))).toBe(true);
    });

    it.each([
      ['du JSON illisible', 'ceci n’est pas du JSON'],
      ['une ligne hors forme', JSON.stringify({ type: 42 })],
      [
        'une ligne assistant hors forme',
        JSON.stringify({ type: 'assistant', ...SA, message: 'x' }),
      ],
    ])('une ligne illisible dans le fichier (%s) : externe', (_cas, ligne) => {
      expect(externe(new Map([['a1', sousAgent(ligne)]]))).toBe(true);
    });

    it('lit les lignes non conversationnelles et les lignes vides sans échouer', () => {
      const bruit = JSON.stringify({ type: 'api-request-blob', message: { content: [] } });
      expect(externe(new Map([['a1', sousAgent(bruit, '', '  ')]]))).toBe(false);
    });

    // Une ligne d'un autre type n'est pas de la conversation : sa forme ne compte pas, comme dans le fichier de la session.
    it.each([
      ['un timestamp en nombre', { type: 'api-request', timestamp: 1731405600000 }],
      ['un message en chaîne', { type: 'api-request-shape', message: 'x' }],
    ])('saute une ligne non conversationnelle hors du schéma (%s) : non externe', (_cas, ligne) => {
      expect(externe(new Map([['a1', sousAgent(JSON.stringify(ligne))]]))).toBe(false);
    });

    it('un rapport suivi de lignes non conversationnelles : non externe', () => {
      const cout = JSON.stringify({ type: 'cost-state' });
      expect(externe(new Map([['a1', [consigne, rapport, cout].join('\n')]]))).toBe(false);
    });

    it('un appel Task relié à un sous-agent qui ne fait que Read : non externe', () => {
      const subagents = new Map([['a1', sousAgent(...geste('s1', 'Read', {}))]]);
      expect(externe(subagents, false, appel('a1', 'Task', { prompt: 'Cherche.' }))).toBe(false);
    });

    it('un cycle (le sous-agent de a1 relance a1) : le calcul se termine', () => {
      const subagents = new Map([['a1', sousAgent(...geste('a1', 'Agent', {}))]]);
      expect(externe(subagents)).toBe(false);
    });

    it.each([
      ['WebSearch', true],
      ['Read', false],
    ])('un sous-agent lancé par un sous-agent, qui appelle %s : externe %s', (name, attendu) => {
      const subagents = new Map([
        ['a1', sousAgent(...geste('a2', 'Agent', { prompt: 'Relis.' }))],
        ['a2', sousAgent(...geste('t1', name, {}))],
      ]);
      expect(externe(subagents)).toBe(attendu);
    });

    it('un sous-agent qui lance leon thread : non externe (D36)', () => {
      const lignes = geste('s1', 'Bash', { command: '~/.leon/bin/leon thread' });
      expect(externe(new Map([['a1', sousAgent(...lignes)]]))).toBe(false);
    });

    it('un mcp__leon__thread dans un sous-agent : non externe si le serveur est reconnu, externe sinon', () => {
      const subagents = new Map([['a1', sousAgent(...geste('s1', 'mcp__leon__thread', {}))]]);
      expect(externe(subagents, true)).toBe(false);
      expect(externe(subagents, false)).toBe(true);
    });

    it('le même bloc tool_use écrit sur deux lignes est compté une fois', () => {
      const deuxFois = [session, session].join('\n');
      const subagents = new Map([
        ['a1', sousAgent(appel('a2', 'Agent', {}, SA), ...geste('a2', 'Agent', {}))],
        ['a2', sousAgent()],
      ]);
      expect(externe(subagents, false, deuxFois)).toBe(false);
    });

    it('un sous-agent en tâche de fond, fini : non externe', () => {
      const contenu = [
        appel('a1', 'Agent', { prompt: 'Cherche.', run_in_background: true }),
        resultat('a1', 'Async agent launched.', {
          toolUseResult: { status: 'async_launched', isAsync: true, agentId: 'a1b2c3d4e5f6a7b8c' },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: '<task-notification>\n<status>completed</status>\n</task-notification>',
          },
        }),
      ].join('\n');
      const subagents = new Map([['a1', sousAgent(...geste('s1', 'Grep', { pattern: 'x' }))]]);
      expect(externe(subagents, false, contenu)).toBe(false);
    });

    it('les gestes d’un sous-agent (un fichier écrit, une commande, un commit) n’entrent pas dans les faits', () => {
      const lignes = [
        ...geste('s1', 'Write', { file_path: `${RACINE}/src/sous-agent.ts` }),
        appel('s2', 'Bash', { command: 'git commit -m x' }, SA),
        resultat('s2', '[main 9f9f9f9] x', SA),
        appel('s3', 'TodoWrite', { todos: [{ content: 'x', status: 'pending' }] }, SA),
        resultat('s3', 'ok', SA),
      ];
      const faits = extractClaudeCodeFacts(
        [session, resultat('a1', 'Rapport.')].join('\n'),
        RACINE,
        false,
        new Map([['a1', sousAgent(...lignes)]]),
      );

      expect(faits).toMatchObject({
        fichiers: [],
        commandes: [],
        commits: [],
        taches: [],
        erreurs: 0,
        externe: false,
      });
    });
  });

  // Décision d'Amos du 23/11 : un appel Workflow se juge sur les échanges des agents de son run, par la règle de T63
  // sans le rapport final ; la CLI juge chaque agent à la lecture (loadWorkflowRuns). Formes relevées le 23/11 ;
  // fixtures inventées.
  describe('l’agent d’un run de workflow (isExternalWorkflowAgent)', () => {
    const SA = { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' };
    const consigne = JSON.stringify({ type: 'user', ...SA, message: { content: 'Consigne.' } });
    const geste = (id: string, name: string, input: unknown) => [
      appel(id, name, input, SA),
      resultat(id, 'ok', SA),
    ];
    // Un agent de workflow finit par rendre son StructuredOutput, sans message end_turn après.
    const agent = (...lignes: string[]) =>
      [consigne, ...lignes, ...geste('so', 'StructuredOutput', { verdict: 'ok' })].join('\n');

    it('un agent qui ne fait que lire et rendre son StructuredOutput : non externe', () => {
      expect(isExternalWorkflowAgent(agent(...geste('r1', 'Read', {})), false)).toBe(false);
    });

    it.each([
      ['WebFetch', { url: 'https://x.example' }],
      ['Bash', { command: 'gh pr view 12' }],
      ['mcp__github__get_issue', {}],
      ['Agent', {}],
      ['Workflow', {}],
    ])('un agent qui appelle %s %j : externe', (name, input) => {
      expect(isExternalWorkflowAgent(agent(...geste('e1', name, input)), false)).toBe(true);
    });

    it('un agent encore en cours, qui n’a fait que lire : non externe', () => {
      const enCours = [consigne, ...geste('r1', 'Read', {})].join('\n');
      expect(isExternalWorkflowAgent(enCours, false)).toBe(false);
    });

    it('une ligne illisible : externe', () => {
      expect(isExternalWorkflowAgent(agent('ceci n’est pas du JSON'), false)).toBe(true);
    });

    it('un sous-agent de l’agent, retrouvé, qui ne fait que lire : non externe ; un mcp__leon__thread, selon le serveur', () => {
      const sousAgent = [
        consigne,
        ...geste('t1', 'Grep', {}),
        JSON.stringify({
          type: 'assistant',
          ...SA,
          message: { content: [{ type: 'text', text: 'Rapport.' }], stop_reason: 'end_turn' },
        }),
      ].join('\n');
      const lance = agent(...geste('a2', 'Agent', { prompt: 'Relis.' }));
      expect(isExternalWorkflowAgent(lance, false, new Map([['a2', sousAgent]]))).toBe(false);
      const leon = agent(...geste('l1', 'mcp__leon__thread', {}));
      expect(isExternalWorkflowAgent(leon, true)).toBe(false);
      expect(isExternalWorkflowAgent(leon, false)).toBe(true);
    });
  });

  describe('l’appel Workflow, jugé par son run', () => {
    const session = appel('w1', 'Workflow', { script: 'export const meta = {}' });
    const externe = (workflows?: Set<string>, contenu = session) =>
      extractClaudeCodeFacts(contenu, RACINE, false, undefined, workflows).externe;

    it('un run local : non externe, même écrit sur deux lignes', () => {
      expect(externe(new Set(['w1']))).toBe(false);
      expect(externe(new Set(['w1']), [session, session].join('\n'))).toBe(false);
    });

    it.each([
      ['sans ensemble', undefined],
      ['un autre appel seulement', new Set(['autre'])],
    ])('un run qui n’est pas jugé local (%s) : externe', (_cas, workflows) => {
      expect(externe(workflows)).toBe(true);
    });
  });

  it('prend le dernier état de TodoWrite', () => {
    const contenu = [
      appel('t1', 'TodoWrite', { todos: [{ content: 'Ancienne tâche', status: 'pending' }] }),
      resultat('t1', 'Todos have been modified successfully.'),
      appel('t2', 'TodoWrite', {
        todos: [
          { content: 'Lire le code', status: 'completed', activeForm: 'Lecture' },
          { content: 'Écrire le test', status: 'in_progress', activeForm: 'Écriture' },
          { content: 'Ouvrir la PR', status: 'pending', activeForm: 'Ouverture' },
        ],
      }),
      resultat('t2', 'Todos have been modified successfully.'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).taches).toEqual([
      { texte: 'Écrire le test', etat: 'en_cours' },
      { texte: 'Ouvrir la PR', etat: 'a_faire' },
      { texte: 'Lire le code', etat: 'fait' },
    ]);
  });

  it('ne compte comme échanges que les messages tapés par la personne', () => {
    const user = (n: number, content: unknown) =>
      JSON.stringify({
        type: 'user',
        uuid: `u${n}`,
        sessionId: 's1',
        timestamp: `2026-11-06T10:0${n}:00.000Z`,
        message: { content },
      });
    const contenu = [
      user(1, 'Corrige le test.'),
      user(
        2,
        '<task-notification>\n<task-id>t1</task-id>\n<status>completed</status>\n</task-notification>',
      ),
      user(3, '<local-command-stdout>Compacted</local-command-stdout>'),
      user(4, '<bash-stdout>ok</bash-stdout><bash-stderr></bash-stderr>'),
      user(5, '[Request interrupted by user for tool use]'),
      user(6, '<command-name>/review</command-name>\n<command-message>review</command-message>'),
      user(7, [{ type: 'text', text: 'Le bloc <task-notification> sert à quoi ?' }]),
    ].join('\n');

    // 1, 6 (une commande tapée) et 7 (un message qui parle d'un bloc sans en être un).
    expect(extractClaudeCodeFacts(contenu, RACINE).echanges).toBe(3);
  });

  it('ignore une ligne illisible', () => {
    const contenu = [
      'ceci n’est pas du JSON',
      '{"type":"assistant","message":{"content":[{"type":"tool_use"',
      JSON.stringify({ type: 'user', gitBranch: 42, message: { content: 'Pas une branche.' } }),
      appel('b1', 'Bash', { command: 'git status' }),
      resultat('b1', 'On branch main'),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).commandes).toEqual([
      { texte: 'git status', erreur: false, suite: false },
    ]);
  });

  it('donne des faits vides pour une session sans geste', () => {
    expect(
      extractClaudeCodeFacts(fixture('claude-code/session-simple'), '/Users/demo/projets/acme'),
    ).toEqual({
      branche: null,
      prs: [],
      commits: [],
      fichiers: [],
      commandes: [],
      taches: [],
      erreurs: 0,
      externe: false,
      echanges: 3,
      debut: '2026-10-13T08:00:00.000Z',
      fin: '2026-10-13T08:02:03.000Z',
    });
  });

  it('rend null pour une tête détachée', () => {
    const contenu = JSON.stringify({ type: 'user', gitBranch: 'HEAD', message: { content: 'x' } });

    expect(extractClaudeCodeFacts(contenu, RACINE).branche).toBeNull();
  });

  it('reste dans les bornes de C1', () => {
    const contenu = [
      ...Array.from({ length: 60 }, (_, i) => [
        appel(`w${i}`, 'Write', { file_path: `${RACINE}/f${i}.ts` }),
        resultat(`w${i}`, 'ok'),
      ]),
      ...Array.from({ length: 40 }, (_, i) => [
        appel(`c${i}`, 'Bash', { command: `git commit -m c${i}` }),
        resultat(`c${i}`, `[main ${(0xabc0000 + i).toString(16)}] c${i}`),
      ]),
      ...Array.from({ length: 25 }, (_, i) => [
        appel(`t${i}`, 'TaskCreate', { subject: 'x'.repeat(300) }),
        resultat(`t${i}`, `Task #${i + 1} created successfully: ${'x'.repeat(300)}`),
      ]),
      ...Array.from({ length: 12 }, (_, i) => [
        JSON.stringify({ type: 'pr-link', prNumber: i + 1, prRepository: 'demo/leon' }),
      ]),
    ]
      .flat()
      .join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.fichiers).toHaveLength(50);
    expect(faits.fichiers.at(-1)).toBe('f59.ts');
    expect(faits.commandes).toHaveLength(30);
    expect(faits.commits).toHaveLength(20);
    expect(faits.taches).toHaveLength(20);
    expect(faits.taches[0]?.texte).toHaveLength(200);
    expect(faits.prs).toHaveLength(10);
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });
});

// La réduction du nom d'un outil (C10 amendé le 12/11, T51) : le nom d'un outil MCP ne part jamais, seul son serveur.
describe('reduceToolName', () => {
  it.each([
    ['mcp__linear__get_issue', 'mcp:linear'],
    ['mcp:linear', 'mcp:linear'],
    ['mcp__x', '[outil]'],
    ['mcp__x__', '[outil]'],
    ['mcp____y', '[outil]'],
    [`mcp__${'s'.repeat(57)}__y`, '[outil]'],
    [`mcp__${'s'.repeat(56)}__y`, `mcp:${'s'.repeat(56)}`],
    ['mcp__a__b__c', 'mcp:a'],
    ['mcp__a b__c', '[outil]'],
    ['mcp:', '[outil]'],
    ['Bash', 'Bash'],
    ['Read', 'Read'],
    ['outil avec espace', '[outil]'],
    ['https://exemple.test', '[outil]'],
    ['', '[outil]'],
  ])('%s donne %s', (name, expected) => {
    expect(reduceToolName(name)).toBe(expected);
  });
});

// T58 amendé le 27/11 : la suite, les outils en erreur et les commandes des agents. Fixtures inventées.
describe('isChainedCommand (la suite, D39 amendé le 27/11)', () => {
  it.each([
    'pnpm test:db',
    'pnpm test 2>&1',
    'pnpm test > out.txt 2>&1',
    'pnpm test &> out.txt',
    'pnpm test &>> out.txt',
    'cmd >| f',
    'cmd <&3 >&-',
    'git commit -m "a; b"',
    'git commit -m "a && b | c"',
    "git commit -m 'a; b'",
    "echo $'a\\';b'",
    'find . -exec rm {} \\;',
    'pnpm test \\\n  --run',
    '  pnpm test\n',
    'echo "$(a; b)"',
    'a >\\&b',
  ])('« %s » n’est pas une suite', (command) => {
    expect(isChainedCommand(command)).toBe(false);
  });

  it.each([
    'pnpm test:db; echo fini',
    'cd x && pnpm test',
    'pnpm test 2>&1 | tail',
    'a || b',
    'a | b',
    'a |& b',
    'sleep 5 &',
    'a 2>&1 &',
    'a&b',
    'pnpm test\necho fini',
    'cat <<EOF\nx\nEOF',
    'echo $(a; b)',
    'echo `a | b`',
    'git commit -m "a',
    "echo 'a",
    'git commit -m "a" && git push',
    // Une chaîne retirée ne colle pas un « & » à un « > » : « a >"x" & b » lance b en fond.
    'a >"x"& b',
    'a\\>&b',
    'curl https://x.example/?a=1&b=2',
    'pnpm test\u0000; echo fini',
  ])('« %s » est une suite', (command) => {
    expect(isChainedCommand(command)).toBe(true);
  });

  it('recordCommand pose suite sur la commande brute, avant la réduction', () => {
    const contenu = [
      appel('b1', 'Bash', { command: 'cd x && pnpm test' }),
      resultat('b1', ''),
      appel('b2', 'Bash', { command: 'git commit -m "a; b"' }),
      resultat('b2', ''),
    ].join('\n');

    expect(extractClaudeCodeFacts(contenu, RACINE).commandes).toEqual([
      { texte: 'cd', erreur: false, suite: true },
      { texte: 'git commit', erreur: false, suite: false },
    ]);
  });
});

const enErreur = (id: string, content: string, extra = {}) =>
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: true }] },
    ...extra,
  });

describe('outils_en_erreur', () => {
  it('relève un outil MCP en erreur sous le nom de son serveur, sans message, sortie ni argument', () => {
    const contenu = [
      appel('m1', 'mcp__linear__get_issue', { id: 'argument-temoin' }),
      enErreur('m1', 'Issue not found: message-temoin'),
      appel('b1', 'Bash', { command: 'pnpm test' }),
      enErreur('b1', 'sortie-temoin'),
    ].join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.outils_en_erreur).toEqual([{ outil: 'mcp:linear', nombre: 1 }]);
    expect(faits.commandes).toEqual([{ texte: 'pnpm test', erreur: true, suite: false }]);
    expect(faits.erreurs).toBe(2);
    expect(JSON.stringify(faits)).not.toMatch(/temoin|get_issue/);
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('ne compte pas un Edit arrêté par la lecture obligée (D40) ; erreurs compte les deux', () => {
    const contenu = [
      appel('e1', 'Edit', { file_path: `${RACINE}/a.ts` }),
      enErreur('e1', `PreToolUse:Edit hook denied this tool: ${READ_FIRST_MARK} Avant…`),
      appel('e2', 'Edit', { file_path: `${RACINE}/b.ts` }),
      enErreur('e2', 'String to replace not found in file.'),
    ].join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.outils_en_erreur).toEqual([{ outil: 'Edit', nombre: 1 }]);
    expect(faits.erreurs).toBe(2);
  });

  it('garde les 20 plus fréquents, à égalité par ordre alphabétique', () => {
    const noms = Array.from({ length: 25 }, (_, i) => `t${String(i).padStart(2, '0')}`);
    const echecs = noms.flatMap((nom, i) => (i >= 20 ? [nom, nom] : [nom]));
    const contenu = echecs
      .flatMap((nom, i) => [appel(`o${i}`, nom, {}), enErreur(`o${i}`, 'x')])
      .join('\n');
    const faits = extractClaudeCodeFacts(contenu, RACINE);

    expect(faits.outils_en_erreur).toEqual([
      ...noms.slice(20).map((outil) => ({ outil, nombre: 2 })),
      ...noms.slice(0, 15).map((outil) => ({ outil, nombre: 1 })),
    ]);
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('sans outil en erreur, la clé est absente', () => {
    const contenu = [appel('r1', 'Read', {}), resultat('r1', 'ok')].join('\n');
    expect(extractClaudeCodeFacts(contenu, RACINE)).not.toHaveProperty('outils_en_erreur');
  });
});

describe('commandes_agents (décision d’Amos du 27/11)', () => {
  const SA = { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' };
  const heure = (s: number) => `2026-11-27T10:00:${String(s).padStart(2, '0')}.000Z`;
  const consigne = (s: number | null) =>
    JSON.stringify({
      type: 'user',
      ...SA,
      ...(s !== null && { timestamp: heure(s) }),
      message: { content: 'Consigne.' },
    });
  const rapport = JSON.stringify({
    type: 'assistant',
    ...SA,
    message: { content: [{ type: 'text', text: 'Rapport.' }], stop_reason: 'end_turn' },
  });
  const commande = (id: string, command: string, sortie = '', erreur = false) => [
    appel(id, 'Bash', { command }, SA),
    erreur ? enErreur(id, sortie, SA) : resultat(id, sortie, SA),
  ];
  const sousAgent = (debut: number | null, ...lignes: string[]) =>
    [consigne(debut), ...lignes, rapport].join('\n');
  const session = [appel('a1', 'Agent', { prompt: 'Cherche.' }), resultat('a1', 'Rapport.')].join(
    '\n',
  );
  const faitsAvec = (subagents: Map<string, string>, contenu = session) =>
    extractClaudeCodeFacts(contenu, RACINE, false, subagents);

  it('les commandes Bash d’un sous-agent de fixture arrivent avec agent 1 ; la tête ne change pas', () => {
    const dossier = 'claude-code-sous-agents/55555555-5555-4555-8555-555555555555';
    const subagents = new Map([
      ['toolu_01Depot', fixture(`${dossier}/subagents/agent-a1b2c3d4e5f6a7b8c`)],
      ['toolu_01Petit', fixture(`${dossier}/subagents/agent-b9c8d7e6f5a4b3c2d`)],
    ]);
    const sans = extractClaudeCodeFacts(fixture(dossier), RACINE);
    const { commandes_agents, ...tete } = extractClaudeCodeFacts(
      fixture(dossier),
      RACINE,
      false,
      subagents,
    );

    expect(commandes_agents).toEqual([
      { agent: 1, texte: 'pnpm test', erreur: false, suite: false },
    ]);
    expect(tete).toEqual({ ...sans, externe: false });
  });

  it('un sous-agent qui écrit, tient ses tâches, commite et crée une PR n’ajoute rien de tout ça à la tête', () => {
    const agent = sousAgent(
      1,
      appel('w1', 'Write', { file_path: `${RACINE}/src/sous-agent.ts` }, SA),
      resultat('w1', 'ok', SA),
      appel('t1', 'TodoWrite', { todos: [{ content: 'x', status: 'pending' }] }, SA),
      resultat('t1', 'ok', SA),
      ...commande('c1', 'git commit -m x', '[main 9f9f9f9] x'),
      ...commande('p1', 'gh pr create --fill', 'https://github.com/o/r/pull/7'),
      ...commande('f1', 'pnpm test && pnpm lint', 'sortie-temoin', true),
    );
    const faits = faitsAvec(new Map([['a1', agent]]));

    expect(faits).toMatchObject({
      fichiers: [],
      taches: [],
      commits: [],
      prs: [],
      commandes: [],
      erreurs: 0,
      externe: false,
    });
    expect(faits.commandes_agents).toEqual([
      { agent: 1, texte: 'git commit', erreur: false, suite: false },
      { agent: 1, texte: 'gh pr', erreur: false, suite: false },
      { agent: 1, texte: 'pnpm test', erreur: true, suite: true },
    ]);
    expect(JSON.stringify(faits)).not.toMatch(/9f9f9f9|pull\/7|temoin|sous-agent\.ts/);
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('un agent de 40 commandes garde ses 20 dernières, dans l’ordre de son fichier', () => {
    const lignes = Array.from({ length: 40 }, (_, i) => commande(`c${i}`, `c${i} -v`)).flat();
    const faits = faitsAvec(new Map([['a1', sousAgent(1, ...lignes)]]));

    expect(faits.commandes_agents?.map(({ texte }) => texte)).toEqual(
      Array.from({ length: 20 }, (_, i) => `c${i + 20}`),
    );
  });

  it('8 agents de 20 en gardent 100, les plus récents, numérotés par l’heure de leur première ligne', () => {
    // L'ordre de lecture n'est pas celui des heures ; l'agent sans heure passe en dernier.
    const debuts = [3, 7, 1, null, 5, 2, 8, 4];
    const agents: AgentActions[] = debuts.map((debut, n) => ({
      debut: debut === null ? null : heure(debut),
      commandes: Array.from({ length: 20 }, (_, i) => ({
        texte: `a${n}-${i}`,
        erreur: false,
        suite: false,
      })),
      outils: new Map(),
    }));
    const { commandes_agents = [] } = buildAgentCommands(agents, new Map());

    expect(commandes_agents).toHaveLength(100);
    // Rangés par heure : 2 (1), 5 (2), 0 (3), 7 (4), 4 (5), 1 (7), 6 (8), puis 3 (sans heure) ; les 5 derniers restent.
    const premiers = commandes_agents.filter((_, i) => i % 20 === 0);
    expect(premiers.map(({ agent, texte }) => [agent, texte])).toEqual([
      [1, 'a7-0'],
      [2, 'a4-0'],
      [3, 'a1-0'],
      [4, 'a6-0'],
      [5, 'a3-0'],
    ]);
    // Les entrées d'un même agent se suivent.
    expect(commandes_agents.map(({ agent }) => agent)).toEqual(
      [1, 2, 3, 4, 5].flatMap((agent) => Array(20).fill(agent)),
    );
  });

  it('les heures se comparent en instants, quel que soit leur décalage', () => {
    const agent = (debut: string, texte: string): AgentActions => ({
      debut,
      commandes: [{ texte, erreur: false, suite: false }],
      outils: new Map(),
    });
    const { commandes_agents } = buildAgentCommands(
      [agent('2026-11-27T11:30:00+02:00', 'tard'), agent('2026-11-27T10:00:00Z', 'tot')],
      new Map(),
    );

    expect(commandes_agents?.map(({ texte }) => texte)).toEqual(['tard', 'tot']);
  });

  it.each([
    ['sans table', undefined],
    [
      'des agents qui n’ont rien lancé',
      new Map([['a1', sousAgent(1, appel('r1', 'Read', {}, SA))]]),
    ],
  ])('sans commande d’agent (%s), la clé est absente', (_cas, subagents) => {
    const faits = extractClaudeCodeFacts(session, RACINE, false, subagents);
    expect(faits).not.toHaveProperty('commandes_agents');
    expect(faits).not.toHaveProperty('outils_en_erreur');
  });

  it('un outil en erreur chez un agent s’additionne à celui de la tête', () => {
    const contenu = [session, appel('m1', 'mcp__linear__get_issue', {}), enErreur('m1', 'x')].join(
      '\n',
    );
    const agent = sousAgent(
      1,
      appel('m2', 'mcp__linear__list_issues', {}, SA),
      enErreur('m2', 'x', SA),
      appel('r1', 'Read', {}, SA),
      enErreur('r1', 'x', SA),
    );
    const faits = faitsAvec(new Map([['a1', agent]]), contenu);

    expect(faits.outils_en_erreur).toEqual([
      { outil: 'mcp:linear', nombre: 2 },
      { outil: 'Read', nombre: 1 },
    ]);
    expect(faits.erreurs).toBe(1);
    expect(faits).not.toHaveProperty('commandes_agents');
  });

  it('un même agent, son appel écrit deux fois et ses blocs recopiés, n’est relevé qu’une fois', () => {
    const copie = JSON.stringify({
      type: 'api-request-blob',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'pnpm test' } }],
      },
    });
    const agent = sousAgent(1, ...commande('c1', 'pnpm test'), copie);
    const faits = faitsAvec(new Map([['a1', agent]]), [session, session].join('\n'));

    expect(faits.commandes_agents).toEqual([
      { agent: 1, texte: 'pnpm test', erreur: false, suite: false },
    ]);
  });

  it('extractAgentActions lit un agent de workflow (sans isSidechain à sauter) ; ses relevés passent en paramètre', () => {
    const agent = [
      JSON.stringify({ type: 'user', timestamp: heure(9), message: { content: 'Consigne.' } }),
      ...commande('c1', 'pnpm typecheck'),
      appel('so', 'StructuredOutput', { verdict: 'ok' }, SA),
      enErreur('so', 'x', SA),
    ].join('\n');
    const releve = extractAgentActions(agent);

    expect(releve.debut).toBe(heure(9));
    expect(releve.commandes).toEqual([{ texte: 'pnpm typecheck', erreur: false, suite: false }]);
    const workflow = appel('w1', 'Workflow', { script: 'x' });
    const faits = extractClaudeCodeFacts(workflow, RACINE, false, undefined, new Set(['w1']), [
      releve,
    ]);
    expect(faits.commandes_agents).toEqual([
      { agent: 1, texte: 'pnpm typecheck', erreur: false, suite: false },
    ]);
    expect(faits.outils_en_erreur).toEqual([{ outil: 'StructuredOutput', nombre: 1 }]);
    expect(faits.externe).toBe(false);
  });
});
