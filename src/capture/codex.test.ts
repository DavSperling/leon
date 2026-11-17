import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type CodexSubagents,
  codexSubagentThreads,
  extractCodexBackstage,
  extractCodexFacts,
  parseCodexSession,
} from './codex';
import { SECRET_MASK } from './mask-secrets';
import { SessionFactsSchema } from './session-facts';
import { TURN_TEXT_MAX } from './turn';

// Fixtures inventées, sur la structure d'un rollout de Codex 0.167 (historique paginé), jamais une vraie conversation.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/codex/${name}.jsonl`, import.meta.url), 'utf8');

const RACINE = '/Users/demo/projets/leon';
const THREAD = '019a5e10-0000-7000-8000-000000000001';

// Fixtures inventées dans la forme de codex-cli 0.159.0 relevée par l'annexe 09 : une session qui lance deux
// sous-agents et les attend (S), un sous-agent qui lit a.txt par une commande locale (L), un autre qui cherche sur le
// web (W), et leurs rapports revenus en agent_message. Rangs choisis : la première ligne d'un sous-agent hors
// numérotation, l'historique recopié de sa mère de 0 à subagent_history_start_ordinal - 1, ses lignes propres ensuite
// (l'annexe voit son task_started propre à la ligne 10 pour un rang de départ 9).
const S = '019a7d2c-1111-7111-8111-111111111111';
const L = '019a7d2c-2222-7222-8222-222222222222';
const W = '019a7d2c-3333-7333-8333-333333333333';
const G = '019a7d2c-4444-7444-8444-444444444444'; // un sous-agent de sous-agent
const ESSAI = '/Users/demo/projets/essai';
const rollout = (date: string, thread: string) =>
  readFileSync(
    new URL(
      `./fixtures/codex-sous-agents/rollout-2026-11-13T${date}-${thread}.jsonl`,
      import.meta.url,
    ),
    'utf8',
  );
const SESSION = rollout('10-56-00', S);
const LECTEUR = rollout('10-56-05', L);
const CHERCHEUR = rollout('10-56-06', W);
const FIXTURE: CodexSubagents = new Map([
  [L, LECTEUR],
  [W, CHERCHEUR],
]);

const meta = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    timestamp: '2026-11-06T09:00:00.000Z',
    ordinal: 0,
    type: 'session_meta',
    payload: {
      id: THREAD,
      cwd: RACINE,
      source: 'cli',
      history_mode: 'paginated',
      git: { branch: 'demo/b' },
      ...extra,
    },
  });
let ordinal = 1;
// Une seconde par rang : au-delà de 59, la minute suivante (un horodatage invalide écarterait la ligne).
const ligne = (type: string, payload: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    timestamp: new Date(Date.UTC(2026, 10, 6, 9, 0, ordinal)).toISOString(),
    ordinal: ordinal++,
    type,
    payload,
    ...extra,
  });
const message = (role: string, text: string) =>
  ligne('response_item', {
    type: 'message',
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
  });
const element = (item: Record<string, unknown>) =>
  ligne('event_msg', { type: 'item_completed', thread_id: THREAD, turn_id: 't', item });
const commande = (script: string, extra: Record<string, unknown> = {}) =>
  element({
    type: 'CommandExecution',
    id: 'c',
    command: ['/bin/zsh', '-lc', script],
    cwd: RACINE,
    parsed_cmd: [],
    source: 'agent',
    status: 'completed',
    exit_code: 0,
    aggregated_output: '',
    ...extra,
  });
const session = (...lignes: string[]) => [meta(), ...lignes].join('\n');

