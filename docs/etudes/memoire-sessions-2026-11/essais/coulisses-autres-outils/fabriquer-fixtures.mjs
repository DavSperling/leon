#!/usr/bin/env node
// Fabrique les fixtures inventées des trois témoins, sous `fixtures/` à côté de ce fichier. Tout y est inventé, dans la
// forme des annexes 03 à 05 et des lecteurs de Leon (codex.ts, cursor.ts, antigravity.ts) ; ce qu'aucun d'eux ne dit
// (la forme d'un sous-agent, d'un refus, d'une sortie d'outil chez Cursor) est une supposition, faite pour exercer le
// témoin. La chaîne TEMOIN est placée dans un texte, une commande, un argument et une sortie d'outil de chaque fixture,
// dans un raisonnement, dans une session hors garde, et dans des fichiers que les témoins ne doivent pas lire.
//
//   node fabriquer-fixtures.mjs
//
// Il réécrit les fichiers à chaque passage, sans rien effacer.
import { mkdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TEMOIN = 'PISTACHE-TEMOIN-7731';
const CONSIGNE_1 = `Lis seulement le fichier a.txt de ce dossier, puis réponds en une phrase. ${TEMOIN}`;
const CONSIGNE_2 = 'Va chercher la page web https://example.com et donne son titre.';
const RAPPORT_1 = `Le fichier a.txt dit que le chat de l'essai s'appelle Pistache. ${TEMOIN}`;
const RAPPORT_2 = "La page s'intitule Example Domain.";
const T_ = TEMOIN.replace(/-/g, '_'); // le témoin dans un nom de clé
// Un JSON imbriqué sur n niveaux, écrit à la main (JSON.stringify pourrait tomber).
const profond = (n, feuille) => `${'{"k":'.repeat(n)}${JSON.stringify(feuille)}${'}'.repeat(n)}`;
// Un lien symbolique, refait à chaque passage.
async function lien(cible, rel) {
  await mkdir(dirname(join(F, rel)), { recursive: true });
  await rm(join(F, rel), { force: true });
  await symlink(cible, join(F, rel));
}

async function ecrire(rel, contenu) {
  const chemin = join(F, rel);
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, Array.isArray(contenu) ? `${contenu.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n` : contenu);
  return chemin;
}

