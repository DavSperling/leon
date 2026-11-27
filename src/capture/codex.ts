// Le lecteur des sessions de Codex (T18 du plan mémoire des sessions) : ses tours et ses gestes, à partir du rollout
// `${CODEX_HOME:-~/.codex}/sessions/AAAA/MM/JJ/rollout-<date>-<id>.jsonl`.
//
// Format relevé dans le code de Codex 0.167.0 (tag rust-v0.167.0 : codex-rs/history/src/rollout_payload.rs,
// codex-rs/protocol/src/{protocol,items,models}.rs, codex-rs/rollout/src/policy.rs) et par l'essai réel du 06/11
// (docs/etudes/memoire-sessions-2026-11/annexes/03-essai-codex.md) :
// - une ligne par enregistrement : `{ timestamp, ordinal?, type, payload }`. `type` vaut `session_meta`,
//   `response_item`, `event_msg`, `turn_context`, `compacted`… ; `ordinal` n'existe qu'en historique paginé
//   (`session_meta.history_mode`, `paginated` depuis la 0.16x), où il numérote les lignes du fil ;
// - `session_meta` : `id` (le fil), `cwd`, `git` (`branch`, `commit_hash`), `source` (`cli`, `exec`, `vscode`… ; un
//   objet `{ subagent }` ou `{ internal }` pour un fil que Codex ouvre lui-même), `thread_source`, `history_mode`, et
//   `history_base` : le préfixe hérité d'un autre rollout (une reprise après retour en arrière, une branche), qui
//   reste dans ce fichier-là ;
// - `response_item` : ce que voit le modèle. `message` (rôles `user`, `assistant`, `developer`), `function_call`,
//   `custom_tool_call` (`apply_patch`), `local_shell_call`, `web_search_call` et leurs sorties ;
// - `event_msg` `item_completed` (historique paginé) : chaque élément du tour, typé par Codex : `CommandExecution`
//   (`command`, `cwd`, `status`, `exit_code`, `aggregated_output`), `FileChange` (`changes`, `status`), `McpToolCall`,
//   `WebSearch`, `CollabAgentToolCall` (les sous-agents)…
//
// Les tours : les `message` de rôle `user` ou `assistant`. Sont écartés le rôle `developer` (dont la sortie du crochet
// de démarrage de Leon, que Codex range là), le contexte que Codex pose en rôle `user` (`<environment_context>`, les
// instructions et `AGENTS.md`, les compétences…), `compacted`, et les blocs de Leon (stripLeonBlocks). Les tours
// injectés (rapport de sous-agent, notification, sortie d'une commande `!`, crochet) ne sont jamais des messages de la
// personne (T63) : ils partent marqués `injecte` (T43), et ne comptent ni comme échange ni pour le titre.
//
// Les gestes : les `item_completed` en historique paginé. Le texte des appels (`exec`, `apply_patch`) n'est lu qu'en
// repli, pour un rollout à l'ancien format.
//
// codex-cli 0.159.0 (annexe 09, essai du 13/11) : un sous-agent est un rollout à part, dans le dossier de la session,
// lancé par un appel `spawn_agent` et nommé par l'élément `SubAgentActivity` (`agent_thread_id`). Son fichier recopie
// l'historique de sa mère avant le rang `subagent_history_start_ordinal`. Son rapport revient dans la session en
// `response_item` de type `agent_message`.
import { resolve } from 'node:path';
import { z } from 'zod';
import type { CoulisseBloc, SessionFacts } from './api-contract';
import { prepareTurnText } from './prepare-turn-text';
import { collecteur, finishBlocs, prepare, target } from './session-backstage';
import {
  type AgentActions,
  buildFacts,
  type FactsRecord,
  HOME_OR_VARIABLE,
  isExternalCommand,
  LEON_LOCAL_TOOLS,
  LEON_MCP_SERVER,
  newFactsRecord,
  recordCommand,
  recordFile,
  recordToolError,
  reduceToolName,
  replaceTasks,
} from './session-facts';
import { stripLeonBlocks } from './strip-leon-blocks';
import { isTypedTurn, type Turn } from './turn';

export type CodexSession = {
  sessionId: string; // l'id du fil (`session_meta.id`)
  cwd: string | null;
  title: string | null;
  // Les tours envoyés : ceux de la personne et de l'assistant ; un tour `user` porte `injecte`.
  turns: Turn[];
  // `session_meta.git` : la branche et le commit au démarrage, dans un dépôt git (absents hors dépôt, ou avant le
  // premier commit).
  branche: string | null;
  commit: string | null;
  // `history_base.thread_id` : le rollout dont ce fichier reprend l'historique, noté comme session d'origine.
  origine: string | null;
};

// Les sous-agents d'une session (T63 amendé le 17/11, chargés par la CLI : loadCodexSubagents) : l'identifiant du fil
// de chaque sous-agent → le contenu de son rollout. Ils décident de `externe`, des coulisses et de `commandes_agents`.
export type CodexSubagents = ReadonlyMap<string, string>;

const TITLE_FROM_TEXT_MAX = 80;