describe('parseCodexSession', () => {
  it('lit les tours de rollout-git : la personne et l’assistant, sans le contexte de Codex ni le bloc de Leon', () => {
    const lue = parseCodexSession(fixture('rollout-git'));

    expect(lue).toMatchObject({
      sessionId: THREAD,
      cwd: RACINE,
      title: 'Ajoute le lecteur des sessions Codex, puis ouvre la PR.',
      branche: 'demo/codex-faits',
      commit: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
      origine: null,
    });
    expect(lue?.turns.map((t) => [t.external_id, t.role, t.text, t.capture_mode])).toEqual([
      [
        'o6@2026-11-06T09:00:01.000Z',
        'user',
        'Ajoute le lecteur des sessions Codex, puis ouvre la PR.',
        'file',
      ],
      [
        'o21@2026-11-06T09:00:20.000Z',
        'assistant',
        'Le lecteur est écrit et la PR #138 est ouverte.',
        'file',
      ],
      ['o25@2026-11-06T09:02:00.100Z', 'user', 'Ajoute aussi un test pour la branche.', 'file'],
      ['o26@2026-11-06T09:02:05.000Z', 'assistant', 'Test ajouté.', 'file'],
    ]);
    expect(lue?.turns.map((t) => t.ts)).toEqual([
      '2026-11-06T09:00:01.000Z',
      '2026-11-06T09:00:20.000Z',
      '2026-11-06T09:02:00.100Z',
      '2026-11-06T09:02:05.000Z',
    ]);
  });

  it('lit rollout-sans-git : pas de branche, et la sortie d’une commande `!` marquée injectée', () => {
    const lue = parseCodexSession(fixture('rollout-sans-git'));

    expect(lue).toMatchObject({
      sessionId: '019a5e10-0000-7000-8000-000000000002',
      cwd: '/Users/demo/notes',
      branche: null,
      commit: null,
    });
    expect(lue?.turns.map((t) => [t.role, t.text, t.injecte])).toEqual([
      ['user', 'Quelle est la date de sortie de la version 2 ?', false],
      [
        'user',
        '<user_shell_command>\n<command>ls</command>\n<result>notes.md</result>\n</user_shell_command>',
        true,
      ],
      ['assistant', "La version 2 sort en décembre, d'après la page du projet.", undefined],
    ]);
  });

  it('lit rollout-history-base : seules ses propres lignes, et le rollout repris noté comme origine', () => {
    const lue = parseCodexSession(fixture('rollout-history-base'));

    expect(lue?.origine).toBe(THREAD);
    expect(lue?.turns.map((t) => t.external_id)).toEqual([
      'o11@2026-11-06T11:00:01.000Z',
      'o14@2026-11-06T11:00:05.000Z',
    ]);
  });

  it('écarte les lignes d’un préfixe hérité, si Codex les recopie dans le fichier', () => {
    const recopiee = JSON.stringify({
      timestamp: '2026-11-06T08:00:00.000Z',
      ordinal: 3,
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Ancien' }] },
    });
    const lue = parseCodexSession(
      [
        meta({
          history_base: { thread_id: 'avant', end_ordinal_exclusive: 5, end_byte_offset: 1 },
        }),
        recopiee,
        JSON.stringify({
          timestamp: '2026-11-06T11:00:00.000Z',
          ordinal: 5,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Neuf' }],
          },
        }),
      ].join('\n'),
    );

    expect(lue?.turns.map((t) => t.text)).toEqual(['Neuf']);
  });

  it('après un retour en arrière, un tour du nouveau fichier ne reprend pas l’identifiant d’un tour abandonné', () => {
    const ancien = parseCodexSession(fixture('rollout-git'));
    const nouveau = parseCodexSession(
      [
        meta({ history_base: { thread_id: THREAD, end_ordinal_exclusive: 6, end_byte_offset: 1 } }),
        JSON.stringify({
          timestamp: '2026-11-06T12:00:00.000Z',
          ordinal: 6,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Autre' }],
          },
        }),
      ].join('\n'),
    );

    const ids = new Set(ancien?.turns.map((t) => t.external_id));
    expect(nouveau?.turns).toHaveLength(1);
    expect(ids.has(nouveau?.turns[0]?.external_id ?? '')).toBe(false);
  });

  it('à l’ancien format, sans numéro, identifie un tour par sa ligne et son heure', () => {
    const ancien = [
      JSON.stringify({
        timestamp: '2026-01-02T09:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'ancien', cwd: RACINE, source: 'cli' },
      }),
      JSON.stringify({
        timestamp: '2026-01-02T09:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Salut' }],
        },
      }),
    ].join('\n');

    expect(parseCodexSession(ancien)?.turns[0]?.external_id).toBe('l1@2026-01-02T09:00:01.000Z');
  });

  it('garde les tours injectés, marqués : rapport de sous-agent, interruption, crochet ; ni titre ni échange', () => {
    ordinal = 1;
    const contenu = session(
      message('user', '<turn_aborted>\nThe user interrupted.\n</turn_aborted>'),
      message('user', 'Lance un sous-agent sur les tests.'),
      message(
        'user',
        '<subagent_notification>{"agent_id":"a","status":{"completed":"Tout passe."}}</subagent_notification>',
      ),
      message('user', '<hook_prompt hook_run_id="h1">Relis le diff.</hook_prompt>'),
      message('assistant', 'Les tests passent.'),
    );
    const lue = parseCodexSession(contenu);

    expect(
      lue?.turns.map((t) => [t.external_id, t.role, 'injecte' in t ? t.injecte : 'sans marque']),
    ).toEqual([
      ['o1@2026-11-06T09:00:01.000Z', 'user', true],
      ['o2@2026-11-06T09:00:02.000Z', 'user', false],
      ['o3@2026-11-06T09:00:03.000Z', 'user', true],
      ['o4@2026-11-06T09:00:04.000Z', 'user', true],
      ['o5@2026-11-06T09:00:05.000Z', 'assistant', 'sans marque'],
    ]);
    expect(lue?.title).toBe('Lance un sous-agent sur les tests.');
    expect(extractCodexFacts(contenu, RACINE).echanges).toBe(1);
  });

  it('retire les blocs de Leon d’un message, et écarte un message qui n’a rien d’autre', () => {
    const lue = parseCodexSession(
      session(
        message('user', '<contexte-leon>\n- 05/11 · Claude Code\n</contexte-leon>'),
        message('user', 'Question\n<contexte-leon>bloc recopié</contexte-leon>'),
      ),
    );

    expect(lue?.turns.map((t) => t.text)).toEqual(['Question']);
  });

  it('ne lit pas le fil d’un sous-agent ni un fil interne de Codex', () => {
    const tour = message('user', 'Vérifie les tests.');
    const sources = [
      { source: { subagent: { thread_spawn: { parent_thread_id: 'p', depth: 1 } } } },
      { source: { subagent: 'review' } },
      { source: { internal: 'guardian' } },
      { thread_source: 'subagent' },
      { parent_thread_id: 'p' },
    ];
    for (const extra of sources) {
      expect(parseCodexSession([meta(extra), tour].join('\n')), JSON.stringify(extra)).toBeNull();
    }
  });

  it('rend null sans session_meta, et ignore les lignes illisibles', () => {
    expect(parseCodexSession(message('user', 'Seul'))).toBeNull();
    expect(parseCodexSession(['pas du json', meta(), '{}'].join('\n'))?.turns).toEqual([]);
  });
});