// --- Codex : un CODEX_HOME d'essai, un parent, deux enfants, un rollout hors garde ---
async function codex() {
  const essai = '/Users/demo/leon-essai-coulisses-codex';
  const [P, C1, C2, X] = ['a1', 'b1', 'c1', 'd1'].map((x) => `019b2a10-0000-7000-8000-0000000000${x}`);
  const ts = (n) => `2026-11-13T10:00:${String(n).padStart(2, '0')}.000Z`;
  const rollout = (lignes) => lignes.map(([type, payload], ordinal) => ({ timestamp: ts(ordinal), ordinal, type, payload }));
  const meta = (id, extra = {}) => [
    'session_meta',
    {
      id, session_id: id, timestamp: ts(0), cwd: essai, originator: 'codex-tui', cli_version: '0.167.0', source: 'cli',
      thread_source: 'user', model_provider: 'openai', history_mode: 'paginated', git: null,
      creator_user_id: 'utilisateur-invente', base_instructions: { text: 'Instructions inventées.' }, ...extra,
    },
  ];
  const contexte = ['turn_context', { turn_id: 'tour-1', cwd: essai, model: 'modele-demo', approval_policy: 'on-request', summary: 'detailed', effort: 'high' }];
  const message = (role, text, extra = {}) => [
    'response_item',
    { type: 'message', role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }], ...extra },
  ];
  const environnement = message('user', `<environment_context>\n  <cwd>${essai}</cwd>\n</environment_context>`);
  const element = (fil, item) => ['event_msg', { type: 'item_completed', thread_id: fil, turn_id: 'tour-1', item }];
  const appel = (name, args, call_id) => ['response_item', { type: 'function_call', name, arguments: JSON.stringify(args), call_id }];
  const sortie = (call_id, output) => ['response_item', { type: 'function_call_output', call_id, output }];
  const shell = (cmd) => ['/bin/zsh', '-lc', cmd];
  const enfant = { source: { subagent: { thread_spawn: { parent_thread_id: P, depth: 1, agent_role: 'worker' } } }, thread_source: 'subagent' };
  const jour = 'codex/leon-essai-coulisses-codex-home/sessions/2026/11/13';
  const ls = `ls fichier-absent.txt ${TEMOIN}`;
  const nonTrouve = `ls: fichier-absent.txt: No such file or directory ${TEMOIN}`;

  await ecrire(`${jour}/rollout-2026-11-13T10-00-00-${P}.jsonl`, rollout([
    meta(P),
    contexte,
    environnement,
    message('user', `Lance deux sous-agents, puis deux commandes. ${TEMOIN}`),
    element(P, { type: 'UserMessage', id: 'u1', content: [{ type: 'text', text: `Lance deux sous-agents. ${TEMOIN}` }] }),
    ['response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: `Il faut deux sous-agents. ${TEMOIN}` }], content: null, encrypted_content: 'gAAAAB-chiffre-invente' }],
    ['event_msg', { type: 'agent_reasoning', text: `Il faut deux sous-agents. ${TEMOIN}` }],
    appel('spawn_agent', { message: CONSIGNE_1, agent_type: 'worker' }, 'call_s1'),
    element(P, { type: 'CollabAgentToolCall', id: 'call_s1', tool: 'spawn_agent', status: 'completed', sender_thread_id: P, receiver_thread_ids: [C1], prompt: CONSIGNE_1 }),
    sortie('call_s1', JSON.stringify({ agent_id: C1, nickname: `Pistache ${TEMOIN}` })),
    appel('spawn_agent', { message: CONSIGNE_2, agent_type: 'worker' }, 'call_s2'),
    element(P, { type: 'CollabAgentToolCall', id: 'call_s2', tool: 'spawn_agent', status: 'completed', sender_thread_id: P, receiver_thread_ids: [C2], prompt: CONSIGNE_2 }),
    sortie('call_s2', JSON.stringify({ agent_id: C2 })),
    appel('wait', { ids: [C1, C2], timeout_ms: 30000 }, 'call_w1'),
    message('user', `<subagent_notification>${JSON.stringify({ agent_id: C1, status: { completed: RAPPORT_1 } })}</subagent_notification>`),
    message('user', `<subagent_notification>${JSON.stringify({ agent_id: C2, status: { completed: RAPPORT_2 } })}</subagent_notification>`),
    sortie('call_w1', JSON.stringify({ status: { [C1]: { completed: RAPPORT_1 }, [C2]: { completed: RAPPORT_2 } } })),
    appel('exec_command', { cmd: ls, workdir: essai }, 'call_e1'),
    element(P, { type: 'CommandExecution', id: 'call_e1', command: shell(ls), cwd: essai, source: 'agent', status: 'failed', exit_code: 1, aggregated_output: nonTrouve }),
    sortie('call_e1', `Process exited with code 1\nOutput:\n${nonTrouve}`),
    appel('exec_command', { cmd: 'curl -sI https://example.com', sandbox_permissions: 'require_escalated', justification: `Accès réseau ${TEMOIN}` }, 'call_e2'),
    ['event_msg', { type: 'exec_approval_request', call_id: 'call_e2', command: shell('curl -sI https://example.com'), cwd: essai, reason: `Accès réseau ${TEMOIN}` }],
    element(P, { type: 'CommandExecution', id: 'call_e2', command: shell('curl -sI https://example.com'), cwd: essai, source: 'agent', status: 'declined' }),
    sortie('call_e2', 'exec command rejected by user'),
    ['response_item', { type: 'custom_tool_call', status: 'completed', call_id: 'call_p1', name: 'apply_patch', input: `*** Begin Patch\n*** Add File: ${TEMOIN}.txt\n+${TEMOIN}\n*** End Patch\n` }],
    element(P, { type: 'FileChange', id: 'call_p1', changes: { [`${essai}/${TEMOIN}.txt`]: { type: 'add', content: TEMOIN } }, status: 'completed' }),
    ['response_item', { type: 'custom_tool_call_output', call_id: 'call_p1', output: `Success. Updated the following files:\nA ${TEMOIN}.txt\n` }],
    message('assistant', `Les deux sous-agents ont répondu ; ls a échoué, curl a été refusée. ${TEMOIN}`, { phase: 'final_answer' }),
    ['event_msg', { type: 'task_complete', turn_id: 'tour-1', last_agent_message: `Fin. ${TEMOIN}` }],
  ]));

  await ecrire(`${jour}/rollout-2026-11-13T10-00-08-${C1}.jsonl`, rollout([
    meta(C1, enfant),
    contexte,
    environnement,
    message('user', CONSIGNE_1),
    appel('exec_command', { cmd: `cat a.txt # ${TEMOIN}`, workdir: essai }, 'call_c1'),
    element(C1, { type: 'CommandExecution', id: 'call_c1', command: shell(`cat a.txt # ${TEMOIN}`), cwd: essai, source: 'agent', status: 'completed', exit_code: 0, aggregated_output: `Le chat de l'essai s'appelle Pistache. ${TEMOIN}` }),
    sortie('call_c1', `Process exited with code 0\nOutput:\nLe chat de l'essai s'appelle Pistache. ${TEMOIN}`),
    message('assistant', RAPPORT_1, { phase: 'final_answer' }),
    ['event_msg', { type: 'task_complete', turn_id: 'tour-1', last_agent_message: RAPPORT_1 }],
  ]));

  await ecrire(`${jour}/rollout-2026-11-13T10-00-11-${C2}.jsonl`, rollout([
    meta(C2, enfant),
    contexte,
    environnement,
    message('user', CONSIGNE_2),
    ['response_item', { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: `example.com ${TEMOIN}` } }],
    element(C2, { type: 'WebSearch', id: 'ws_1', query: `example.com ${TEMOIN}`, action: { type: 'search' } }),
    message('assistant', RAPPORT_2, { phase: 'final_answer' }),
    ['event_msg', { type: 'task_complete', turn_id: 'tour-1', last_agent_message: RAPPORT_2 }],
  ]));

  // Hors garde : un rollout dont le dossier de travail n'est pas l'essai. Il est lu, compté, jamais rapporté.
  await ecrire(`${jour}/rollout-2026-11-13T11-00-00-${X}.jsonl`, rollout([
    meta(X, { cwd: '/Users/demo/projets/autre' }),
    message('user', `Une vraie session. ${TEMOIN}`),
    appel('exec_command', { cmd: `git push ${TEMOIN}` }, 'call_x1'),
    sortie('call_x1', `Sortie ${TEMOIN}`),
  ]));

  // Des fichiers du CODEX_HOME que le témoin ne lit jamais.
  await ecrire('codex/leon-essai-coulisses-codex-home/history.jsonl', `${JSON.stringify({ session_id: P, text: TEMOIN })}\n`);
  await ecrire('codex/leon-essai-coulisses-codex-home/config.toml', `# ${TEMOIN}\nmodel = "modele-demo"\n`);
  // Un CODEX_HOME sans le jeton : le témoin refuse de le lire.
  await ecrire(`codex/autre-home/sessions/2026/11/13/rollout-2026-11-13T09-00-00-${X}.jsonl`, rollout([meta(X), message('user', TEMOIN)]));

  // Les attaques du 12/11, dans l'essai : des valeurs et des clés sous les arguments, les sorties MCP, les fichiers lus,
  // les clés d'un FileChange, un tableau sous `decision`, un `type` objet et une ligne très imbriquée.
  const [A, X2] = ['e1', 'f1'].map((x) => `019b2a10-0000-7000-8000-0000000000${x}`);
  await ecrire(`${jour}/rollout-2026-11-13T10-00-20-${A}.jsonl`, [
    ...rollout([
      meta(A),
      ['response_item', { type: 'function_call', name: `mcp__crm_${T_}__fiche`, call_id: 'call_m1', arguments: JSON.stringify({ type: 'client', id: `motdepasse-${TEMOIN}`, name: `Dupont-${TEMOIN}`, status: `impaye-${TEMOIN}`, role: `amos@${TEMOIN}.fr`, query: TEMOIN }) }],
      element(A, { type: 'McpToolCall', id: 'call_m1', server: TEMOIN, tool: TEMOIN, status: 'completed', arguments: { type: 'client', id: `A-${TEMOIN}`, filtres: { [`CLE_${T_}`]: 1, kind: `K-${TEMOIN}` } }, result: { content: [{ type: 'text', text: TEMOIN }], structured_content: { [`SORTIE_${T_}`]: { type: `T-${TEMOIN}`, status: `S-${TEMOIN}`, summary: [`R-${TEMOIN}`] } } } }),
      ['event_msg', { type: 'mcp_tool_call_end', call_id: 'call_m2', invocation: { server: 'crm', tool: 'maj', arguments: { id: `I-${TEMOIN}`, source: `S-${TEMOIN}` } }, result: { Ok: { content: [], structuredContent: { model: `M-${TEMOIN}` } } } }],
      ['event_msg', { type: 'exec_command_begin', call_id: 'call_e9', command: shell(`cat ${TEMOIN}.md`), cwd: essai, parsed_cmd: [{ type: 'read', cmd: `cat ${TEMOIN}.md`, name: `${TEMOIN}.md`, path: `${TEMOIN}.md` }] }],
      element(A, { type: 'CommandExecution', id: 'call_e9', command: shell('cat x'), cwd: essai, source: 'agent', status: 'completed', exit_code: 0, aggregated_output: 'x', command_actions: [{ type: 'read', command: 'cat x', name: `${TEMOIN}.env`, path: 'x' }] }),
      element(A, { type: 'FileChange', id: 'call_p9', changes: { [`FICHIER_${T_}`]: { type: 'add', content: 'x' } }, status: 'completed' }),
      ['event_msg', { type: 'exec_approval_response', call_id: 'call_e9', decision: ['git', 'push', `D-${TEMOIN}`] }],
      ['response_item', { type: { toString: 1 }, call_id: 'call_t9' }],
    ]),
    `{"type":"event_msg","payload":{"type":"agent_message","v":${profond(5000, TEMOIN)}}}`,
  ]);
  // Hors garde : le jeton au milieu du dossier de travail d'un vrai projet.
  await ecrire(`${jour}/rollout-2026-11-13T11-00-01-${X2}.jsonl`, rollout([
    meta(X2, { cwd: '/Users/demo/clients/dupont-leon-essai-coulisses-archive' }),
    appel('exec_command', { cmd: TEMOIN, status: `V-${TEMOIN}` }, 'call_v1'),
  ]));
  // Un rollout en lien (compté, jamais suivi), un rollout que verifier.sh rend illisible, un fichier d'extension inconnue.
  await ecrire('codex/cible-rollout.jsonl', rollout([meta('cible'), message('user', TEMOIN)]));
  await lien(join(F, 'codex/cible-rollout.jsonl'), `${jour}/rollout-2026-11-13T10-00-30-lien.jsonl`);
  await ecrire(`${jour}/rollout-2026-11-13T10-00-40-illisible.jsonl`, rollout([meta('illisible'), message('user', TEMOIN)]));
  await ecrire(`codex/leon-essai-coulisses-codex-home/sessions/notes.${TEMOIN}`, TEMOIN);
  // `sessions` en lien vers un autre magasin, et le jeton seulement dans un dossier parent : refusés.
  await ecrire(`codex/vrai-codex/sessions/2026/11/01/rollout-2026-11-01T09-00-00-${X}.jsonl`, rollout([meta(X), message('user', TEMOIN)]));
  await mkdir(join(F, 'codex/leon-essai-coulisses-codex-lien-home'), { recursive: true });
  await lien(join(F, 'codex/vrai-codex/sessions'), 'codex/leon-essai-coulisses-codex-lien-home/sessions');
  await ecrire(`codex/leon-essai-coulisses-parent/codex-home/sessions/2026/11/13/rollout-2026-11-13T09-00-00-${X}.jsonl`, rollout([meta(X), message('user', TEMOIN)]));

  // Le second tour (12/11), dans un CODEX_HOME à part pour ne pas changer les comptes du premier.
  const jour2 = 'codex/leon-essai-coulisses-codex-tour2/sessions/2026/11/13';
  const r2 = (n) => `${jour2}/rollout-2026-11-13T12-00-0${n}-019b2a10-0000-7000-8000-00000000020${n}.jsonl`;
  const ailleurs = '/Users/demo/clients/acme';
  // Du texte sous des clés d'identifiant, avec un préfixe d'appel : jamais affiché, seulement un pseudonyme.
  await ecrire(r2(1), rollout([
    meta(`msg_${TEMOIN}`, { source: { subagent: { thread_spawn: { parent_thread_id: `call_Dupont-${TEMOIN}`, depth: 1 } } } }),
    ['turn_context', { turn_id: `call_${TEMOIN}`, cwd: essai, approval_policy: 'on-request' }],
    ['response_item', { type: 'function_call', name: 'exec_command', call_id: `call_sk-proj-${TEMOIN}`, arguments: '{}' }],
    element('f', { type: 'CollabAgentToolCall', id: `call_${TEMOIN}`, tool: 'wait', status: 'completed', receiver_thread_ids: [`msg_${TEMOIN}`] }),
    ['event_msg', { type: 'exec_command_end', call_id: `fc_${TEMOIN}`, exit_code: 0 }],
    ['event_msg', { type: 'request_user_input', call_id: 'call_q1', questions: [{ id: `call_${TEMOIN}`, question: TEMOIN }] }],
  ]));
  // Hors garde : `..` qui sort de l'essai, un second session_meta ailleurs, un turn_context ailleurs.
  await ecrire(r2(2), rollout([meta('019b2a10-0000-7000-8000-000000000202', { cwd: `${essai}/../clients/dupont` }), message('user', TEMOIN)]));
  await ecrire(r2(3), rollout([meta('019b2a10-0000-7000-8000-000000000203'), ['session_meta', { id: 'x', cwd: ailleurs }], message('user', TEMOIN)]));
  await ecrire(r2(4), rollout([meta('019b2a10-0000-7000-8000-000000000204'), ['turn_context', { cwd: ailleurs }], message('user', TEMOIN)]));
  // Sans en-tête lisible : une ligne avant le session_meta, un fichier vide, un session_meta coupé.
  await ecrire(r2(5), rollout([message('user', TEMOIN), meta('019b2a10-0000-7000-8000-000000000205')]));
  await ecrire(r2(6), '');
  await ecrire(r2(7), `${JSON.stringify(rollout([meta('019b2a10-0000-7000-8000-000000000207')])[0]).slice(0, 60)}\n${JSON.stringify(rollout([message('user', TEMOIN)])[0])}\n`);
  // Des formes réelles de Codex (sous-agents, outils natifs) et une forme inconnue de 14 caractères.
  await ecrire(r2(8), rollout([
    meta('019b2a10-0000-7000-8000-000000000208'),
    ['event_msg', { type: 'collab_agent_spawn_end', call_id: 'call_s1', new_thread_id: C1, prompt: TEMOIN, status: 'pending_init' }],
    ['event_msg', { type: 'collab_waiting_end', call_id: 'call_s2', agent_statuses: { [C1]: { completed: TEMOIN } } }],
    element('f', { type: 'SubAgentActivity', id: 'call_s3', status: 'completed' }),
    ['response_item', { type: 'function_call', name: 'current_time', call_id: 'call_t1', arguments: '{}' }],
    ['response_item', { type: 'function_call', name: 'container.exec', call_id: 'call_t2', arguments: JSON.stringify({ cmd: TEMOIN }) }],
    ['event_msg', { type: 'forme_inventee', text: TEMOIN }],
  ]));

  // Le troisième tour (13/11) : l'UUID du nom du rollout, des éléments de tour qui ne sont pas des appels, des valeurs
  // réelles de `type` (sandbox_policy, contenus), deux clés masquées de même longueur dans un même objet.
  const F3 = '019b2a10-0000-7000-8000-000000000301';
  await ecrire(`codex/leon-essai-coulisses-codex-tour3/sessions/2026/11/13/rollout-2026-11-13T13-00-00-${F3}.jsonl`, rollout([
    meta(F3),
    ['turn_context', { turn_id: 't1', cwd: essai, sandbox_policy: { type: 'workspace-write', writable_roots: [`/Users/demo/${TEMOIN}`] } }],
    element(F3, { type: 'UserMessage', id: 'msg_u1', content: [{ type: 'text', text: TEMOIN }, { type: 'local_image', path: TEMOIN }] }),
    element(F3, { type: 'Reasoning', id: 'rs_r1', summary_text: [TEMOIN] }),
    element(F3, { type: 'AgentMessage', id: 'msg_a1', content: [{ type: 'Text', text: TEMOIN }] }),
    ['response_item', { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'open_page', url: TEMOIN } }],
    ['event_msg', { type: 'agent_message', zz: { [`A_${T_}`]: TEMOIN, [`B_${T_}`]: TEMOIN } }],
  ]));
}