// Schéma minimal d'une ligne : les champs inconnus sont ignorés, une ligne qui ne le respecte pas est écartée.
const LineSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  ordinal: z.number().int().nonnegative().optional(),
  type: z.string(),
  payload: z.unknown(),
});
type Line = z.infer<typeof LineSchema>;

const SessionMetaSchema = z.object({
  id: z.string().min(1).max(200),
  cwd: z.string().optional(),
  source: z.unknown().optional(),
  thread_source: z.string().nullish(),
  parent_thread_id: z.string().nullish(),
  history_mode: z.string().optional(),
  history_base: z
    .object({ thread_id: z.string().min(1), end_ordinal_exclusive: z.number().int() })
    .nullish(),
  subagent_history_start_ordinal: z.number().int().nonnegative().nullish(),
  git: z
    .object({ branch: z.string().nullish(), commit_hash: z.string().nullish() })
    .nullish()
    .catch(null),
});
type SessionMeta = z.infer<typeof SessionMetaSchema>;

// `agent_message` : le message d'un autre agent, sans rôle (annexe 09).
const MessageSchema = z.object({
  type: z.enum(['message', 'agent_message']),
  role: z.string().optional(),
  content: z.array(z.unknown()),
});
const TextItemSchema = z.object({
  type: z.enum(['input_text', 'output_text']),
  text: z.string(),
});

function parseLine(raw: string): Line | null {
  if (raw.trim() === '') return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = LineSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// Un fil que Codex ouvre lui-même n'est pas une session de la personne : un sous-agent (son parent, lui, est capté et
// marqué externe), une revue, une compaction, le gardien, la consolidation de la mémoire.
function isOwnSession(meta: SessionMeta): boolean {
  const { source, thread_source } = meta;
  if (typeof source === 'object' && source !== null) {
    if ('subagent' in source || 'internal' in source) return false;
  }
  if (thread_source && thread_source !== 'user') return false;
  return !meta.parent_thread_id;
}

// Le contexte que Codex pose en rôle `user`, d'après les marqueurs de codex-rs/core/src/context et de
// codex-rs/context-fragments (0.167) : écarté, ce n'est ni la personne ni un rapport.
// shortcut: les marqueurs connus au 06/11 ; un marqueur nouveau ferait compter ce contexte comme un message tapé,
// relire contextual_user_message.rs de Codex à chaque essai réel.
const CONTEXT_PREFIXES = [
  '# AGENTS.md instructions',
  '<environment_context>',
  '<user_instructions>',
  '<environments_instructions>',
  '<apps_instructions>',
  '<skills_instructions>',
  '<plugins_instructions>',
  '<tools>',
  '<collaboration_mode>',
  '<multi_agent_mode>',
  '<realtime_conversation>',
  '<skill>',
  '<codex_internal_context',
  '<goal_context>',
  '<recommended_plugins>',
  '<managed_developer_instructions>',
  '<persistent_mode>',
  '<model_catalog>',
  '<external_',
  'Warning: apply_patch was requested via ',
  'Warning: Your account was flagged for potentially high-risk cyber activity',
  'Warning: The maximum number of unified exec processes you can keep open is',
];
// Ce que Codex injecte en rôle `user` au cours de la session, sans que la personne l'ait tapé (T63) : le rapport d'un
// sous-agent, une interruption, la sortie d'une commande `!` de la personne, le texte d'un crochet, un message d'un
// autre agent.
const INJECTED_PREFIXES = [
  '<subagent_notification>',
  '<turn_aborted>',
  '<user_shell_command>',
  '<hook_prompt',
  '<agent_message_board_notification>',
];

type UserText = 'tape' | 'contexte' | 'injecte';

// Comme Codex (is_contextual_user_message_content) : un seul fragment marqué suffit, le message n'est pas tapé.
function userTextKind(texts: string[]): UserText {
  const starts = (prefixes: string[]) =>
    texts.some((text) => prefixes.some((prefix) => text.trimStart().startsWith(prefix)));
  if (starts(INJECTED_PREFIXES)) return 'injecte';
  return starts(CONTEXT_PREFIXES) ? 'contexte' : 'tape';
}

function messageTexts(content: unknown[]): string[] {
  return content.flatMap((item) => {
    const parsed = TextItemSchema.safeParse(item);
    return parsed.success ? [parsed.data.text] : [];
  });
}

// L'identifiant d'un tour : son numéro dans le fil (ordinal) ou, à l'ancien format, sa ligne, avec son heure. Après un
// retour en arrière, Codex écrit un nouveau rollout du même fil dont les numéros repartent du point de reprise : l'heure
// distingue ses tours de ceux, abandonnés, de l'ancien fichier.
const turnId = (line: Line, index: number): string =>
  `${line.ordinal === undefined ? `l${index}` : `o${line.ordinal}`}@${line.timestamp}`;

// Les lignes propres à ce fichier : celles d'un préfixe hérité (`history_base`), si Codex les recopiait, sont écartées,
// comme, dans le fichier d'un sous-agent, l'historique recopié de sa mère avant `subagent_history_start_ordinal`. Seul
// le premier `session_meta`, celui du fil, donne ces bornes : celui de la mère, recopié, compte dans sa numérotation à
// elle, et on l'ignore, comme `firstMeta`.
function* ownLines(content: string): Generator<{ line: Line; index: number }> {
  let baseEnd = 0;
  let seenMeta = false;
  for (const [index, raw] of content.split('\n').entries()) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.type === 'session_meta') {
      const meta = SessionMetaSchema.safeParse(line.payload);
      if (!seenMeta && meta.success) {
        baseEnd = Math.max(
          meta.data.history_base?.end_ordinal_exclusive ?? 0,
          meta.data.subagent_history_start_ordinal ?? 0,
        );
      }
      seenMeta = true;
    } else if (line.ordinal !== undefined && line.ordinal < baseEnd) {
      continue;
    }
    yield { line, index };
  }
}