describe('extractCodexFacts', () => {
  it('relève les gestes de rollout-git', () => {
    const faits = extractCodexFacts(fixture('rollout-git'), RACINE);

    expect(faits).toEqual({
      branche: 'demo/codex-faits',
      prs: [{ repo: 'demo/leon', numero: 138, par: 'gh-pr-create' }],
      commits: ['1a2b3c4'],
      fichiers: ['src/capture/codex.ts', 'src/capture/turn.ts'],
      commandes: [
        { texte: 'git checkout', erreur: false },
        { texte: 'pnpm vitest', erreur: true },
        { texte: 'git add', erreur: false },
        { texte: 'gh pr', erreur: false },
      ],
      taches: [
        { texte: 'Écrire le lecteur', etat: 'en_cours' },
        { texte: 'Ouvrir la PR', etat: 'a_faire' },
        { texte: 'Lire le format du rollout', etat: 'fait' },
      ],
      erreurs: 1,
      externe: false,
      echanges: 2,
      debut: '2026-11-06T09:00:00.000Z',
      fin: '2026-11-06T09:02:05.000Z',
    });
    expect(SessionFactsSchema.safeParse(faits).success).toBe(true);
  });

  it('rollout-sans-git : une recherche web rend la session externe ; hors dépôt, aucun fichier', () => {
    const faits = extractCodexFacts(fixture('rollout-sans-git'), null);

    expect(faits).toMatchObject({
      branche: null,
      fichiers: [],
      commandes: [{ texte: 'ls', erreur: false }],
      externe: true,
      echanges: 1,
    });
  });

  it('prend la branche lue à la capture seulement quand le rollout n’en porte pas', () => {
    expect(extractCodexFacts(fixture('rollout-sans-git'), null, 'main').branche).toBe('main');
    expect(extractCodexFacts(fixture('rollout-git'), RACINE, 'main').branche).toBe(
      'demo/codex-faits',
    );
  });

  it('rollout-history-base : seulement ses propres gestes ; un appel MCP la rend externe', () => {
    const faits = extractCodexFacts(fixture('rollout-history-base'), RACINE);

    expect(faits).toMatchObject({
      commandes: [{ texte: 'leon', erreur: false }],
      externe: true,
      echanges: 1,
      debut: '2026-11-06T11:00:00.000Z',
    });
  });

  describe('externe', () => {
    const externe = (...lignes: string[]) => extractCodexFacts(session(...lignes), RACINE).externe;

    it('une commande réseau, la recherche web, un appel MCP, un sous-agent, un outil inconnu : oui', () => {
      expect(externe(commande('cd x && curl -s https://example.com'))).toBe(true);
      expect(externe(element({ type: 'WebSearch', id: 'w', query: 'q', action: {} }))).toBe(true);
      expect(
        externe(ligne('response_item', { type: 'web_search_call', status: 'completed' })),
      ).toBe(true);
      expect(externe(element({ type: 'McpToolCall', id: 'm', server: 's', tool: 't' }))).toBe(true);
      // Un sous-agent dont on ne lit pas le fichier (T63 : échec fermé), ou hors de la forme relevée.
      expect(externe(element({ type: 'SubAgentActivity', id: 's', kind: 'started' }))).toBe(true);
      expect(
        externe(
          element({ type: 'SubAgentActivity', id: 's', kind: 'started', agent_thread_id: L }),
        ),
      ).toBe(true);
      expect(externe(element({ type: 'SubAgentActivity', id: 's', kind: 'inconnu' }))).toBe(true);
      // Un outil de sous-agent autre que l'attente, que l'annexe 09 n'a pas vu.
      expect(externe(element({ type: 'CollabAgentToolCall', id: 'a', tool: 'spawn_agent' }))).toBe(
        true,
      );
      expect(externe(element({ type: 'CollabAgentToolCall', id: 'a', tool: 'send_input' }))).toBe(
        true,
      );
      expect(externe(element({ type: 'DynamicToolCall', id: 'd', tool: 'x' }))).toBe(true);
      expect(externe(element({ type: 'TypeInconnu', id: 'i' }))).toBe(true);
      expect(externe(element({ type: 'FunctionCallOutput', id: 'f', name: 'tool_search' }))).toBe(
        true,
      );
    });

    it('les commandes locales, `leon`, les fichiers, le plan, les messages : non', () => {
      expect(
        externe(
          commande('pnpm test'),
          commande('git fetch origin && git pull --ff-only'),
          commande('~/.leon/bin/leon thread'),
          commande('leon search "route des faits"'),
          commande('~/.leon/bin/leon note --tool codex --session s-1 "reprendre la route"'),
          element({ type: 'FileChange', id: 'p', changes: {}, status: 'completed' }),
          element({ type: 'FunctionCallOutput', id: 'f', name: 'update_plan' }),
          element({ type: 'Reasoning', id: 'r' }),
          element({ type: 'UserMessage', id: 'u', content: [] }),
          element({ type: 'AgentMessage', id: 'a', content: [] }),
        ),
      ).toBe(false);
    });

    // Lire Leon (T44 ; D36, A14) : les outils locaux du serveur `leon`, quand la CLI l'a reconnu à son URL.
    it('un outil local du serveur MCP de Leon reconnu : non ; search, fetch, un autre serveur, ou non reconnu : oui', () => {
      const mcp = (server: string, tool: string, leon: boolean) =>
        extractCodexFacts(
          session(element({ type: 'McpToolCall', id: 'm', server, tool, status: 'completed' })),
          RACINE,
          null,
          leon,
        ).externe;
      for (const tool of ['threads', 'thread', 'versions', 'lessons', 'remember']) {
        expect(mcp('leon', tool, true), tool).toBe(false);
        expect(mcp('leon', tool, false), tool).toBe(true);
      }
      for (const tool of ['search', 'fetch', 'briefing', 'thread_x']) {
        expect(mcp('leon', tool, true), tool).toBe(true);
      }
      expect(mcp('leon_bis', 'thread', true)).toBe(true);
      expect(mcp('Leon', 'thread', true)).toBe(true);
      // La fin de l'appel, quand le rollout la garde aussi : la même règle.
      const fin = (server: string, tool: string) =>
        extractCodexFacts(
          session(
            element({ type: 'McpToolCall', id: 'm', server, tool, status: 'completed' }),
            ligne('event_msg', {
              type: 'mcp_tool_call_end',
              call_id: 'm',
              invocation: { server, tool },
            }),
          ),
          RACINE,
          null,
          true,
        ).externe;
      expect(fin('leon', 'thread')).toBe(false);
      expect(fin('leon', 'search')).toBe(true);
      expect(
        extractCodexFacts(
          session(ligne('event_msg', { type: 'mcp_tool_call_end', call_id: 'm' })),
          RACINE,
          null,
          true,
        ).externe,
      ).toBe(true);
    });

    it('une commande refusée n’a pas tourné : ni externe, ni commande', () => {
      const faits = extractCodexFacts(
        session(commande('curl https://example.com', { status: 'declined', exit_code: null })),
        RACINE,
      );
      expect(faits).toMatchObject({ externe: false, commandes: [], erreurs: 0 });
    });
  });

  it('une écriture sur l’entrée d’une commande lancée ne compte pas une seconde fois', () => {
    const faits = extractCodexFacts(
      session(commande('pnpm dev'), commande('pnpm dev', { source: 'unified_exec_interaction' })),
      RACINE,
    );
    expect(faits.commandes).toEqual([{ texte: 'pnpm dev', erreur: false }]);
  });

  it('un fichier hors du dépôt ou un changement en échec ne compte pas ; un déplacement garde les deux chemins', () => {
    const faits = extractCodexFacts(
      session(
        element({
          type: 'FileChange',
          id: 'p1',
          changes: {
            '/tmp/ailleurs.txt': { type: 'add', content: '' },
            [`${RACINE}/a.ts`]: { type: 'update', unified_diff: '', move_path: `${RACINE}/b.ts` },
          },
          status: 'completed',
        }),
        element({
          type: 'FileChange',
          id: 'p2',
          changes: { [`${RACINE}/c.ts`]: { type: 'add', content: '' } },
          status: 'failed',
        }),
      ),
      RACINE,
    );
    expect(faits).toMatchObject({ fichiers: ['a.ts', 'b.ts'], erreurs: 1 });
  });

  it('masque un secret dans une commande et ne garde que l’exécutable', () => {
    const faits = extractCodexFacts(session(commande('PGPASSWORD=s3cret psql -h db')), RACINE);
    expect(faits.commandes).toEqual([{ texte: 'psql', erreur: false }]);
  });

  describe('à l’ancien format (repli sur le texte des appels)', () => {
    const ancien = (...lignes: unknown[]) =>
      [
        JSON.stringify({
          timestamp: '2026-01-02T09:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'ancien', cwd: RACINE, source: 'cli', git: { branch: 'main' } },
        }),
        ...lignes.map((payload, index) =>
          JSON.stringify({
            timestamp: `2026-01-02T09:00:${String(index + 1).padStart(2, '0')}.000Z`,
            type: 'response_item',
            payload,
          }),
        ),
      ].join('\n');

    it('lit les commandes de shell, leur code de sortie, et les fichiers d’apply_patch', () => {
      const faits = extractCodexFacts(
        ancien(
          {
            type: 'function_call',
            name: 'shell',
            arguments: JSON.stringify({ command: ['bash', '-lc', 'git status'] }),
            call_id: 'c1',
          },
          {
            type: 'function_call_output',
            call_id: 'c1',
            output: JSON.stringify({ output: 'ok', metadata: { exit_code: 0 } }),
          },
          {
            type: 'function_call',
            name: 'shell_command',
            arguments: JSON.stringify({ command: 'pnpm test' }),
            call_id: 'c2',
          },
          { type: 'function_call_output', call_id: 'c2', output: 'Exit code: 1\nOutput:\nFAIL' },
          {
            type: 'custom_tool_call',
            name: 'apply_patch',
            call_id: 'c3',
            input: '*** Begin Patch\n*** Update File: src/x.ts\n@@\n*** End Patch',
          },
          { type: 'custom_tool_call_output', call_id: 'c3', output: 'Success.' },
        ),
        RACINE,
      );

      expect(faits).toMatchObject({
        branche: 'main',
        commandes: [
          { texte: 'git status', erreur: false },
          { texte: 'pnpm test', erreur: true },
        ],
        fichiers: ['src/x.ts'],
        erreurs: 1,
        externe: false,
      });
    });

    it('un outil MCP (avec espace de noms) ou inconnu rend la session externe', () => {
      const appel = (name: string, extra = {}) =>
        extractCodexFacts(
          ancien({ type: 'function_call', name, arguments: '{}', call_id: 'x', ...extra }),
          RACINE,
        ).externe;
      expect(appel('fil', { namespace: 'mcp__leon__' })).toBe(true);
      // shortcut de codex.ts : à l'ancien format, même un outil local de Leon reconnu compte.
      expect(
        extractCodexFacts(
          ancien({
            type: 'function_call',
            name: 'thread',
            namespace: 'mcp__leon__',
            arguments: '{}',
            call_id: 'x',
          }),
          RACINE,
          null,
          true,
        ).externe,
      ).toBe(true);
      expect(appel('outil_inconnu')).toBe(true);
      expect(appel('update_plan')).toBe(false);
    });
  });
});

