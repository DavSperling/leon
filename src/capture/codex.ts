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
// personne (T63) : ils sont marqués `injecte` (T43), ne comptent ni comme échange ni pour le titre, et restent sur le
// poste (captureToolFile).
//
// Les gestes : les `item_completed` en historique paginé. Le texte des appels (`exec`, `apply_patch`) n'est lu qu'en
// repli, pour un rollout à l'ancien format.
import { resolve } from 'node:path';
import { z } from 'zod';
import type { SessionFacts } from './api-contract';
import { prepareTurnText } from './prepare-turn-text';
import {
  buildFacts,
  type FactsRecord,
  isExternalCommand,
  newFactsRecord,
  recordCommand,
  recordFile,
  replaceTasks,
} from './session-facts';
import { stripLeonBlocks } from './strip-leon-blocks';
import { isTypedTurn, type Turn } from './turn';

export type CodexSession = {
  sessionId: string; // l'id du fil (`session_meta.id`)
  cwd: string | null;
  title: string | null;
  // Les tours de la personne et de l'assistant ; un tour `user` porte `injecte`.
  turns: Turn[];
  // `session_meta.git` : la branche et le commit au démarrage, dans un dépôt git (absents hors dépôt, ou avant le
  // premier commit).
  branche: string | null;
  commit: string | null;
  // `history_base.thread_id` : le rollout dont ce fichier reprend l'historique, noté comme session d'origine.
  origine: string | null;
};

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
  git: z
    .object({ branch: z.string().nullish(), commit_hash: z.string().nullish() })
    .nullish()
    .catch(null),
});
type SessionMeta = z.infer<typeof SessionMetaSchema>;

const MessageSchema = z.object({
  type: z.literal('message'),
  role: z.string(),
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

// Les lignes propres à ce fichier : celles d'un préfixe hérité (`history_base`), si Codex les recopiait, sont écartées.
function* ownLines(content: string): Generator<{ line: Line; index: number }> {
  let baseEnd = 0;
  for (const [index, raw] of content.split('\n').entries()) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.type === 'session_meta') {
      const meta = SessionMetaSchema.safeParse(line.payload);
      if (meta.success && meta.data.history_base) {
        baseEnd = meta.data.history_base.end_ordinal_exclusive;
      }
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
    const { role, content: items } = message.data;
    if (role !== 'user' && role !== 'assistant') continue; // developer, system
    const texts = messageTexts(items);
    const kind = role === 'user' ? userTextKind(texts) : null;
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
// `CollabAgentToolCall`, `SubAgentActivity`, `DynamicToolCall`, `Extension`, `ImageGeneration`, tout type inconnu)
// rendent la session externe. Une commande l'est si elle va sur le réseau (isExternalCommand).
// shortcut: un appel MCP compte toujours, même vers Leon : les outils `dossier`, `fil`, `lecons`, `versions` et
// `remember` du serveur MCP de Leon (D36) ne compteront plus quand T44 (lot 12) saura le reconnaître à son URL.
// shortcut: tout sous-agent rend la session externe : l'essai T15 n'a pas relevé ses échanges, le tri de T63 (un
// sous-agent qui ne lit que le dépôt) viendra avec la capture complète (lot 14).
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
};

// Un élément de tour typé par Codex (historique paginé).
function readItem(reading: Reading, item: z.infer<typeof ItemSchema>): void {
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
      return;
    }
    for (const [path, change] of Object.entries(changes)) {
      recordFile(reading.record, resolve(reading.cwd, path), reading.root);
      const moved = MovedSchema.safeParse(change);
      if (moved.success && moved.data.move_path) {
        recordFile(reading.record, resolve(reading.cwd, moved.data.move_path), reading.root);
      }
    }
  }
}

// Les gestes d'une session Codex, à partir de son rollout. `root` est la racine du dépôt (chemin absolu) : les fichiers
// écrits ailleurs sont retirés ; null, hors de tout dépôt, aucun fichier. `brancheLue` : la branche que lit git au
// moment de la capture, prise seulement quand le rollout n'en porte pas (hors dépôt git au démarrage, ou avant le
// premier commit).
// shortcut: une branche lue à la capture n'est marquée comme telle que dans le code : C1 n'a pas de champ pour le dire,
// en ajouter un (le serveur d'abord) si le bloc doit la distinguer.
export function extractCodexFacts(
  content: string,
  root: string | null,
  brancheLue: string | null = null,
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
  };
  const calls = new Map<string, CodexCall>();
  let start: string | null = null;
  let end: string | null = null;

  for (const { line } of ownLines(content)) {
    start ??= line.timestamp;
    end = line.timestamp;
    const payload = ItemSchema.safeParse(line.payload);
    if (!payload.success) continue;
    if (line.type === 'event_msg') {
      if (payload.data.type === 'item_completed' && typed) {
        const item = ItemSchema.safeParse((line.payload as { item?: unknown }).item);
        if (item.success) readItem(reading, item.data);
      }
      // L'ancien format garde aussi ces évènements-là.
      if (payload.data.type === 'mcp_tool_call_end' || payload.data.type === 'web_search_end') {
        reading.external = true;
      }
      const applied = !typed ? PatchApplyEndSchema.safeParse(line.payload) : null;
      if (payload.data.type === 'patch_apply_end' && applied?.success) {
        if (!applied.data.success) reading.errors += 1;
        else {
          for (const path of Object.keys(applied.data.changes)) {
            recordFile(reading.record, resolve(reading.cwd, path), root);
          }
        }
      }
      continue;
    }
    if (line.type !== 'response_item') continue;
    if (payload.data.type === 'web_search_call' || payload.data.type === 'tool_search_call') {
      reading.external = true;
      continue;
    }
    const call = CallSchema.safeParse(line.payload);
    if (call.success) {
      const { name, namespace, call_id } = call.data;
      // update_plan réécrit toute la liste des tâches, à chaque appel.
      const plan =
        name === 'update_plan' ? PlanSchema.safeParse(parseJson(call.data.arguments)) : null;
      if (plan?.success) {
        replaceTasks(
          reading.record,
          plan.data.plan.map(({ step, status }) => ({ texte: step, etat: PLAN_STATES[status] })),
        );
      }
      if (typed) continue; // les éléments de tour disent le reste
      const local =
        call.data.type === 'local_shell_call' || (LOCAL_FUNCTIONS.has(name ?? '') && !namespace);
      const command = callCommand(call.data);
      reading.external ||= !local || (command !== null && isExternalCommand(command));
      if (call_id) calls.set(call_id, call.data);
      continue;
    }
    const output = CallOutputSchema.safeParse(line.payload);
    if (!output.success || typed || !output.data.call_id) continue;
    const answered = calls.get(output.data.call_id);
    if (!answered) continue;
    const text = outputText(output.data.output);
    const exitCode = exitCodeOf(text);
    const error = (exitCode ?? 0) !== 0;
    if (answered.name === 'apply_patch') {
      if (error || /^\s*(?:error|failed)\b/i.test(text)) reading.errors += 1;
      else
        for (const path of patchFiles(answered))
          recordFile(reading.record, resolve(reading.cwd, path), root);
      continue;
    }
    const command = callCommand(answered);
    if (command === null) continue;
    if (error) reading.errors += 1;
    recordCommand(reading.record, command, text, error);
  }

  return buildFacts(reading.record, {
    links: [],
    branch: meta?.git?.branch || brancheLue,
    errors: reading.errors,
    external: reading.external,
    echanges: session?.turns.filter(isTypedTurn).length ?? 0,
    start,
    end,
  });
}