// Le premier `session_meta` du fichier : celui du fil. Un fil repris en écrit parfois d'autres, qu'on ignore.
function firstMeta(content: string): SessionMeta | null {
  for (const { line } of ownLines(content)) {
    if (line.type !== 'session_meta') continue;
    const meta = SessionMetaSchema.safeParse(line.payload);
    return meta.success ? meta.data : null;
  }
  return null;
}

export function parseCodexSession(content: string): CodexSession | null {
  const meta = firstMeta(content);
  if (meta === null || !isOwnSession(meta)) return null;
  const turns: Turn[] = [];
  for (const { line, index } of ownLines(content)) {
    if (line.type !== 'response_item') continue;
    const message = MessageSchema.safeParse(line.payload);
    if (!message.success) continue;
    const { type, content: items } = message.data;
    // Le message d'un autre agent (le rapport d'un sous-agent, annexe 09) est un tour `user` injecté (T63).
    const role = type === 'agent_message' ? 'user' : message.data.role;
    if (role !== 'user' && role !== 'assistant') continue; // developer, system
    const texts = messageTexts(items);
    const kind =
      type === 'agent_message' ? 'injecte' : role === 'user' ? userTextKind(texts) : null;
    if (kind === 'contexte') continue;
    // Les blocs de Leon sont retirés avant la préparation : un tour qui n'a rien d'autre est écarté.
    const text = prepareTurnText(stripLeonBlocks(texts.join('\n\n')));
    if (text === null) continue;
    turns.push({
      external_id: turnId(line, index),
      role,
      text,
      ts: line.timestamp,
      capture_mode: 'file',
      ...(kind === null ? {} : { injecte: kind === 'injecte' }),
    });
  }
  const firstUserText = turns.find(isTypedTurn)?.text;
  return {
    sessionId: meta.id,
    cwd: meta.cwd ?? null,
    title: firstUserText ? firstUserText.slice(0, TITLE_FROM_TEXT_MAX) : null,
    turns,
    branche: meta.git?.branch || null,
    commit: meta.git?.commit_hash || null,
    origine: meta.history_base?.thread_id ?? null,
  };
}

// --- Les gestes (C1) -----------------------------------------------------------------------------------------------

// Les outils de Codex qui n'apportent rien d'ailleurs (D17), d'après codex-rs/core/src/tools/handlers (0.167). On
// échoue fermé : tout autre nom (un outil MCP, un sous-agent, `tool_search`, un outil inconnu) rend la session externe.
const LOCAL_FUNCTIONS = new Set([
  'shell',
  'shell_command',
  'exec_command',
  'container.exec',
  'local_shell',
  'write_stdin',
  'apply_patch',
  'update_plan',
  'view_image',
  'request_user_input',
  'request_permissions',
  'get_context_remaining',
  'current_time',
  'sleep',
  'wait_for_environment',
  'new_context_window',
]);
// Les éléments de tour (`item_completed`) qui n'apportent rien d'ailleurs : les autres (`McpToolCall`, `WebSearch`,
// `DynamicToolCall`, `Extension`, `ImageGeneration`, tout type inconnu) rendent la session externe. Une commande l'est
// si elle va sur le réseau (isExternalCommand).
// Un `McpToolCall` vers un outil local du serveur `leon` (LEON_LOCAL_TOOLS, D36) ne compte pas, quand la CLI a reconnu
// ce serveur à l'URL de `config.toml` (leon-mcp.ts) : `server` et `tool` se comparent en entier.
// Un sous-agent (T63 amendé le 17/11) se juge sur son rollout, en historique paginé seulement : `SubAgentActivity` et
// l'attente (`CollabAgentToolCall` de `tool: 'wait'`) ne rendent plus la session externe à eux seuls
// (isExternalSubagent).
// shortcut: à l'ancien format (avant l'historique paginé), tout appel MCP compte, même vers Leon : sa forme
// (`namespace`) n'est relevée que par un test ; la lire si un poste garde un Codex d'avant la 0.16x.
const LOCAL_ITEMS = new Set([
  'UserMessage',
  'AgentMessage',
  'Reasoning',
  'Plan',
  'HookPrompt',
  'CommandExecution',
  'FileChange',
  'ImageView',
  'ContextCompaction',
  'EnteredReviewMode',
  'ExitedReviewMode',
  'FunctionCallOutput',
]);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);