// --- La forme de codex-cli 0.159.0 (annexe 09) ----------------------------------------------------------------------

// Le lancement d'un sous-agent, dans la forme relevée : l'appel spawn_agent, puis son élément SubAgentActivity.
const lance = (thread: string, consigne = 'Cherche.') => [
  ligne('response_item', {
    type: 'function_call',
    name: 'spawn_agent',
    namespace: 'collaboration',
    call_id: `call-${thread}`,
    arguments: JSON.stringify({ task_name: 'tache', message: consigne, fork_turns: 'none' }),
  }),
  element({
    type: 'SubAgentActivity',
    id: `a-${thread}`,
    kind: 'started',
    agent_path: '/root/tache',
    agent_thread_id: thread,
  }),
];
const tache = (type: 'task_started' | 'task_complete', extra: Record<string, unknown> = {}) =>
  ligne('event_msg', { type, turn_id: 't', ...extra });
// Le fichier inventé d'un sous-agent : son session_meta, l'historique recopié de sa mère (son session_meta, puis
// `recopie`), numéroté dès 0, puis ses lignes propres, renumérotées à la suite, entre task_started et task_complete.
function sousAgent(thread: string, propres: string[], recopie: string[] = []): string {
  const avant = [meta(), ...recopie];
  const apres = [
    tache('task_started'),
    ...propres,
    tache('task_complete', { last_agent_message: 'Fini.' }),
  ];
  const numerote = (lignes: string[], depuis: number) =>
    lignes.map((raw, index) => JSON.stringify({ ...JSON.parse(raw), ordinal: depuis + index }));
  const propre = {
    id: thread,
    cwd: RACINE,
    source: { subagent: { thread_spawn: { parent_thread_id: THREAD, depth: 1 } } },
    thread_source: 'subagent',
    parent_thread_id: THREAD,
    history_mode: 'paginated',
    subagent_history_start_ordinal: avant.length,
  };
  return [
    JSON.stringify({
      timestamp: '2026-11-06T09:00:00.000Z',
      type: 'session_meta',
      payload: propre,
    }),
    ...numerote(avant, 0),
    ...numerote(apres, avant.length),
  ].join('\n');
}
const sousAgents = (fichiers: Record<string, string>): CodexSubagents =>
  new Map(Object.entries(fichiers));
const coupe = (contenu: string) => contenu.trimEnd().split('\n').slice(0, -1).join('\n');
const illisible = (contenu: string) => contenu.replace('\n', '\n{pas du JSON\n');
const nonPagine = (contenu: string) =>
  contenu.replace('"history_mode":"paginated"', '"history_mode":"legacy"');
const at = (heure: string) => `2026-11-13T${heure}Z`;
const TS1 = '2026-11-06T09:00:01.000Z';
const FAUX_SECRET = `ghp_${'a'.repeat(36)}`;