// --- Cursor : le dossier de projet d'un dossier d'essai, une conversation, deux sous-agents ---
async function cursor() {
  const projet = 'cursor/projects/Users-demo-leon-essai-coulisses-cursor';
  const [conv, s1, s2] = ['aaaa', 'bbbb', 'cccc'].map((x) => `${x}1111-2222-4333-8444-555566667777`);
  const user = (text) => ({ role: 'user', message: { content: [{ type: 'text', text }] } });
  const assistant = (...content) => ({ role: 'assistant', message: { content } });
  const requete = (texte) => `<timestamp>Friday, Nov 13, 2026, 10:00 AM (UTC+1)</timestamp>\n<user_query>\n${texte}\n</user_query>`;
  const ls = `ls fichier-absent.txt ${TEMOIN}`;
  await ecrire(`${projet}/agent-transcripts/${conv}/${conv}.jsonl`, [
    user(requete(`Lance deux sous-agents, puis deux commandes. ${TEMOIN}`)),
    assistant(
      { type: 'thinking', thinking: `Il faut deux sous-agents. ${TEMOIN}`, signature: 'signature-inventee' },
      { type: 'text', text: 'Je lance les sous-agents.' },
      { type: 'tool_use', id: 'toolu_t1', name: 'Task', input: { description: `Lire a.txt ${TEMOIN}`, prompt: CONSIGNE_1, subagent_type: 'explore' } },
      { type: 'tool_use', id: 'toolu_t2', name: 'Task', input: { description: 'Page web', prompt: CONSIGNE_2, subagent_type: 'generalPurpose' } },
    ),
    // Supposition : l'annexe 04 ne voit aucune sortie d'outil chez Cursor ; celles-ci servent à éprouver le témoin.
    { role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_t1', content: [{ type: 'text', text: RAPPORT_1 }] }, { type: 'tool_result', tool_use_id: 'toolu_t2', content: RAPPORT_2 }] } },
    user(requete('Perform any necessary follow-up actions in response to the subagent completion above.')),
    assistant({ type: 'tool_use', id: 'toolu_s1', name: 'Shell', input: { command: ls, description: `Lister ${TEMOIN}` } }),
    { role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_s1', is_error: true, content: `ls: fichier-absent.txt: No such file or directory ${TEMOIN}` }] } },
    assistant({ type: 'tool_use', name: 'Shell', input: { command: 'curl -sI https://example.com', description: 'En-têtes' } }),
    assistant({ type: 'text', text: `ls a échoué, curl a été refusée. ${TEMOIN}` }),
    { type: 'turn_ended', status: 'success' },
  ]);
  await ecrire(`${projet}/agent-transcripts/${conv}/subagents/${s1}.jsonl`, [
    user(`<user_query>\n${CONSIGNE_1}\n</user_query>`),
    assistant({ type: 'tool_use', id: 'toolu_r1', name: 'Read', input: { path: `/Users/demo/leon-essai-coulisses-cursor/a.txt # ${TEMOIN}` } }),
    { role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_r1', content: `Le chat de l'essai s'appelle Pistache. ${TEMOIN}` }] } },
    assistant({ type: 'text', text: RAPPORT_1 }),
    { type: 'turn_ended', status: 'success' },
  ]);
  await ecrire(`${projet}/agent-transcripts/${conv}/subagents/${s1}.json`, `${JSON.stringify({ toolUseId: 'toolu_t1', description: `Lire ${TEMOIN}` })}\n`);
  await ecrire(`${projet}/agent-transcripts/${conv}/subagents/${s2}.jsonl`, [
    user(CONSIGNE_2),
    assistant({ type: 'tool_use', name: 'WebFetch', input: { url: `https://example.com/?q=${TEMOIN}` } }),
    assistant({ type: 'text', text: RAPPORT_2 }),
    { type: 'turn_ended', status: 'success' },
  ]);
  // Un fichier du dossier de projet que le témoin ne lit jamais (seulement son nom et sa taille).
  await ecrire(`${projet}/terminals/1.txt`, `$ ${ls}\n${TEMOIN}\n`);
  // Un dossier de projet sans le jeton, et un lien qui porte le jeton mais mène à ce dossier : refusés.
  await ecrire('cursor/projects/Users-demo-autre-projet/agent-transcripts/x/x.jsonl', [user(requete(TEMOIN))]);
  await symlink('Users-demo-autre-projet', join(F, 'cursor/projects/lien-leon-essai-coulisses')).catch((e) => {
    if (e.code !== 'EEXIST') throw e;
  });

  // Les attaques du 12/11, dans l'essai : des valeurs de la liste fermée, des noms de clés, des noms de fichiers et des
  // fichiers d'autres extensions, tous parlants.
  await ecrire(`${projet}/agent-transcripts/${conv}/subagents/attaques.jsonl`, [
    user('<user_query>bonjour</user_query>'),
    assistant(
      { type: 'tool_use', id: `motdepasse-${TEMOIN}`, name: `mcp_client-${TEMOIN}_send`, input: { status: `S-${TEMOIN}`, model: `M-${TEMOIN}`, filters: { type: `T-${TEMOIN}`, role: `R-${TEMOIN}` }, subagent_type: `SA-${TEMOIN}`, variables: { [`CLE_${T_}`]: 'v' }, [`--${TEMOIN}`]: true } },
      { type: 'tool_use', id: 'toolu_x', name: 'mcp_crm_lookup', input: { items: [{ type: `E-${TEMOIN}` }], conversation_id: `admin:${TEMOIN}@db.internal` } },
    ),
    { role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: [{ type: `RES-${TEMOIN}` }], name: `amos-${TEMOIN}@client.com` }, { type: 'tool_result', tool_use_id: 'toolu_y', content: { [`RESULTAT_${T_}`]: 1 } }] } },
    { role: `ROLE-${TEMOIN}`, [`thinking_${T_}`]: 'x', message: { content: 'x' } },
    { type: `LIGNE-${TEMOIN}`, status: `ST-${TEMOIN}` },
    assistant({ type: `reasoning-${TEMOIN}`, reasoning: 'x' }),
    { type: 'turn_ended', status: 'success', id: 4155551234 },
  ]);
  await ecrire(`${projet}/agent-transcripts/${conv}/subagents/plan-${TEMOIN}.jsonl`, [user('x')]);
  await ecrire(`${projet}/agent-transcripts/titre-${TEMOIN}.jsonl`, [user('x')]);
  await ecrire(`${projet}/terminals/git-push-${TEMOIN}.txt`, TEMOIN);
  await ecrire(`${projet}/mcps/user-client-${TEMOIN}/tools/send.json`, '{}');
  // Jamais ouverts : un .txt (l'ancien format), un fichier sans extension, et secret.txt que verifier.sh rend illisible.
  await ecrire(`${projet}/agent-transcripts/notes-${TEMOIN}.txt`, [{ type: `TXT-${TEMOIN}`, status: TEMOIN, [`api_key_${T_}`]: 'x' }]);
  await ecrire(`${projet}/agent-transcripts/sans-extension`, [{ type: `NOEXT-${TEMOIN}` }]);
  await ecrire(`${projet}/agent-transcripts/secret.txt`, `${TEMOIN}\n`);
  // Le jeton seulement dans un dossier parent : refusé.
  await ecrire(`cursor/leon-essai-coulisses-parent/Users-demo-vrai-projet/agent-transcripts/${conv}/${conv}.jsonl`, [
    assistant({ type: 'tool_use', id: 'toolu_v', name: `mcp_vraiclient_${TEMOIN}`, input: { command: TEMOIN } }),
  ]);
  // Les pannes : un sous-agent que verifier.sh rend illisible, un bloc imbriqué sur 8000 niveaux.
  const pannes = 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-pannes';
  await ecrire(`${pannes}/agent-transcripts/${conv}/${conv}.jsonl`, [
    user('<user_query>ok</user_query>'),
    `{"role":"assistant","message":{"content":[${profond(8000, { type: 'text', text: TEMOIN })}]}}`,
  ]);
  await ecrire(`${pannes}/agent-transcripts/${conv}/subagents/${s1}.jsonl`, [user(TEMOIN)]);
  // Les formes : la même conversation à plat et imbriquée, un appel en objet et en tool_calls, un sous-agent à plat.
  const formes = 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-formes';
  await ecrire(`${formes}/agent-transcripts/${conv}.jsonl`, [
    user('<user_query>Lance un sous-agent</user_query>'),
    { role: 'assistant', message: { content: { type: 'tool_use', id: 'toolu_a', name: 'Task', input: {} } }, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Task', arguments: '{}' } }] },
  ]);
  await ecrire(`${formes}/agent-transcripts/${conv}/${conv}.jsonl`, [user('<user_query>Autre version</user_query>'), assistant({ type: 'tool_use', id: 'toolu_b', name: 'Task', input: { prompt: 'p' } })]);
  await ecrire(`${formes}/agent-transcripts/${conv}/subagents/${s2}.jsonl`, [user('<user_query>p</user_query>'), assistant({ type: 'text', text: 'r' })]);
  await ecrire(`${formes}/agent-transcripts/dddd1111-2222-4333-8444-555566667777.jsonl`, [user('consigne du sous-agent à plat'), assistant({ type: 'text', text: 'rapport' })]);

  // Le second tour (12/11) : des noms de conversation parlants, une sortie MCP hors de `content`, des appels et un
  // raisonnement sous d'autres formes.
  const tour2 = 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-tour2';
  await ecrire(`${tour2}/agent-transcripts/call_${TEMOIN}/call_${TEMOIN}.jsonl`, [user('<user_query>x</user_query>')]);
  await ecrire(`${tour2}/agent-transcripts/toolu_${TEMOIN}.jsonl`, [user('<user_query>x</user_query>')]);
  await ecrire(`${tour2}/agent-transcripts/${conv}/${conv}.jsonl`, [
    user('<user_query>x</user_query>'),
    assistant({ type: 'tool_use', id: `call_${TEMOIN}-a`, name: 'mcp_crm_lookup', input: { query: 'x' } }),
    { role: 'user', message: { content: [{
      type: 'tool_result', tool_use_id: `call_${TEMOIN}-a`, content: [{ type: 'text', text: 'x' }],
      structuredContent: { id: `tool_${TEMOIN}`, agent_id: '3f2a9c10-7b4e-4d21-9a6c-1e2f3a4b5c6d', status: 'failed', name: 'Read', customers: [{ id: `tool_${TEMOIN}`, conversation_id: `call_${TEMOIN}` }] },
    }] } },
    { role: 'assistant', subagent_id: `toolu_${TEMOIN}`, message: { content: 'x' } },
    assistant({ type: 'text', text: `<think>${TEMOIN}</think>Je lance ls.` }),
    { role: 'assistant', message: { content: [{ type: 'text', text: 'ok' }], metadata: { thinking: TEMOIN } } },
    assistant({ type: 'function', id: 'call_f1', function: { name: 'Shell', arguments: JSON.stringify({ command: TEMOIN }) } }),
    assistant({ type: 'tool_call', id: 'call_f2', name: 'Shell', input: { command: TEMOIN } }),
    { type: 'tool_use', id: 'toolu_l1', name: 'Shell', input: { command: TEMOIN } },
    assistant({ type: 'text', text: 'fini', tool_calls: [{ id: 'call_f3', type: 'function', function: { name: 'Shell', arguments: '{}' } }] }),
    { type: 'turn_ended', status: 'success' },
  ]);
  // agent-transcripts illisible (verifier.sh le ferme), en lien vers un dossier dehors, et un dossier de projet illisible.
  await ecrire(`cursor/projects/Users-demo-leon-essai-coulisses-cursor-illisible/agent-transcripts/${conv}/${conv}.jsonl`, [user(TEMOIN)]);
  await ecrire(`cursor/dehors/agent-transcripts/${conv}/${conv}.jsonl`, [user(TEMOIN)]);
  await mkdir(join(F, 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-lien'), { recursive: true });
  await lien(join(F, 'cursor/dehors/agent-transcripts'), 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-lien/agent-transcripts');
  await ecrire(`cursor/projects/Users-demo-leon-essai-coulisses-cursor-racine/agent-transcripts/${conv}/${conv}.jsonl`, [user(TEMOIN)]);

  // Le troisième tour (13/11) : des clés de raisonnement sous des clés inconnues (une sortie hors de tool_result), et une
  // fiche dont les éléments ont des clés inconnues de même longueur.
  const tour3 = 'cursor/projects/Users-demo-leon-essai-coulisses-cursor-tour3';
  await ecrire(`${tour3}/agent-transcripts/${conv}/${conv}.jsonl`, [
    user('<user_query>x</user_query>'),
    { role: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] }, mcpResponse: { thinking: TEMOIN, reasoning: { text: TEMOIN } } },
    { role: 'tool', message: { content: [{ type: 'text', text: 'x' }] }, toolOutput: { content: [{ type: 'thinking', thinking: TEMOIN, status: 'failed' }] } },
  ]);
  await ecrire(`${tour3}/agent-transcripts/${conv}/subagents/${s1}.jsonl`, [user('<user_query>x</user_query>')]);
  await ecrire(`${tour3}/agent-transcripts/${conv}/subagents/${s1}.json`, JSON.stringify({ items: [{ type: 'text', text: TEMOIN }, { type: 'tool_use', name: 'Read' }] }));
}

// --- Antigravity : un dossier d'essai, un ~/.gemini inventé, un parent, deux sous-agents, deux conversations à écarter ---
async function antigravity() {
  // Le dossier d'essai d'abord : le témoin n'ouvre que les transcripts touchés après sa création.
  const essai = join(F, 'antigravity/leon-essai-coulisses-antigravity');
  await ecrire('antigravity/leon-essai-coulisses-antigravity/a.txt', "Le chat de l'essai s'appelle Pistache.\n");
  await ecrire('antigravity/autre-dossier/a.txt', 'Un dossier sans le jeton.\n');
  const [P, C1, C2, X, V] = ['dddd', 'eeee', 'ffff', '9999', '8888'].map((x) => `${x}1111-2222-4333-8444-555566667777`);
  const brain = 'antigravity/gemini/antigravity/brain';
  const transcript = (id, etapes) =>
    ecrire(`${brain}/${id}/.system_generated/logs/transcript_full.jsonl`, etapes.map((e, i) => (typeof e === 'string' ? e : { step_index: i, created_at: `2026-11-13T10:00:${String(i).padStart(2, '0')}Z`, ...e })));
  const modele = (extra) => ({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: '', ...extra });
  const resultat = (type, extra) => ({ source: 'MODEL', type, status: 'DONE', ...extra });
  const ls = `ls fichier-absent.txt ${TEMOIN}`;
  const [R1, R2, R3, P2, C3, Y, Z] = ['c1c1', 'c2c2', 'c3c3', '5a5a', '5b5b', 'dede', 'dfdf'].map((x) => `${x}1111-2222-4333-8444-555566667777`);
  await transcript(P, [
    // L'historique de l'essai cite une vraie conversation (R1) : elle ne doit pas être retenue pour autant.
    { source: 'SYSTEM', type: 'CONVERSATION_HISTORY', content: `# Conversation History\n## Conversation ${R1}: un titre` },
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${essai} -> leon-essai-coulisses-antigravity\n</user_information>\n<USER_REQUEST>\nLance deux sous-agents, puis deux commandes. ${TEMOIN}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nheure inventée\n</ADDITIONAL_METADATA>` },
    modele({ content: 'Je lance un sous-agent.', thinking: `Il faut deux sous-agents. ${TEMOIN}`, tool_calls: [{ name: 'invoke_subagent', args: { Prompt: CONSIGNE_1, TaskName: `lire-a ${TEMOIN}` } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${C1} finished.\n${RAPPORT_1}` }),
    modele({ tool_calls: [{ name: 'invoke_subagent', args: JSON.stringify({ Prompt: CONSIGNE_2 }) }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent finished.\n${RAPPORT_2}` }),
    modele({ tool_calls: [{ name: 'run_command', args: { Cwd: essai, CommandLine: ls, SafeToAutoRun: true } }] }),
    resultat('RUN_COMMAND', { exit_code: 1, content: `ls: fichier-absent.txt: No such file or directory ${TEMOIN}` }),
    modele({ tool_calls: [{ name: 'run_command', args: { Cwd: essai, CommandLine: 'curl -sI https://example.com', SafeToAutoRun: false } }] }),
    resultat('RUN_COMMAND', { status: 'CANCELED', content: 'Command rejected by user.' }),
    modele({ content: `Les deux sous-agents ont répondu ; ls a échoué, curl a été refusée. ${TEMOIN}` }),
    // Les attaques du 12/11 : des valeurs, des clés et des nombres sous les args d'un outil MCP, une étape aux valeurs
    // inconnues, une clé de raisonnement parlante, et des args imbriqués sur 9000 niveaux.
    modele({
      [`reasoning_about_${T_}`]: 'x',
      tool_calls: [
        { name: `mcp_${TEMOIN}_invoice`, args: { type: `T-${TEMOIN}`, status: `motdepasse-${TEMOIN}`, source: `mailto:amos@${TEMOIN}.com`, tool_call_id: `sk-ant-${TEMOIN}`, exit_code: `E-${TEMOIN}`, [`${T_}_cle`]: 'v', Properties: { [`Acme_${T_}`]: 'v', Card: { type: 4111111111111111, status: `I-${TEMOIN}` } }, Items: [{ type: `EL-${TEMOIN}` }] } },
        { name: 'run_command', args: JSON.stringify({ Cwd: essai, CommandLine: 'echo', type: `J-${TEMOIN}`, [`${T_}_json`]: 1 }) },
      ],
    }),
    { source: `S-${TEMOIN}`, type: `STEP-${TEMOIN}`, status: `ST-${TEMOIN}`, exit_code: `X-${TEMOIN}`, content: 'sortie', [`${T_}_etape`]: true },
    `{"source":"MODEL","type":"PLANNER_RESPONSE","tool_calls":[{"name":"view_file","args":${profond(9000, TEMOIN)}}]}`,
  ]);
  await ecrire(`${brain}/${P}/${T_}_contrat_client.md`, TEMOIN);
  await ecrire(`${brain}/${P}/browser_recording_${TEMOIN}.webp`, TEMOIN);
  // Un .jsonl en lien vers un fichier hors de ~/.gemini : compté, jamais lu.
  await ecrire('antigravity/ailleurs.jsonl', `${JSON.stringify({ type: `LIEN-${TEMOIN}` })}\n`);
  await lien(join(F, 'antigravity/ailleurs.jsonl'), `${brain}/${P}/.system_generated/logs/zz.jsonl`);
  await ecrire(`${brain}/${P}/task.md`, `- [x] ${TEMOIN}\n`);
  await transcript(C1, [
    { source: 'SYSTEM', type: 'CONVERSATION_HISTORY' },
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<subagent_reminder>\nTu es un sous-agent.\n</subagent_reminder>\n<USER_REQUEST>\n${CONSIGNE_1}\n</USER_REQUEST>` },
    modele({ thinking: '', tool_calls: [{ name: 'view_file', args: { AbsolutePath: `${essai}/a.txt` } }] }),
    resultat('VIEW_FILE', { content: `Le chat de l'essai s'appelle Pistache. ${TEMOIN}` }),
    modele({ content: RAPPORT_1 }),
  ]);
  await transcript(C2, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<subagent_reminder>\nParent : ${P}\n</subagent_reminder>\n<USER_REQUEST>\n${CONSIGNE_2}\n</USER_REQUEST>` },
    modele({ tool_calls: [{ name: 'read_url_content', args: { Url: `https://example.com/?q=${TEMOIN}` } }] }),
    resultat('READ_URL_CONTENT', { content: `<title>Example Domain</title> ${TEMOIN}` }),
    modele({ content: RAPPORT_2 }),
  ]);
  // Touchée pendant l'essai, mais dans un autre dossier : lue, comptée, jamais rapportée.
  await transcript(X, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n/Users/demo/projets/autre -> autre\n</user_information>\n<USER_REQUEST>\nUne vraie conversation. ${TEMOIN}\n</USER_REQUEST>` },
    modele({ tool_calls: [{ name: 'run_command', args: { Cwd: '/Users/demo/projets/autre', CommandLine: `git push ${TEMOIN}` } }] }),
  ]);
  // De vraies conversations touchées pendant l'essai : R2 cite l'essai, R3 n'est citée que par R2. Aucune n'est retenue.
  const hist = (ids) => ({ source: 'SYSTEM', type: 'CONVERSATION_HISTORY', content: `# Conversation History\n${ids.map((i) => `## Conversation ${i}: un titre`).join('\n')}` });
  const ailleurs = (dossier, n) => ({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${dossier} -> x\n</user_information>\n<USER_REQUEST>\n${TEMOIN} ${n}\n</USER_REQUEST>` });
  await transcript(R1, [ailleurs('/Users/demo/clients/acme', 1), modele({ tool_calls: [{ name: `mcp_${TEMOIN}`, args: { type: TEMOIN } }] })]);
  await ecrire(`${brain}/${R1}/${T_}_bilan.md`, TEMOIN);
  await transcript(R2, [hist([P, R3]), ailleurs('/Users/demo/perso', 2)]);
  await transcript(R3, [ailleurs('/Users/demo/autre', 3)]);
  // Une vraie conversation récente dont le .jsonl est un dossier, une autre que verifier.sh rend illisible.
  await mkdir(join(F, `${brain}/${Y}/.system_generated/logs/transcript.jsonl`), { recursive: true });
  await transcript(Z, [ailleurs('/Users/demo/vrai', 4)]);
  // Un second parent dans l'essai, dont l'appel invoke_subagent est un objet, et son enfant dont l'entrée est un tableau.
  await transcript(P2, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${essai} -> x\n</user_information>\n<USER_REQUEST>\nLance.\n</USER_REQUEST>` },
    modele({ tool_calls: { name: 'invoke_subagent', args: { Prompt: TEMOIN } } }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${C3} finished.` }),
  ]);
  await transcript(C3, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: [{ text: '<subagent_reminder>\nsous-agent\n</subagent_reminder>' }, { text: `<USER_REQUEST>${TEMOIN}</USER_REQUEST>` }] },
    modele({ content: `rapport ${TEMOIN}` }),
  ]);
  // Plus ancienne que le dossier d'essai : jamais ouverte (verifier.sh la rend illisible pour le prouver).
  const vieux = await transcript(V, [{ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<USER_REQUEST>${TEMOIN}</USER_REQUEST>` }]);
  await utimes(vieux, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));

  // Le second tour (12/11), dans un dossier d'essai et un ~/.gemini à part. Le dossier d'essai d'abord.
  const essai2 = join(F, 'antigravity/leon-essai-coulisses-antigravity-tour2');
  await ecrire('antigravity/leon-essai-coulisses-antigravity-tour2/a.txt', 'x\n');
  const brain2 = 'antigravity/gemini-tour2/antigravity/brain';
  const tr2 = (id, etapes, nom = 'transcript_full.jsonl') =>
    ecrire(`${brain2}/${id}/.system_generated/logs/${nom}`, etapes.map((e, i) => (typeof e === 'string' ? e : { step_index: i, ...e })));
  const entree = (req) => ({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${essai2} -> x\n</user_information>\n<USER_REQUEST>\n${req}\n</USER_REQUEST>` });
  const u = (x) => `${x}1111-2222-4333-8444-555566667777`;
  // A : des valeurs sous des arguments qui ne s'appellent pas `args`, sous une sortie MCP, et un step_index énorme.
  await tr2(u('aaaa'), [
    entree(TEMOIN),
    modele({ tool_calls: [
      { name: 'mcp_notion_fetch', arguments: { id: 'a1c3e5f7-0b2d-4f6a-8c9e-0d1f2a3b4c5d', status: 'WAITING', exit_code: 42, query: TEMOIN } },
      { name: 'mcp_heroku_auth', input: { id: '5f2b8c1e-9d4a-4e7b-b3c6-1a2b3c4d5e6f', token: TEMOIN } },
    ] }),
    { source: 'MODEL', type: 'CALL_MCP_TOOL', status: 'DONE', content: 'x', mcp_response: { items: [{ id: 'b0b0b0b0-1111-4222-8333-444455556666', name: 'search_web', status: 'WAITING', exit_code: 7, email: TEMOIN }] } },
    { step_index: 4111111111111111, source: 'MODEL', type: 'RUN_COMMAND', status: 'DONE', exit_code: 0, content: TEMOIN },
  ]);
  // B : un raisonnement sous `thought`, des appels sous d'autres clés, un enfant dont le rappel est hors USER_INPUT.
  const [PB, CB] = [u('bbbb'), u('bcbc')];
  await tr2(PB, [
    entree('x'),
    modele({ content: 'ok', thought: TEMOIN, toolCalls: [{ name: 'invoke_subagent', args: { Prompt: TEMOIN } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${CB} finished.` }),
    modele({ content: 'fin', function_calls: [{ name: 'run_command', args: { Cwd: essai2, CommandLine: TEMOIN } }] }),
  ]);
  await tr2(CB, [entree('consigne du sous-agent'), { source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: `<subagent_reminder>\nParent : ${PB}\n</subagent_reminder>` }, modele({ content: 'rapport du sous-agent' })]);
  // C : transcript_full vide ou coupé, transcript complet ; et une conversation dont aucun transcript ne dit le dossier.
  await ecrire(`${brain2}/${u('cccc')}/.system_generated/logs/transcript_full.jsonl`, '');
  await tr2(u('cccc'), [entree(TEMOIN), modele({ content: 'r' })], 'transcript.jsonl');
  await ecrire(`${brain2}/${u('cdcd')}/.system_generated/logs/transcript_full.jsonl`, JSON.stringify(entree(TEMOIN)).slice(0, 80));
  await tr2(u('cdcd'), [entree(TEMOIN), modele({ content: 'r' })], 'transcript.jsonl');
  await tr2(u('cece'), [modele({ content: TEMOIN })]);
  // D : `.system_generated`, puis `logs`, en lien vers un dossier hors de ~/.gemini : jamais lus.
  await ecrire('antigravity/hors-gemini/logs/transcript_full.jsonl', [entree(TEMOIN)]);
  await mkdir(join(F, `${brain2}/${u('dddd')}`), { recursive: true });
  await lien(join(F, 'antigravity/hors-gemini'), `${brain2}/${u('dddd')}/.system_generated`);
  await mkdir(join(F, `${brain2}/${u('dede')}/.system_generated`), { recursive: true });
  await lien(join(F, 'antigravity/hors-gemini/logs'), `${brain2}/${u('dede')}/.system_generated/logs`);

  // Le troisième tour (13/11), dans un dossier d'essai et des ~/.gemini à part. Le dossier d'essai d'abord.
  const essai3 = join(F, 'antigravity/leon-essai-coulisses-antigravity-tour3');
  await ecrire('antigravity/leon-essai-coulisses-antigravity-tour3/a.txt', 'x\n');
  const entree3 = { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${essai3} -> x\n</user_information>\n<USER_REQUEST>\nx\n</USER_REQUEST>` };
  const tr3 = (racine, id, etapes, variante = 'antigravity') =>
    ecrire(`antigravity/${racine}/${variante}/brain/${id}/.system_generated/logs/transcript_full.jsonl`, etapes.map((e, i) => ({ step_index: i, ...e })));
  // Un sous-agent de navigateur sans dossier, sous antigravity-ide ; le parent a une clé inconnue à deux clés de même longueur.
  const [PS, CS] = [u('f0f0'), u('f1f1')];
  await tr3('gemini-tour3', PS, [
    entree3,
    modele({ tool_calls: [{ name: 'browser_subagent', args: { TaskName: 't', Task: CS } }], [`x_${T_}`]: { [`A_${T_}`]: 1, [`B_${T_}`]: 2 } }),
    resultat('BROWSER_SUBAGENT', { content: `Browser subagent ${CS} done` }),
  ], 'antigravity-ide');
  await tr3('gemini-tour3', CS, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<subagent_reminder>\nnavigateur\n</subagent_reminder>\n<USER_REQUEST>${TEMOIN}</USER_REQUEST>` },
    modele({ content: `rapport ${TEMOIN}` }),
  ], 'antigravity-ide');
  // Le brain illisible, et les logs de la conversation d'essai illisibles (verifier.sh les ferme).
  await tr3('gemini-tour3-brain-illisible', u('dada'), [entree3, modele({ content: TEMOIN })]);
  await tr3('gemini-tour3-logs-illisibles', u('dbdb'), [entree3, modele({ content: TEMOIN })]);

  // Le quatrième tour (13/11) : la reconnaissance par les messages exacts de l'essai, sans dossier de travail lisible.
  await ecrire('antigravity/leon-essai-coulisses-antigravity-tour4/a.txt', 'x\n');
  const LIS = "Lis seulement le fichier a.txt de ce dossier, puis réponds en une phrase ce qu'il dit.";
  const VA = 'Va chercher la page web https://example.com et donne son titre.';
  const MESSAGE_1 = `C'est un essai. Ne modifie aucun fichier.\n1. Lance un sous-agent avec cette consigne exacte : « ${LIS} N'utilise aucun autre outil. » Attends son rapport.\n2. Lance un second sous-agent avec cette consigne exacte : « ${VA} » Attends son rapport.\n3. Réponds en deux phrases. ${TEMOIN}`;
  const MESSAGE_2 = `Lance la commande ls fichier-absent.txt, puis la commande curl -sI https://example.com. ${TEMOIN}`;
  const requete = (texte, avant = '') => ({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `${avant}<USER_REQUEST>\n${texte}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nheure inventée\n</ADDITIONAL_METADATA>` });
  const rappel = (texte, parent = '') => ({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<subagent_reminder>\nTu es un sous-agent. ${parent}\n</subagent_reminder>\n<USER_REQUEST>\n${texte}\n</USER_REQUEST>` });
  const ailleurs4 = '/Users/demo/clients/acme';
  // (a) l'essai sans dossier de travail lisible, (b) l'essai avec un dossier lisible ailleurs : retenus par leurs messages.
  await tr3('gemini-tour4', u('a4a4'), [
    { source: 'SYSTEM', type: 'CONVERSATION_HISTORY', content: '# Conversation History' },
    requete(MESSAGE_1),
    modele({ tool_calls: [{ name: 'invoke_subagent', args: { Prompt: LIS, TaskName: 'File Reader' } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent finished. ${TEMOIN}` }),
    requete(MESSAGE_2),
    modele({ tool_calls: [{ name: 'run_command', args: { CommandLine: `ls fichier-absent.txt ${TEMOIN}` } }] }),
    resultat('RUN_COMMAND', { exit_code: 1, content: TEMOIN }),
  ]);
  await tr3('gemini-tour4', u('b4b4'), [
    requete(MESSAGE_1.replace(/'/g, '’'), `<user_information>\n${ailleurs4} -> acme\n</user_information>\n`),
    modele({ tool_calls: [{ name: 'run_command', args: { Cwd: ailleurs4, CommandLine: `ls ${TEMOIN}` } }] }),
  ]);
  // (c) deux sous-agents, sans lien par UUID ni dossier, dont la consigne reprend une phrase, l'un avec un ajout de l'agent.
  await tr3('gemini-tour4', u('c4c4'), [rappel(`${LIS} N'utilise aucun autre outil. ${TEMOIN}`), modele({ content: TEMOIN })]);
  await tr3('gemini-tour4', u('c5c5'), [rappel(`${VA} Une fois le titre obtenu, rapporte-le et termine. ${TEMOIN}`), modele({ content: TEMOIN })]);
  // (d) une vraie conversation sans dossier lisible ni phrases.
  await tr3('gemini-tour4', u('d4d4'), [requete(`Une vraie conversation. ${TEMOIN}`), modele({ content: TEMOIN })]);
  // (e) les deux phrases seulement dans une sortie d'outil, un texte de l'agent, un historique, une métadonnée.
  await tr3('gemini-tour4', u('e4e4'), [
    { source: 'SYSTEM', type: 'CONVERSATION_HISTORY', content: `# Conversation History\n${MESSAGE_1}` },
    requete(`Lis le protocole. ${TEMOIN}`),
    modele({ content: MESSAGE_1, thinking: MESSAGE_1, tool_calls: [{ name: 'view_file', args: { AbsolutePath: `/Users/demo/protocole-${TEMOIN}.md` } }] }),
    resultat('VIEW_FILE', { content: MESSAGE_1 }),
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<USER_REQUEST>\nok ${TEMOIN}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n${MESSAGE_1}\n</ADDITIONAL_METADATA>` },
  ]);
  // (f) une seule des deux phrases dans l'entrée de l'utilisateur.
  await tr3('gemini-tour4', u('f4f4'), [requete(`C'est un essai. Ne modifie aucun fichier. ${VA} ${TEMOIN}`), modele({ content: TEMOIN })]);
  // Le ménage : la conversation d'essai effacée, ses sous-agents restés, et (g) le sous-agent d'une vraie conversation
  // dont la consigne reprend une phrase. Aucune conversation mère n'est retenue : rien n'est relevé.
  const [R4, G4] = [u('a9a9'), u('b9b9')];
  await tr3('gemini-tour4-menage', u('c4c4'), [rappel(`${LIS} ${TEMOIN}`), modele({ content: TEMOIN })]);
  await tr3('gemini-tour4-menage', u('c5c5'), [rappel(`${VA} ${TEMOIN}`), modele({ content: TEMOIN })]);
  await tr3('gemini-tour4-menage', R4, [
    requete(`Lance un sous-agent. ${TEMOIN}`, `<user_information>\n${ailleurs4} -> acme\n</user_information>\n`),
    modele({ tool_calls: [{ name: 'invoke_subagent', args: { Prompt: LIS } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${G4} finished.` }),
  ]);
  await tr3('gemini-tour4-menage', G4, [rappel(`${LIS} ${TEMOIN}`, `Parent : ${R4}`), modele({ content: TEMOIN })]);

  // Le cinquième tour (13/11, attaques4) : les défauts de la reconnaissance par les messages. Le dossier d'essai d'abord.
  await ecrire('antigravity/leon-essai-coulisses-antigravity-tour5/a.txt', 'x\n');
  const [E5, N5, R5, G5a, G5b, B5, S5, C5, D5] = ['5a00', '5a01', '5b00', '5b01', '5b02', '5c00', '5c01', '5d00', '5e01'].map(u);
  const playground = '/Users/demo/.gemini/antigravity/playground/x';
  // Deux essais sans dossier, retenus par leurs messages : l'un tel quel, l'autre en Unicode décomposé (NFD).
  await tr3('gemini-tour5', E5, [requete(MESSAGE_1), modele({ content: TEMOIN })]);
  await tr3('gemini-tour5', N5, [requete(MESSAGE_1.normalize('NFD')), modele({ content: TEMOIN })]);
  // A. Une vraie conversation (acme, aucune phrase) lance G5a (son UUID dans le résultat, son propre Cwd acme) ; G5b,
  // sans dossier, la nomme seulement dans son rappel. Les deux consignes reprennent la page web : aucun n'est retenu.
  await tr3('gemini-tour5', R5, [
    requete(`Analyse le client. ${TEMOIN}`, `<user_information>\n${ailleurs4} -> acme\n</user_information>\n`),
    modele({ tool_calls: [{ name: 'invoke_subagent', args: { Prompt: `${VA} Puis compare avec ${TEMOIN}.` } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${G5a} finished. ${TEMOIN}` }),
  ]);
  await tr3('gemini-tour5', G5a, [
    rappel(`${VA} Puis compare avec ${TEMOIN}.`),
    modele({ tool_calls: [{ name: 'run_command', args: { Cwd: ailleurs4, CommandLine: `grep ${TEMOIN} contrat.txt` } }] }),
    resultat('RUN_COMMAND', { exit_code: 0, content: TEMOIN }),
  ]);
  await ecrire(`antigravity/gemini-tour5/antigravity/brain/${G5a}/rapport-${TEMOIN}.md`, TEMOIN);
  await tr3('gemini-tour5', G5b, [rappel(`${VA} ${TEMOIN}`, `Parent : ${R5}`), modele({ content: TEMOIN })]);
  // B. Une vraie conversation (acme, travail réel, un sous-agent lié par UUID) où, au 6e pas, la personne colle le protocole.
  await tr3('gemini-tour5', B5, [
    requete(`Corrige la facture du client. ${TEMOIN}`, `<user_information>\n${ailleurs4} -> acme\n</user_information>\n`),
    modele({ thinking: TEMOIN, tool_calls: [{ name: 'run_command', args: { Cwd: ailleurs4, CommandLine: `cat facture-${TEMOIN}.txt` } }] }),
    resultat('RUN_COMMAND', { exit_code: 0, content: TEMOIN }),
    modele({ tool_calls: [{ name: 'invoke_subagent', args: { Prompt: `Relis la facture ${TEMOIN}` } }] }),
    resultat('INVOKE_SUBAGENT', { content: `Subagent ${S5} finished.` }),
    requete(`Voici le protocole qu'on m'a donné, tu en penses quoi ?\n\n${MESSAGE_1}`),
    modele({ content: TEMOIN }),
  ]);
  await ecrire(`antigravity/gemini-tour5/antigravity/brain/${B5}/task.md`, TEMOIN);
  await tr3('gemini-tour5', S5, [rappel(`Relis la facture ${TEMOIN}`, `Parent : ${B5}`), modele({ content: TEMOIN })]);
  // C. Une entrée sans USER_REQUEST : la personne a tapé « résume », le message 1 est dans ADDITIONAL_METADATA.
  await tr3('gemini-tour5', C5, [
    { source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<user_information>\n${ailleurs4} -> acme\n</user_information>\nrésume ${TEMOIN}\n<ADDITIONAL_METADATA>\nSelected text:\n${MESSAGE_1}\n</ADDITIONAL_METADATA>` },
    modele({ content: TEMOIN }),
  ]);
  // D. Le sous-agent de la page web de l'essai E5, avec un Cwd hors de l'essai : jamais retenu, compté ; et au ménage
  // (l'essai effacé), le même, toujours compté.
  const sousAgent5 = [rappel(`${VA} Une fois le titre obtenu, rapporte-le et termine.`, `Parent : ${E5}`), modele({ tool_calls: [{ name: 'read_url_content', args: { Url: 'https://example.com', Cwd: playground } }] })];
  await tr3('gemini-tour5', D5, sousAgent5);
  await tr3('gemini-tour5-menage', D5, sousAgent5);
}

await codex();
await cursor();
await antigravity();
console.log(`Fixtures écrites sous ${F}`);