const ItemSchema = z.looseObject({ type: z.string() });
type Item = z.infer<typeof ItemSchema>;
const StartedSchema = z.object({
  type: z.literal('SubAgentActivity'),
  kind: z.literal('started'),
  agent_thread_id: z.string().min(1),
});
const CommandItemSchema = z.object({
  command: z.array(z.string()),
  source: z.string().optional(),
  status: z.string(),
  exit_code: z.number().nullish(),
  aggregated_output: z.string().nullish(),
});
const FileChangeItemSchema = z.object({
  changes: z.record(z.string(), z.unknown()),
  status: z.string().nullish(),
});
const MovedSchema = z.object({ move_path: z.string().nullish() });
const FunctionOutputItemSchema = z.object({ name: z.string() });
const CallSchema = z.object({
  type: z.enum(['function_call', 'custom_tool_call', 'local_shell_call']),
  call_id: z.string().nullish(),
  name: z.string().optional(),
  namespace: z.string().nullish(),
  arguments: z.string().optional(),
  input: z.string().optional(),
  action: z.looseObject({ command: z.array(z.string()).optional() }).optional(),
});
type CodexCall = z.infer<typeof CallSchema>;
const CallOutputSchema = z.object({
  type: z.enum(['function_call_output', 'custom_tool_call_output']),
  call_id: z.string().nullish(),
  output: z.unknown(),
});
const PlanSchema = z.object({
  plan: z.array(
    z.object({ step: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) }),
  ),
});
const PLAN_STATES = { pending: 'a_faire', in_progress: 'en_cours', completed: 'fait' } as const;
const PatchApplyEndSchema = z.object({
  changes: z.record(z.string(), z.unknown()),
  success: z.boolean(),
});

// Une commande que Codex lance par un shell (`["/bin/zsh", "-lc", "git status"]`) se lit dans son script ; une autre,
// mot à mot.
function commandText(argv: string[]): string {
  const [program = '', flag = '', script] = argv;
  const name = program.split(/[\\/]/).at(-1) ?? '';
  if (argv.length === 3 && SHELLS.has(name) && /^-[a-z]*c$/.test(flag) && script !== undefined) {
    return script;
  }
  return argv.map((word) => (/^[\w./:=@%+,-]+$/.test(word) ? word : `'${word}'`)).join(' ');
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// À l'ancien format, la commande d'un appel d'outil de shell.
function callCommand(call: CodexCall): string | null {
  if (call.type === 'local_shell_call') {
    return call.action?.command ? commandText(call.action.command) : null;
  }
  const args = parseJson(call.arguments);
  if (typeof args !== 'object' || args === null) return null;
  const { command, cmd } = args as { command?: unknown; cmd?: unknown };
  if (typeof cmd === 'string') return cmd; // exec_command
  if (typeof command === 'string') return command; // shell_command
  if (Array.isArray(command) && command.every((word) => typeof word === 'string')) {
    return commandText(command); // shell, container.exec
  }
  return null;
}

// Le texte de la sortie d'un appel : une chaîne, ou des éléments de contenu.
function outputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return messageTexts(output).join('\n');
  return '';
}

// À l'ancien format, le code de sortie d'une commande, d'après les formes de sortie connues de Codex :
// `{"output":…,"metadata":{"exit_code":1}}`, « Exit code: 1 », « Process exited with code 1 ». null s'il n'y en a pas.
function exitCodeOf(text: string): number | null {
  const json = parseJson(text) as { metadata?: { exit_code?: unknown } } | null;
  const fromJson = json?.metadata?.exit_code;
  if (typeof fromJson === 'number') return fromJson;
  const match = /^(?:Exit code:|Process exited with code) (-?\d+)/m.exec(text);
  return match ? Number(match[1]) : null;
}

// Les fichiers d'un texte d'apply_patch (`*** Update File: x`), relatifs au dossier de la session.
const PATCH_FILE = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
function patchFiles(call: CodexCall): string[] {
  const args = parseJson(call.arguments) as { input?: unknown } | null;
  const patch = call.input ?? (typeof args?.input === 'string' ? args.input : '');
  return [...patch.matchAll(PATCH_FILE)].flatMap(([, path]) => (path ? [path.trim()] : []));
}

type Reading = {
  record: FactsRecord;
  root: string | null;
  cwd: string;
  errors: number;
  external: boolean;
  leonMcp: boolean;
  subagents: CodexSubagents | undefined;
  visited: Set<string>; // les fils déjà jugés, la session comprise
  spawned: number; // les appels spawn_agent
  started: number; // leurs éléments SubAgentActivity démarrés
  agents: AgentActions[]; // les relevés des sous-agents finis, partagés avec ceux qu'ils lancent
};

// L'élément de tour d'une ligne `item_completed`, ou null.
const completedItem = (line: Line): unknown =>
  line.type === 'event_msg' &&
  (line.payload as { type?: unknown } | null)?.type === 'item_completed'
    ? (line.payload as { item?: unknown }).item
    : null;