describe('Codex 0.159.0 (annexe 09)', () => {
  beforeEach(() => {
    ordinal = 1;
  });

  it('le rapport d’un sous-agent (agent_message) devient un tour injecté : ni échange ni titre', () => {
    const lue = parseCodexSession(SESSION);
    const demande = "Lance deux sous-agents : l'un lit a.txt, l'autre cherche une page sur le web.";

    expect(lue?.turns.map((t) => [t.external_id, t.role, t.text, t.injecte])).toEqual([
      ['o6@2026-11-13T10:56:01.000Z', 'user', demande, false],
      ['o11@2026-11-13T10:56:04.100Z', 'assistant', 'Je lance les deux sous-agents.', undefined],
      ['o24@2026-11-13T10:56:20.400Z', 'user', 'a.txt contient « bonjour ».', true],
      ['o30@2026-11-13T10:56:30.400Z', 'user', 'La page affiche « Exemple ».', true],
      [
        'o32@2026-11-13T10:56:31.100Z',
        'assistant',
        'a.txt contient « bonjour », et la page affiche « Exemple ».',
        undefined,
      ],
      [
        'o36@2026-11-13T10:57:01.000Z',
        'user',
        'Liste un fichier absent, puis lance les tests.',
        false,
      ],
      [
        'o45@2026-11-13T10:57:10.100Z',
        'assistant',
        "ls n'a pas trouvé absent.txt ; les tests passent.",
        undefined,
      ],
    ]);
    expect(lue?.title).toBe(demande);
    expect(extractCodexFacts(SESSION, ESSAI).echanges).toBe(2);
  });

  it('le fichier d’un sous-agent n’est pas une session', () => {
    expect(parseCodexSession(LECTEUR)).toBeNull();
    expect(parseCodexSession(CHERCHEUR)).toBeNull();
  });

  it('les fils des sous-agents : ceux des éléments SubAgentActivity démarrés, sur les lignes propres seulement', () => {
    expect(codexSubagentThreads(SESSION)).toEqual([L, W]);
    expect(codexSubagentThreads(LECTEUR)).toEqual([]);
    expect(codexSubagentThreads(sousAgent(L, lance(G), lance(W)))).toEqual([G]);
    expect(codexSubagentThreads(nonPagine(SESSION))).toEqual([]);
  });

  describe('le sous-agent (T63)', () => {
    const externe = (contenu: string, sa?: CodexSubagents, leonMcp = false) =>
      extractCodexFacts(contenu, RACINE, null, leonMcp, sa).externe;
    const LIT = sousAgent(L, [
      commande('cat a.txt'),
      commande('pnpm test'),
      element({ type: 'FileChange', id: 'p', changes: {}, status: 'completed' }),
    ]);

    it('la fixture : le sous-agent du web la rend externe ; deux sous-agents qui lisent le dépôt, non', () => {
      expect(extractCodexFacts(SESSION, ESSAI, null, false, FIXTURE)).toMatchObject({
        commandes: [
          { texte: 'ls', erreur: true },
          { texte: 'pnpm test', erreur: false },
        ],
        erreurs: 1,
        externe: true,
        echanges: 2,
      });
      expect(
        extractCodexFacts(SESSION, ESSAI, null, false, sousAgents({ [L]: LECTEUR, [W]: LECTEUR }))
          .externe,
      ).toBe(false);
    });

    it('SubAgentActivity et CollabAgentToolCall ne la rendent plus externe à eux seuls', () => {
      const contenu = session(
        ...lance(L),
        element({ type: 'SubAgentActivity', id: 'f', kind: 'completed', agent_thread_id: L }),
        element({ type: 'CollabAgentToolCall', id: 'w', tool: 'wait', status: 'completed' }),
      );
      expect(externe(contenu, sousAgents({ [L]: LIT }))).toBe(false);
    });

    it('sans le chargeur, ou un appel spawn_agent sans son élément SubAgentActivity : externe', () => {
      expect(externe(session(...lance(L)))).toBe(true);
      const [appel = ''] = lance(W);
      expect(externe(session(...lance(L), appel), sousAgents({ [L]: LIT }))).toBe(true);
    });

    it.each([
      ['dont le fichier ne se retrouve pas', undefined],
      ['dont une ligne est illisible', illisible(LIT)],
      ['dont la première ligne session_meta ne dit pas la forme paginée', nonPagine(LIT)],
      [
        'sans subagent_history_start_ordinal',
        LIT.replace('"subagent_history_start_ordinal"', '"autre"'),
      ],
      ['qui n’a pas fini', coupe(LIT)],
      [
        'dont le dernier task_started n’est suivi d’aucun task_complete',
        `${LIT}\n${JSON.stringify({ timestamp: TS1, ordinal: 99, type: 'event_msg', payload: { type: 'task_started' } })}`,
      ],
    ])('un sous-agent %s : externe', (_cas, contenu) => {
      const fichiers: Record<string, string> = contenu === undefined ? {} : { [L]: contenu };
      expect(externe(session(...lance(L)), sousAgents(fichiers))).toBe(true);
    });

    it('un élément propre du sous-agent externe par la règle de la session la rend externe', () => {
      for (const propre of [
        element({ type: 'Extension', id: 'e', kind: 'web.search' }),
        element({ type: 'WebSearch', id: 'w', query: 'q' }),
        commande('curl -s https://exemple.test'),
        element({ type: 'McpToolCall', id: 'm', server: 'linear', tool: 'get_issue' }),
        ligne('response_item', { type: 'web_search_call', status: 'completed' }),
        element({ type: 'TypeInconnu', id: 'i' }),
      ]) {
        expect(
          externe(session(...lance(L)), sousAgents({ [L]: sousAgent(L, [propre]) })),
          propre,
        ).toBe(true);
      }
    });

    it('l’historique recopié d’un sous-agent n’est pas lu', () => {
      const recopie = [
        commande('curl -s https://exemple.test'),
        element({ type: 'WebSearch', id: 'w' }),
      ];
      const petit = sousAgent(L, [commande('cat a.txt')], recopie);

      expect(externe(session(...lance(L)), sousAgents({ [L]: petit }))).toBe(false);
    });

    it('un sous-agent de sous-agent suit la même règle ; un fil déjà visité n’est pas revisité', () => {
      const relais = sousAgent(L, lance(G));
      const avec = (petit?: string) =>
        externe(
          session(...lance(L)),
          sousAgents({ [L]: relais, ...(petit === undefined ? {} : { [G]: petit }) }),
        );

      expect(avec(sousAgent(G, [commande('cat b.txt')]))).toBe(false);
      expect(avec(sousAgent(G, [element({ type: 'WebSearch', id: 'w' })]))).toBe(true);
      expect(avec()).toBe(true);
      // Un sous-agent qui relance la session, ou lui-même : rien de plus à juger.
      const boucle = sousAgent(L, [...lance(THREAD), ...lance(L)]);
      expect(externe(session(...lance(L)), sousAgents({ [L]: boucle }))).toBe(false);
    });

    it('un sous-agent qui lit Leon ne la rend pas externe (D36) ; un outil MCP de Leon non reconnu, si', () => {
      const avec = (propre: string, leonMcp: boolean) =>
        externe(session(...lance(L)), sousAgents({ [L]: sousAgent(L, [propre]) }), leonMcp);
      const fil = element({
        type: 'McpToolCall',
        id: 'm',
        server: 'leon',
        tool: 'thread',
        status: 'completed',
      });

      expect(avec(commande('~/.leon/bin/leon thread'), false)).toBe(false);
      expect(avec(fil, true)).toBe(false);
      expect(avec(fil, false)).toBe(true);
    });

    it('hors forme paginée, un appel spawn_agent reste externe', () => {
      const ancienne = [
        JSON.stringify({
          timestamp: '2026-01-02T09:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'ancien', cwd: RACINE, source: 'cli' },
        }),
        JSON.stringify({
          timestamp: '2026-01-02T09:00:01.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'spawn_agent',
            namespace: 'collaboration',
            arguments: '{}',
            call_id: 'x',
          },
        }),
      ].join('\n');
      expect(
        extractCodexFacts(ancienne, RACINE, null, false, sousAgents({ [L]: LIT })).externe,
      ).toBe(true);
    });
  });
});

