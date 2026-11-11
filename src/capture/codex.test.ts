import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractCodexFacts, parseCodexSession } from './codex';
import { SessionFactsSchema } from './session-facts';

// Fixtures inventées, sur la structure d'un rollout de Codex 0.167 (historique paginé), jamais une vraie conversation.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/codex/${name}.jsonl`, import.meta.url), 'utf8');

const RACINE = '/Users/demo/projets/leon';
const THREAD = '019a5e10-0000-7000-8000-000000000001';

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
const ligne = (type: string, payload: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    timestamp: `2026-11-06T09:00:${String(ordinal).padStart(2, '0')}.000Z`,
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
      expect(externe(element({ type: 'CollabAgentToolCall', id: 'a', tool: 'spawn_agent' }))).toBe(
        true,
      );
      expect(externe(element({ type: 'SubAgentActivity', id: 's', kind: 'started' }))).toBe(true);
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
          commande('~/.leon/bin/leon fil'),
          commande('leon chercher "route des faits"'),
          element({ type: 'FileChange', id: 'p', changes: {}, status: 'completed' }),
          element({ type: 'FunctionCallOutput', id: 'f', name: 'update_plan' }),
          element({ type: 'Reasoning', id: 'r' }),
          element({ type: 'UserMessage', id: 'u', content: [] }),
          element({ type: 'AgentMessage', id: 'a', content: [] }),
        ),
      ).toBe(false);
    });

    // shortcut: tout appel MCP compte, même vers Leon, jusqu'à T44 (lot 12).
    it('un outil du serveur MCP de Leon compte encore, tant que T44 ne sait pas le reconnaître', () => {
      expect(externe(element({ type: 'McpToolCall', id: 'm', server: 'leon', tool: 'fil' }))).toBe(
        true,
      );
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
      expect(appel('outil_inconnu')).toBe(true);
      expect(appel('update_plan')).toBe(false);
    });
  });
});