const eventType = (line: Line): unknown =>
  line.type === 'event_msg' ? (line.payload as { type?: unknown } | null)?.type : undefined;

// Les lignes propres d'un sous-agent qui a rendu son rapport final (annexe 09) : son premier `session_meta` dit
// l'historique paginé et le rang de ses lignes propres, et son dernier `task_started` est suivi d'un `task_complete`.
// null si son fichier manque, porte une ligne illisible, sort de cette forme, ou s'il n'a pas fini : on ne sait pas tout
// ce qu'il a fait (échec fermé).
function finishedSubagent(content: string | undefined): Line[] | null {
  if (content === undefined) return null;
  if (content.split('\n').some((raw) => raw.trim() !== '' && parseLine(raw) === null)) return null;
  const meta = firstMeta(content);
  if (meta?.history_mode !== 'paginated' || typeof meta.subagent_history_start_ordinal !== 'number')
    return null;
  const lines = [...ownLines(content)].map(({ line }) => line);
  let started = false;
  let finished = false;
  for (const line of lines) {
    const type = eventType(line);
    if (type === 'task_started') [started, finished] = [true, false];
    else if (type === 'task_complete') finished = started;
  }
  return finished ? lines : null;
}

// Les fils des sous-agents qu'un rollout lance, sur ses lignes propres, en historique paginé seulement : pour le
// chargeur de la CLI (loadCodexSubagents).
export function codexSubagentThreads(content: string): string[] {
  if (firstMeta(content)?.history_mode !== 'paginated') return [];
  return [...ownLines(content)].flatMap(({ line }) => {
    const started = StartedSchema.safeParse(completedItem(line));
    return started.success ? [started.data.agent_thread_id] : [];
  });
}

// Un sous-agent rend la session externe si l'on ne sait pas tout ce qu'il a fait (finishedSubagent), ou si l'un de ses
// éléments propres l'est, par la même règle que la session, ses propres sous-agents compris. Un fil revu n'apporte rien
// de plus : s'il était externe, la session l'est déjà. Un sous-agent fini laisse aussi son relevé dans `agents` (T58).
function isExternalSubagent(thread: string, parent: Reading): boolean {
  if (parent.visited.has(thread)) return false;
  parent.visited.add(thread);
  const lines = finishedSubagent(parent.subagents?.get(thread));
  if (lines === null) return true;
  // Ses gestes ne sont pas ceux de la session : seuls `external`, ses commandes et ses outils en erreur servent.
  const reading: Reading = {
    ...parent,
    record: newFactsRecord(),
    errors: 0,
    external: false,
    spawned: 0,
    started: 0,
  };
  const calls = new Map<string, CodexCall>();
  for (const line of lines) readLine(reading, line, true, calls);
  parent.agents.push({
    debut: lines[0]?.timestamp ?? null,
    commandes: reading.record.commands,
    outils: reading.record.toolErrors,
  });
  return isExternal(reading);
}

// Un appel spawn_agent sans son élément SubAgentActivity (une forme que l'annexe 09 n'a pas vue) : un sous-agent qu'on ne
// juge pas, la session est externe (échec fermé).
const isExternal = (reading: Reading) => reading.external || reading.spawned > reading.started;

const McpItemSchema = z.object({ server: z.literal(LEON_MCP_SERVER), tool: z.string() });
const isLeonLocalCall = (item: unknown) => {
  const call = McpItemSchema.safeParse(item);
  return call.success && LEON_LOCAL_TOOLS.includes(call.data.tool);
};

// Un chemin relatif se lit depuis `cwd`, le dossier de la session ; « ~/x » ou « $HOME/x » reste tel quel, pour que
// `repoRelativePath` l'écarte : résolu, il passerait pour un fichier du dépôt.
const fromCwd = (cwd: string, path: string) =>
  HOME_OR_VARIABLE.test(path) ? path : resolve(cwd, path);