describe('extractCodexBackstage', () => {
  beforeEach(() => {
    ordinal = 1;
  });
  const extraire = (lignes: string[], sa: CodexSubagents = new Map()) =>
    extractCodexBackstage(session(...lignes), RACINE, sa);
  const appel = (id: string, ts: string, outil: string, statut: string, cible?: string) => ({
    role: 'appel_outil',
    id,
    ts,
    outil,
    ...(cible === undefined ? {} : { cible }),
    statut,
  });

  it('relève la fixture dans l’ordre du temps : le raisonnement, les sous-agents et leurs appels', () => {
    expect(extractCodexBackstage(SESSION, ESSAI, FIXTURE)).toEqual([
      {
        role: 'sous_agent',
        id: '12:consigne',
        ts: at('10:56:05.000'),
        partie: 'consigne',
        texte: 'Lis a.txt et rends son contenu.',
      },
      appel('14', at('10:56:05.200'), 'spawn_agent', 'ok'),
      {
        role: 'sous_agent',
        id: '16:consigne',
        ts: at('10:56:06.000'),
        partie: 'consigne',
        texte: "Cherche la page d'exemple sur le web et dis ce qu'elle affiche.",
      },
      appel('17', at('10:56:06.200'), 'spawn_agent', 'ok'),
      appel(`${L}:19`, at('10:56:11.000'), 'Bash', 'ok', 'cat'),
      appel(`${W}:20`, at('10:56:12.000'), 'Extension', 'ok'),
      {
        role: 'sous_agent',
        id: `${L}:rapport`,
        ts: at('10:56:19.500'),
        partie: 'rapport',
        texte: 'a.txt contient « bonjour ».',
      },
      appel('21', at('10:56:20.100'), 'CollabAgentToolCall', 'ok'),
      {
        role: 'sous_agent',
        id: `${W}:rapport`,
        ts: at('10:56:29.500'),
        partie: 'rapport',
        texte: 'La page affiche « Exemple ».',
      },
      appel('27', at('10:56:30.100'), 'CollabAgentToolCall', 'ok'),
      {
        role: 'raisonnement',
        id: '39',
        ts: at('10:57:03.000'),
        texte: 'Deux commandes à la suite : un ls qui échouera, puis les tests.',
      },
      appel('41', at('10:57:05.000'), 'Bash', 'erreur', 'ls'),
      appel('42', at('10:57:09.000'), 'Bash', 'ok', 'pnpm test'),
    ]);
  });

  it('sans les fichiers des sous-agents, la consigne part seule, sans leurs appels ni leur rapport', () => {
    expect(extractCodexBackstage(SESSION, ESSAI, new Map()).map(({ id }) => id)).toEqual([
      '12:consigne',
      '14',
      '16:consigne',
      '17',
      '21',
      '27',
      '39',
      '41',
      '42',
    ]);
  });

  it.each([
    ['qui n’a pas fini', coupe(LECTEUR)],
    ['dont une ligne est illisible', illisible(LECTEUR)],
    ['hors de la forme paginée', nonPagine(LECTEUR)],
  ])('un sous-agent %s : la consigne sans rapport, et aucun de ses appels', (_cas, contenu) => {
    const ids = extractCodexBackstage(SESSION, ESSAI, new Map([[L, contenu]])).map(({ id }) => id);

    expect(ids).toContain('12:consigne');
    expect(ids.filter((id) => id.startsWith(L))).toEqual([]);
  });

  describe('la préparation des textes', () => {
    const pense = (...textes: string[]) =>
      extraire([
        ligne('response_item', {
          type: 'reasoning',
          id: 'r',
          summary: textes.map((text) => ({ type: 'summary_text', text })),
          encrypted_content: 'gAAAAB',
        }),
      ]);

    it('masque un faux secret, retire un bloc de Leon, et joint les textes du résumé', () => {
      expect(
        pense(`<contexte-leon>Le sommaire.</contexte-leon>Je garde ${FAUX_SECRET}.`, 'Puis.'),
      ).toEqual([
        { role: 'raisonnement', id: '1', ts: TS1, texte: `Je garde ${SECRET_MASK}.\n\nPuis.` },
      ]);
    });

    it('coupe à 20 000 caractères', () => {
      const [bloc] = pense('x'.repeat(30_000));

      expect(bloc?.role === 'raisonnement' && bloc.texte.length).toBe(TURN_TEXT_MAX);
    });

    it.each([
      ['vide', []],
      ['blanc', ['  \n']],
      ['un bloc de Leon seul', ['<contexte-leon>Le sommaire.</contexte-leon>']],
    ])('un raisonnement %s n’est pas relevé', (_cas, textes) => {
      expect(pense(...textes)).toEqual([]);
    });

    it('le raisonnement d’un sous-agent ne part pas', () => {
      const blocs = extractCodexBackstage(SESSION, ESSAI, FIXTURE);

      expect(blocs.filter((bloc) => bloc.role === 'raisonnement').map(({ id }) => id)).toEqual([
        '39',
      ]);
    });

    it('prépare aussi la consigne et le rapport d’un sous-agent', () => {
      const lancement = lance(L, `Cherche ${FAUX_SECRET}.`);
      const petit = sousAgent(L, [commande('cat a.txt')]).replace(
        '"last_agent_message":"Fini."',
        `"last_agent_message":"<rappel-leon>Rappel.</rappel-leon>Trouvé ${FAUX_SECRET}."`,
      );
      const blocs = extraire(lancement, sousAgents({ [L]: petit }));

      expect(blocs.filter((bloc) => bloc.role === 'sous_agent')).toMatchObject([
        { id: '1:consigne', texte: `Cherche ${SECRET_MASK}.` },
        { id: `${L}:rapport`, texte: `Trouvé ${SECRET_MASK}.` },
      ]);
    });
  });

  describe('les appels d’outils', () => {
    it.each([
      ['curl -u a:X https://exemple.test', 'curl'],
      ['PGPASSWORD=X psql -h base', 'psql'],
    ])('une commande « %s » donne Bash, réduite à %s', (script, cible) => {
      expect(extraire([commande(script)])).toEqual([appel('1', TS1, 'Bash', 'ok', cible)]);
    });

    it('un changement de fichiers donne Edit, un bloc par fichier, avec le chemin dans le dépôt', () => {
      const change = element({
        type: 'FileChange',
        id: 'p',
        changes: {
          [`${RACINE}/src/a.ts`]: { type: 'update' },
          [`${RACINE}/src/b.ts`]: { type: 'add' },
        },
        status: 'completed',
      });

      expect(extraire([change])).toEqual([
        appel('1:0', TS1, 'Edit', 'ok', 'src/a.ts'),
        appel('1:1', TS1, 'Edit', 'ok', 'src/b.ts'),
      ]);
    });

    it.each([
      ['hors du dépôt', '/Users/demo/ailleurs/x.ts'],
      ['en ~/…', '~/.aws/credentials'],
      ['en $HOME/…', '$HOME/.ssh/id'],
    ])('un fichier changé %s : sans cible', (_cas, path) => {
      const change = element({
        type: 'FileChange',
        id: 'p',
        changes: { [path]: {} },
        status: 'completed',
      });

      expect(extraire([change])).toEqual([appel('1:0', TS1, 'Edit', 'ok')]);
    });

    it.each([
      [
        'un appel MCP, jamais le nom de l’outil',
        { type: 'McpToolCall', id: 'm', server: 'linear', tool: 'get_issue', status: 'completed' },
        'mcp:linear',
      ],
      [
        'un appel MCP d’un serveur hors forme',
        { type: 'McpToolCall', id: 'm', server: 'a b' },
        '[outil]',
      ],
      [
        'la recherche web, jamais sa requête',
        { type: 'WebSearch', id: 'w', query: 'requête', action: { url: 'https://x.test' } },
        'WebSearch',
      ],
      [
        'une extension, jamais son URL',
        { type: 'Extension', id: 'e', kind: 'web.search', action: { url: 'https://x.test' } },
        'Extension',
      ],
      ['ImageView', { type: 'ImageView', id: 'v', path: `${RACINE}/a.png` }, 'ImageView'],
      ['ImageGeneration', { type: 'ImageGeneration', id: 'g', prompt: 'p' }, 'ImageGeneration'],
      ['DynamicToolCall', { type: 'DynamicToolCall', id: 'd', tool: 'x' }, 'DynamicToolCall'],
      [
        'l’attente d’un sous-agent',
        { type: 'CollabAgentToolCall', id: 'c', tool: 'wait', status: 'completed' },
        'CollabAgentToolCall',
      ],
      [
        'un outil local de Codex',
        { type: 'FunctionCallOutput', id: 'f', name: 'update_plan' },
        'update_plan',
      ],
      ['un autre outil', { type: 'FunctionCallOutput', id: 'f', name: 'tool_search' }, '[outil]'],
      ['un type inconnu', { type: 'TypeInconnu', id: 'i', path: `${RACINE}/a.ts` }, '[outil]'],
    ])('%s : sans cible', (_cas, item, outil) => {
      expect(extraire([element(item)])).toEqual([appel('1', TS1, outil, 'ok')]);
    });

    it('un élément qui n’est pas un appel n’en fait pas, ni une écriture sur une commande lancée', () => {
      const types = [
        'UserMessage',
        'AgentMessage',
        'Reasoning',
        'Plan',
        'HookPrompt',
        'ContextCompaction',
        'EnteredReviewMode',
        'ExitedReviewMode',
      ];

      expect(
        extraire([
          ...types.map((type) => element({ type, id: 'x' })),
          element({ type: 'SubAgentActivity', id: 's', kind: 'completed', agent_thread_id: L }),
          commande('pnpm dev', { source: 'unified_exec_interaction' }),
        ]),
      ).toEqual([]);
    });

    it('les statuts : ok ; erreur pour un échec, un code de sortie non nul ou un refus', () => {
      const blocs = extraire([
        commande('pnpm test'),
        commande('pnpm lint', { status: 'failed', exit_code: 1 }),
        commande('pnpm build', { exit_code: 2 }),
        commande('rm -rf build', { status: 'declined', exit_code: null }),
        element({ type: 'McpToolCall', id: 'm', server: 's', tool: 't', status: 'failed' }),
      ]);

      expect(blocs.map((bloc) => bloc.role === 'appel_outil' && [bloc.id, bloc.statut])).toEqual([
        ['1', 'ok'],
        ['2', 'erreur'],
        ['3', 'erreur'],
        ['4', 'erreur'],
        ['5', 'erreur'],
      ]);
    });

    it('un appel d’un sous-agent, et d’un sous-agent de sous-agent, est relevé dans la même forme', () => {
      const lancement = lance(L);
      const relais = sousAgent(L, [commande('git status'), ...lance(G, 'Va plus loin.')]);
      const petit = sousAgent(G, [
        element({
          type: 'FileChange',
          id: 'p',
          changes: { [`${RACINE}/b.ts`]: {} },
          status: 'completed',
        }),
      ]);
      const blocs = extraire(lancement, sousAgents({ [L]: relais, [G]: petit }));

      expect(
        blocs.flatMap((bloc) =>
          bloc.role === 'appel_outil' ? [[bloc.id, bloc.outil, bloc.cible]] : [],
        ),
      ).toEqual([
        ['2', 'spawn_agent', undefined],
        [`${L}:2`, 'Bash', 'git status'],
        [`${L}:4`, 'spawn_agent', undefined],
        [`${G}:2:0`, 'Edit', 'b.ts'],
      ]);
      expect(blocs.flatMap((bloc) => (bloc.role === 'sous_agent' ? [bloc.id] : []))).toEqual([
        '1:consigne',
        `${L}:3:consigne`,
        `${L}:rapport`,
        `${G}:rapport`,
      ]);
    });
  });

  it('une chaîne témoin dans la sortie d’une commande, l’argument d’un autre outil et un argument de spawn_agent autre que message n’apparaît nulle part', () => {
    const TEMOIN = 'temoin-4b7e2d';
    const lancement = [
      ligne('response_item', {
        type: 'function_call',
        name: 'spawn_agent',
        namespace: 'collaboration',
        call_id: TEMOIN,
        arguments: JSON.stringify({ message: 'Cherche.', task_name: TEMOIN, fork_turns: TEMOIN }),
      }),
      element({
        type: 'SubAgentActivity',
        id: TEMOIN,
        kind: 'started',
        agent_path: `/root/${TEMOIN}`,
        agent_thread_id: L,
      }),
      ligne('response_item', {
        type: 'function_call_output',
        call_id: TEMOIN,
        output: JSON.stringify({ task_name: TEMOIN }),
      }),
    ];
    const sortie = {
      aggregated_output: TEMOIN,
      stdout: TEMOIN,
      stderr: TEMOIN,
      formatted_output: TEMOIN,
      cwd: `/tmp/${TEMOIN}`,
      parsed_cmd: [{ cmd: TEMOIN }],
    };
    const petit = sousAgent(L, [
      ligne('response_item', {
        type: 'agent_message',
        author: '/root',
        recipient: `/root/${TEMOIN}`,
        content: [
          { type: 'input_text', text: TEMOIN },
          { type: 'encrypted_content', encrypted_content: TEMOIN },
        ],
      }),
      ligne('response_item', {
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: TEMOIN }],
        encrypted_content: TEMOIN,
      }),
      ligne('response_item', {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'c',
        input: TEMOIN,
      }),
      commande(`cat ${TEMOIN}.txt`, sortie),
    ]);

    const blocs = extraire(
      [
        ...lancement,
        ligne('response_item', { type: 'reasoning', summary: [], encrypted_content: TEMOIN }),
        element({ type: 'Reasoning', id: 'r', summary_text: [TEMOIN], raw_content: [TEMOIN] }),
        ligne('response_item', {
          type: 'custom_tool_call',
          name: 'exec',
          call_id: 'c',
          input: TEMOIN,
        }),
        commande(`echo ${TEMOIN}`, sortie),
        ligne('response_item', {
          type: 'custom_tool_call_output',
          call_id: 'c',
          output: [{ type: 'input_text', text: TEMOIN }],
        }),
        element({
          type: 'Extension',
          id: TEMOIN,
          kind: TEMOIN,
          action: { type: 'search', url: `https://${TEMOIN}.test` },
          query: TEMOIN,
          results: [TEMOIN],
        }),
        element({ type: 'WebSearch', id: 'w', query: TEMOIN }),
        element({
          type: 'McpToolCall',
          id: 'm',
          server: 'linear',
          tool: TEMOIN,
          arguments: TEMOIN,
        }),
        element({
          type: 'FileChange',
          id: 'p',
          changes: { [`~/${TEMOIN}`]: { type: 'add', content: TEMOIN } },
          status: 'completed',
        }),
        element({ type: 'DynamicToolCall', id: 'd', tool: TEMOIN, arguments: TEMOIN }),
        element({
          type: 'CollabAgentToolCall',
          id: 'c',
          tool: 'wait',
          agents_states: { x: TEMOIN },
        }),
        element({ type: 'FunctionCallOutput', id: 'f', name: TEMOIN }),
        element({ type: TEMOIN, id: 'i' }),
        element({ type: 'AgentMessage', id: 'a', content: [{ text: TEMOIN }] }),
        // Un outil MCP du même nom : sa consigne ne part pas.
        ligne('response_item', {
          type: 'function_call',
          name: 'spawn_agent',
          namespace: 'mcp__autre__',
          call_id: 'm',
          arguments: JSON.stringify({ message: TEMOIN }),
        }),
        ligne('response_item', {
          type: 'agent_message',
          author: `/root/${TEMOIN}`,
          recipient: '/root',
          content: [{ type: 'input_text', text: TEMOIN }],
        }),
        tache('task_complete', { last_agent_message: TEMOIN }),
      ],
      sousAgents({ [L]: petit }),
    );

    expect(blocs).toHaveLength(13);
    expect(JSON.stringify(blocs)).not.toContain(TEMOIN);
  });

  it('tout identifiant tient dans la forme du contrat, et n’y figure qu’une fois ; hors forme paginée, aucun bloc', () => {
    const ids = extractCodexBackstage(SESSION, ESSAI, FIXTURE).map(({ id }) => id);

    expect(ids).toHaveLength(13);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_.:-]{1,200}$/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(extractCodexBackstage(nonPagine(SESSION), ESSAI, FIXTURE)).toEqual([]);
    expect(extractCodexBackstage(nonPagine(fixture('rollout-git')), RACINE, FIXTURE)).toEqual([]);
  });

  it('ne relève que les lignes propres à la session : pas un préfixe hérité ; une ligne relue une fois', () => {
    ordinal = 3;
    const herite = commande('pnpm lint');
    ordinal = 5;
    const propre = commande('pnpm test');
    const contenu = [
      meta({ history_base: { thread_id: 'avant', end_ordinal_exclusive: 5 } }),
      herite,
      propre,
      propre,
    ].join('\n');

    expect(extractCodexBackstage(contenu, RACINE, new Map())).toEqual([
      appel('5', '2026-11-06T09:00:05.000Z', 'Bash', 'ok', 'pnpm test'),
    ]);
  });

  it('un bloc hors du contrat (un fil de sous-agent hors forme) est écarté, les autres partent', () => {
    const ids = extraire(
      lance('a b'),
      sousAgents({ 'a b': sousAgent('a b', [commande('ls')]) }),
    ).map(({ id }) => id);

    expect(ids).toEqual(['1:consigne', '2']);
  });
});