// Un élément de tour typé par Codex (historique paginé).
function readItem(reading: Reading, item: Item): void {
  // Relevé avant les retours : un appel MCP en erreur compte, qu'il soit vers Leon ou rende la session externe.
  if (item.type === 'McpToolCall' && statut(item) === 'erreur')
    recordToolError(
      reading.record,
      typeof item.server === 'string' ? `mcp:${item.server}` : '[outil]',
    );
  if (item.type === 'McpToolCall' && reading.leonMcp && isLeonLocalCall(item)) return;
  if (item.type === 'SubAgentActivity') {
    const started = StartedSchema.safeParse(item);
    if (started.success) {
      reading.started += 1;
      // Toujours lu, même une session déjà externe : son relevé va dans commandes_agents.
      const external = isExternalSubagent(started.data.agent_thread_id, reading);
      reading.external ||= external;
    } else if (item.kind !== 'completed') reading.external = true; // une forme non relevée
    return;
  }
  // L'attente d'un sous-agent, jugé à son lancement ; un autre outil de sous-agent, non relevé (annexe 09), la laisse
  // externe.
  if (item.type === 'CollabAgentToolCall' && item.tool === 'wait') return;
  if (!LOCAL_ITEMS.has(item.type)) {
    reading.external = true;
    return;
  }
  if (item.type === 'FunctionCallOutput') {
    const output = FunctionOutputItemSchema.safeParse(item);
    if (!output.success || !LOCAL_FUNCTIONS.has(output.data.name)) reading.external = true;
    return;
  }
  if (item.type === 'CommandExecution') {
    const parsed = CommandItemSchema.safeParse(item);
    if (!parsed.success) return;
    const { command, source, status, exit_code, aggregated_output } = parsed.data;
    // Une écriture sur l'entrée d'une commande déjà lancée n'en est pas une nouvelle ; une commande refusée n'a pas
    // tourné.
    if (source === 'unified_exec_interaction' || status === 'declined') return;
    const script = commandText(command);
    reading.external ||= isExternalCommand(script);
    const error = status !== 'completed' || (exit_code ?? 0) !== 0;
    if (error) reading.errors += 1;
    recordCommand(reading.record, script, aggregated_output ?? '', error);
    return;
  }
  if (item.type === 'FileChange') {
    const parsed = FileChangeItemSchema.safeParse(item);
    if (!parsed.success) return;
    const { changes, status } = parsed.data;
    if (status && status !== 'completed') {
      if (status === 'failed') reading.errors += 1;
      recordToolError(reading.record, 'Edit'); // le nom commun des coulisses (itemCalls)
      return;
    }
    for (const [path, change] of Object.entries(changes)) {
      recordFile(reading.record, fromCwd(reading.cwd, path), reading.root);
      const moved = MovedSchema.safeParse(change);
      if (moved.success && moved.data.move_path) {
        recordFile(reading.record, fromCwd(reading.cwd, moved.data.move_path), reading.root);
      }
    }
  }
}

// Une ligne d'un rollout, en historique paginé (`typed`) ou à l'ancien format : ses gestes vont dans `reading`.
function readLine(
  reading: Reading,
  line: Line,
  typed: boolean,
  calls: Map<string, CodexCall>,
): void {
  const payload = ItemSchema.safeParse(line.payload);
  if (!payload.success) return;
  if (line.type === 'event_msg') {
    if (payload.data.type === 'item_completed' && typed) {
      const item = ItemSchema.safeParse(completedItem(line));
      if (item.success) readItem(reading, item.data);
    }
    // L'ancien format garde aussi ces évènements-là. La fin d'un appel MCP porte `invocation` (`server`, `tool`).
    const invocation = (line.payload as { invocation?: unknown }).invocation;
    const leonCall =
      payload.data.type === 'mcp_tool_call_end' && reading.leonMcp && isLeonLocalCall(invocation);
    if (
      (payload.data.type === 'mcp_tool_call_end' && !leonCall) ||
      payload.data.type === 'web_search_end'
    ) {
      reading.external = true;
    }
    const applied = !typed ? PatchApplyEndSchema.safeParse(line.payload) : null;
    if (payload.data.type === 'patch_apply_end' && applied?.success) {
      // La sortie de l'appel apply_patch a déjà compté l'échec sous Edit.
      if (!applied.data.success) reading.errors += 1;
      else {
        for (const path of Object.keys(applied.data.changes)) {
          recordFile(reading.record, fromCwd(reading.cwd, path), reading.root);
        }
      }
    }
    return;
  }
  if (line.type !== 'response_item') return;
  if (payload.data.type === 'web_search_call' || payload.data.type === 'tool_search_call') {
    reading.external = true;
    return;
  }
  const call = CallSchema.safeParse(line.payload);
  if (call.success) {
    const { name, namespace, call_id } = call.data;
    if (name === 'spawn_agent') reading.spawned += 1;
    // update_plan réécrit toute la liste des tâches, à chaque appel.
    const plan =
      name === 'update_plan' ? PlanSchema.safeParse(parseJson(call.data.arguments)) : null;
    if (plan?.success) {
      replaceTasks(
        reading.record,
        plan.data.plan.map(({ step, status }) => ({ texte: step, etat: PLAN_STATES[status] })),
      );
    }
    if (typed) return; // les éléments de tour disent le reste
    const local =
      call.data.type === 'local_shell_call' || (LOCAL_FUNCTIONS.has(name ?? '') && !namespace);
    const command = callCommand(call.data);
    reading.external ||= !local || (command !== null && isExternalCommand(command));
    if (call_id) calls.set(call_id, call.data);
    return;
  }
  const output = CallOutputSchema.safeParse(line.payload);
  if (!output.success || typed || !output.data.call_id) return;
  const answered = calls.get(output.data.call_id);
  if (!answered) return;
  const text = outputText(output.data.output);
  const exitCode = exitCodeOf(text);
  const error = (exitCode ?? 0) !== 0;
  if (answered.name === 'apply_patch') {
    if (error || /^\s*(?:error|failed)\b/i.test(text)) {
      reading.errors += 1;
      recordToolError(reading.record, 'Edit');
    } else
      for (const path of patchFiles(answered))
        recordFile(reading.record, fromCwd(reading.cwd, path), reading.root);
    return;
  }
  const command = callCommand(answered);
  if (command === null) return;
  if (error) reading.errors += 1;
  recordCommand(reading.record, command, text, error);
}

// Les gestes d'une session Codex, à partir de son rollout. `root` est la racine du dépôt (chemin absolu) : les fichiers
// écrits ailleurs sont retirés ; null, hors de tout dépôt, aucun fichier. `brancheLue` : la branche que lit git au
// moment de la capture, prise seulement quand le rollout n'en porte pas (hors dépôt git au démarrage, ou avant le
// premier commit).
// `leonMcp` : le serveur `leon` de la configuration de Codex est celui de la connexion (leon-mcp.ts).
// `subagents` : les sous-agents de la session (loadCodexSubagents), qui décident de `externe` et, finis, donnent
// `commandes_agents` ; sans eux, un sous-agent rend la session externe.
// shortcut: une branche lue à la capture n'est marquée comme telle que dans le code : C1 n'a pas de champ pour le dire,
// en ajouter un (le serveur d'abord) si le bloc doit la distinguer.
export function extractCodexFacts(
  content: string,
  root: string | null,
  brancheLue: string | null = null,
  leonMcp = false,
  subagents?: CodexSubagents,
): SessionFacts {
  const meta = firstMeta(content);
  const session = parseCodexSession(content);
  // L'historique paginé type chaque geste ; à l'ancien format, on lit le texte des appels.
  const typed = meta?.history_mode === 'paginated';
  const reading: Reading = {
    record: newFactsRecord(),
    root,
    cwd: meta?.cwd || root || '/',
    errors: 0,
    external: false,
    leonMcp,
    subagents,
    visited: new Set(meta ? [meta.id] : []),
    spawned: 0,
    started: 0,
    agents: [],
  };
  const calls = new Map<string, CodexCall>();
  let start: string | null = null;
  let end: string | null = null;

  for (const { line } of ownLines(content)) {
    start ??= line.timestamp;
    end = line.timestamp;
    readLine(reading, line, typed, calls);
  }

  return buildFacts(reading.record, {
    links: [],
    branch: meta?.git?.branch || brancheLue,
    errors: reading.errors,
    external: isExternal(reading),
    echanges: session?.turns.filter(isTypedTurn).length ?? 0,
    start,
    end,
    agents: reading.agents,
  });
}

// --- Les coulisses (T52 amendé le 17/11, C10) -----------------------------------------------------------------------

// Les éléments de tour qui ne sont pas des appels d'outils.
const NOT_CALLS = new Set([
  'UserMessage',
  'AgentMessage',
  'Reasoning',
  'Plan',
  'HookPrompt',
  'ContextCompaction',
  'EnteredReviewMode',
  'ExitedReviewMode',
]);
// Les éléments d'outil connus du lecteur qui n'ont pas de nom commun (C10 amendé le 17/11) : leur nom, sans cible.
const NAMED_ITEMS = new Set([
  'WebSearch',
  'ImageView',
  'ImageGeneration',
  'CollabAgentToolCall',
  'Extension',
  'DynamicToolCall',
]);
const ReasoningSchema = z.object({ type: z.literal('reasoning'), summary: z.array(z.unknown()) });
const SummarySchema = z.object({ text: z.string() });
const SpawnArgumentsSchema = z.object({ message: z.string() });

// Les appels d'un élément de tour, par une table fermée (T52 amendé le 17/11) : le nom commun de Claude Code quand il y
// en a un (une commande est `Bash`, un changement de fichier `Edit`, un bloc par fichier), sinon le nom de l'élément ;
// un type inconnu, `[outil]`. Un élément qui n'est pas un appel n'en donne aucun, une commande hors forme non plus. Un
// chemin se lit comme dans les faits (fromCwd).
function itemCalls(
  item: Item,
  root: string | null,
  cwd: string,
): { outil: string; cible?: string }[] {
  const call = (outil: string, input: unknown) => {
    const cible = target(outil, input, root);
    return { outil, ...(cible === undefined ? {} : { cible }) };
  };
  if (NOT_CALLS.has(item.type)) return [];
  if (item.type === 'CommandExecution') {
    const command = CommandItemSchema.safeParse(item);
    // Une écriture sur l'entrée d'une commande déjà lancée n'en est pas une nouvelle.
    if (!command.success || command.data.source === 'unified_exec_interaction') return [];
    return [call('Bash', { command: commandText(command.data.command) })];
  }
  if (item.type === 'FileChange') {
    const change = FileChangeItemSchema.safeParse(item);
    if (!change.success) return [];
    return Object.keys(change.data.changes).map((path) =>
      call('Edit', { file_path: fromCwd(cwd, path) }),
    );
  }
  if (item.type === 'McpToolCall') {
    // Le serveur seul, jamais le nom de l'outil.
    return [
      { outil: typeof item.server === 'string' ? reduceToolName(`mcp:${item.server}`) : '[outil]' },
    ];
  }
  if (item.type === 'SubAgentActivity')
    return item.kind === 'started' ? [{ outil: 'spawn_agent' }] : [];
  if (item.type === 'FunctionCallOutput') {
    const output = FunctionOutputItemSchema.safeParse(item);
    return [
      {
        outil:
          output.success && LOCAL_FUNCTIONS.has(output.data.name) ? output.data.name : '[outil]',
      },
    ];
  }
  return [{ outil: NAMED_ITEMS.has(item.type) ? item.type : '[outil]' }];
}

// C10 amendé le 17/11 : `erreur` si l'élément n'a pas fini normalement (un refus compris) ou sort avec un code non nul.
const statut = (item: Item) =>
  (typeof item.status === 'string' && item.status !== 'completed') ||
  (typeof item.exit_code === 'number' && item.exit_code !== 0)
    ? 'erreur'
    : 'ok';

// Les coulisses d'une session Codex, dans l'ordre du temps, en historique paginé seulement (D29 : une forme inconnue ne
// part pas), sur ses lignes propres : le résumé du raisonnement de la session (`summary[]`, jamais `encrypted_content`),
// chaque appel d'outil réduit (itemCalls, le statut lu sur son élément), la consigne (`message` de spawn_agent) et le
// rapport (`last_agent_message` du dernier `task_complete`) de chaque sous-agent, et les appels des sous-agents qui ont
// fini. Jamais la sortie d'un outil. Identifiants (C10 amendé le 17/11) : le rang de la ligne, précédé du fil du
// sous-agent pour les siens.
// shortcut: après un retour en arrière, le nouveau rollout du même fil reprend les rangs de l'ancien : ses blocs de même
// rang ne partent pas (le premier écrit gagne) ; ajouter l'heure à l'identifiant si ça se voit.
export function extractCodexBackstage(
  content: string,
  root: string | null,
  subagents: CodexSubagents,
): CoulisseBloc[] {
  const meta = firstMeta(content);
  if (meta?.history_mode !== 'paginated') return [];
  const { blocs, push } = collecteur();
  const visited = new Set([meta.id]);
  const cwd = meta.cwd || root || '/';

  // `prefix` : vide pour la session, le fil du sous-agent suivi de « : » pour un sous-agent.
  function read(lines: Line[], prefix: string): void {
    for (const line of lines) {
      if (line.ordinal === undefined) continue; // hors de la forme paginée
      const id = `${prefix}${line.ordinal}`;
      const ts = line.timestamp;
      if (line.type === 'response_item') {
        // Le raisonnement d'un sous-agent ne part pas (D29).
        const reasoning = prefix === '' ? ReasoningSchema.safeParse(line.payload) : null;
        if (reasoning?.success) {
          const texts = reasoning.data.summary.flatMap((part) => {
            const summary = SummarySchema.safeParse(part);
            return summary.success ? [summary.data.text] : [];
          });
          const texte = prepare(texts.join('\n\n'));
          if (texte !== null) push({ role: 'raisonnement', id, ts, texte });
        }
        // La consigne : le seul `message` de l'appel, pas un outil MCP du même nom.
        const spawn = CallSchema.safeParse(line.payload);
        if (!spawn.success || spawn.data.type !== 'function_call') continue;
        const { name, namespace, arguments: raw } = spawn.data;
        if (name !== 'spawn_agent' || (namespace && namespace !== 'collaboration')) continue;
        const args = SpawnArgumentsSchema.safeParse(parseJson(raw));
        const texte = args.success ? prepare(args.data.message) : null;
        if (texte !== null)
          push({ role: 'sous_agent', id: `${id}:consigne`, ts, partie: 'consigne', texte });
        continue;
      }
      const item = ItemSchema.safeParse(completedItem(line));
      if (!item.success) continue;
      for (const [rang, call] of itemCalls(item.data, root, cwd).entries()) {
        const callId = item.data.type === 'FileChange' ? `${id}:${rang}` : id;
        push({ role: 'appel_outil', id: callId, ts, ...call, statut: statut(item.data) });
      }
      const started = StartedSchema.safeParse(item.data);
      if (started.success) subagent(started.data.agent_thread_id);
    }
  }

  // Un sous-agent qui n'a pas fini, ou ne se lit pas : ni rapport, ni appels ; sa consigne part seule.
  function subagent(thread: string): void {
    if (visited.has(thread)) return;
    visited.add(thread);
    const lines = finishedSubagent(subagents.get(thread));
    if (lines === null) return;
    read(lines, `${thread}:`);
    const last = lines.findLast((line) => eventType(line) === 'task_complete');
    const message = (last?.payload as { last_agent_message?: unknown } | undefined)
      ?.last_agent_message;
    const texte = typeof message === 'string' ? prepare(message) : null;
    if (last && texte !== null)
      push({
        role: 'sous_agent',
        id: `${thread}:rapport`,
        ts: last.timestamp,
        partie: 'rapport',
        texte,
      });
  }

  read(
    [...ownLines(content)].map(({ line }) => line),
    '',
  );
  return finishBlocs(blocs);
}
