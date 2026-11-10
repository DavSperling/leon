// Le lecteur des sessions d'Antigravity (T32 du plan mémoire des sessions) : ses tours et ses gestes, à partir du
// transcript `~/.gemini/{antigravity,antigravity-ide,antigravity-cli}/brain/<conversation>/.system_generated/logs/
// transcript_full.jsonl` (ou `transcript.jsonl`).
//
// D'après le plan et un lecteur public de ce format (MoonCaves/rawclaw, `internal/source/antigravity`), confirmé par
// l'essai réel T31 du 08/11 (annexe 05 : la forme seule de quatre transcripts, jamais leur contenu) :
// - l'appli 2.0.1 écrit `~/.gemini/antigravity/…/transcript.jsonl` seulement ; l'IDE écrit sous
//   `~/.gemini/antigravity-ide/` un `transcript.jsonl` coupé (champ `truncated_fields`) et un `transcript_full.jsonl`
//   entier, lu d'abord ;
// - clés des étapes vues : `step_index`, `source`, `type`, `status`, `created_at`, `content`, `thinking`, `tool_calls`,
//   `exit_code` (les commandes, dans l'IDE) ;
// - types d'étapes vus : USER_INPUT, PLANNER_RESPONSE, CONVERSATION_HISTORY, KNOWLEDGE_ARTIFACTS, CHECKPOINT,
//   SYSTEM_MESSAGE, GENERIC, RUN_COMMAND, VIEW_FILE, CODE_ACTION, GREP_SEARCH, LIST_DIRECTORY ; outils vus : run_command,
//   view_file, write_to_file, replace_file_content, grep_search, list_dir, manage_task, schedule ;
// - le message que le crochet injecte (`ephemeralMessage`) n'y laisse aucune trace.
// shortcut: `manage_task` (la liste de tâches de l'agent) n'est pas encore lu, faute d'avoir relevé la forme de ses
// arguments ; à relever au prochain essai (le rapport du témoin la donne) pour remplir `taches`.
// - une étape par ligne : `{ step_index, source, type, created_at, content, thinking?, tool_calls? }`, où `tool_calls`
//   est une liste `{ name, args }` (`args` en objet ou en chaîne JSON) ;
// - `USER_INPUT` (source `USER_EXPLICIT`) : le message de la personne, entre `<USER_REQUEST>` et `</USER_REQUEST>`, à
//   côté de blocs qu'Antigravity ajoute (`<user_information>`, `<ADDITIONAL_METADATA>`) ;
// - `PLANNER_RESPONSE` : la réponse du modèle (`content`), sa pensée (`thinking`, non captée) et ses appels d'outils ;
// - `CONVERSATION_HISTORY`, `CHECKPOINT`, `SYSTEM_MESSAGE` : ignorés ; les autres (`RUN_COMMAND`, `VIEW_FILE`,
//   `SEARCH_WEB`, `CALL_MCP_TOOL`, `INVOKE_SUBAGENT`…) sont les résultats des outils ;
// - un sous-agent a sa propre conversation, dont le premier message porte `<subagent_reminder>` : ce n'est pas une
//   session de la personne (son parent, lui, est marqué externe).
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import type { SessionFacts } from './api-contract';
import { prepareTurnText, removeBlocks } from './prepare-turn-text';
import {
  buildFacts,
  isExternalCommand,
  newFactsRecord,
  recordCommand,
  recordFile,
} from './session-facts';
import { stripLeonBlocks } from './strip-leon-blocks';
import { isTypedTurn, type Turn } from './turn';

export type AntigravitySession = {
  sessionId: string; // la conversation (le dossier `brain/<conversation>`)
  cwd: string | null;
  title: string | null;
  // Les messages d'utilisateur qu'Antigravity écrit lui-même, jamais un message de la personne (T63), partent marqués
  // `injecte` (T43), comme tout tour `user`.
  turns: Turn[];
  branche: null; // le transcript n'en porte pas : la capture la lit par git
};

export type AntigravityFile = { path: string; mtime: Date };

const TITLE_FROM_TEXT_MAX = 80;

const StepSchema = z.object({
  step_index: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
  type: z.string(),
  created_at: z.iso.datetime({ offset: true }).optional().catch(undefined),
  content: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
  exit_code: z.number().int().optional().catch(undefined),
});
type Step = z.infer<typeof StepSchema>;
const ToolCallSchema = z.object({ name: z.string(), args: z.unknown().optional() });

function parseSteps(content: string): Step[] {
  return content.split('\n').flatMap((raw) => {
    if (raw.trim() === '') return [];
    try {
      const parsed = StepSchema.safeParse(JSON.parse(raw));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

// `brain/<conversation>/.system_generated/logs/transcript.jsonl` : la conversation est le dossier sous `brain`.
export const conversationOf = (path: string): string => basename(dirname(dirname(dirname(path))));

const tagContent = (text: string, tag: string): string | null => {
  const start = text.indexOf(`<${tag}>`);
  if (start === -1) return null;
  const end = text.indexOf(`</${tag}>`, start);
  return end === -1 ? null : text.slice(start + tag.length + 2, end);
};

const isSubagent = (steps: Step[]) =>
  steps.some((step) => step.type === 'USER_INPUT' && step.content?.includes('<subagent_reminder>'));

// Le message de la personne : le texte entre `<USER_REQUEST>`, sinon tout le texte sans les blocs qu'Antigravity
// ajoute.
function userText(content: string): string {
  const request = tagContent(content, 'USER_REQUEST');
  if (request !== null) return request.trim();
  return ['user_information', 'ADDITIONAL_METADATA', 'subagent_reminder']
    .reduce((kept, tag) => removeBlocks(kept, tag), content)
    .trim();
}

// Le dossier de travail : un `Cwd` d'appel d'outil, sinon le premier chemin de `<user_information>` (« /chemin -> nom »).
function workingDirectory(steps: Step[]): string | null {
  for (const step of steps) {
    for (const call of calls(step)) {
      const cwd = (call.args as { Cwd?: unknown } | null)?.Cwd;
      if (typeof cwd === 'string' && cwd.startsWith('/')) return cwd;
    }
    const info = step.content ? tagContent(step.content, 'user_information') : null;
    const path = info
      ?.split('\n')
      .map((line) => line.split(' -> ')[0]?.trim() ?? '')
      .find((line) => line.startsWith('/'));
    if (path) return path;
  }
  return null;
}

function calls(step: Step): { name: string; args: Record<string, unknown> | null }[] {
  return (step.tool_calls ?? []).flatMap((raw) => {
    const call = ToolCallSchema.safeParse(raw);
    if (!call.success) return [];
    let args = call.data.args;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = null;
      }
    }
    const record =
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : null;
    return [{ name: call.data.name, args: record }];
  });
}

const turnId = (conversation: string, step: Step, index: number) =>
  `${conversation}:${String(step.step_index ?? index).padStart(6, '0')}`;

export function parseAntigravitySession(
  content: string,
  file: AntigravityFile,
): AntigravitySession | null {
  const conversation = conversationOf(file.path);
  const steps = parseSteps(content);
  if (conversation === '' || conversation === '.' || isSubagent(steps)) return null;
  const turns: Turn[] = [];
  for (const [index, step] of steps.entries()) {
    let role: 'user' | 'assistant';
    let text: string;
    if (step.type === 'USER_INPUT') {
      role = 'user';
      text = userText(step.content ?? '');
    } else if (step.type === 'PLANNER_RESPONSE') {
      role = 'assistant';
      text = step.content ?? '';
    } else {
      continue;
    }
    const prepared = prepareTurnText(stripLeonBlocks(text));
    if (prepared === null) continue;
    turns.push({
      external_id: turnId(conversation, step, index),
      role,
      text: prepared,
      ts: step.created_at ?? file.mtime.toISOString(),
      capture_mode: 'file',
      ...(role === 'user'
        ? { injecte: step.source !== undefined && step.source !== 'USER_EXPLICIT' }
        : {}),
    });
  }
  const firstUserText = turns.find(isTypedTurn)?.text;
  return {
    sessionId: conversation,
    cwd: workingDirectory(steps),
    title: firstUserText ? firstUserText.slice(0, TITLE_FROM_TEXT_MAX) : null,
    turns,
    branche: null,
  };
}

// --- Les gestes (C1) -----------------------------------------------------------------------------------------------

// Les outils d'Antigravity relevés à l'essai T31 qui n'apportent rien d'ailleurs (D17). On échoue fermé, comme
// Cursor (#160) : tout autre outil (la recherche web, un outil MCP, une page web, le navigateur, un sous-agent, un outil
// inconnu) rend la session externe, une commande aussi si elle va sur le réseau. Les étapes connues de ces outils
// (EXTERNAL_STEPS) la rendent externe même sans leur appel.
// shortcut: `schedule` compte comme externe tant qu'on ne sait pas ce qu'il fait, à revoir au prochain essai ; un outil
// du serveur MCP de Leon compte encore, jusqu'à T44.
const LOCAL_TOOLS = new Set([
  'run_command',
  'view_file',
  'write_to_file',
  'replace_file_content',
  'grep_search',
  'list_dir',
  'manage_task',
]);
const EXTERNAL_STEPS = /^(?:SEARCH_WEB|CALL_MCP_TOOL|READ_URL_CONTENT|INVOKE_SUBAGENT|BROWSER_.*)$/;
// Les outils qui lisent sans écrire : leurs chemins ne sont pas des fichiers écrits.
const READ_TOOLS = /^(?:view_.*|list_.*|grep_.*|find_.*|codebase_search|search_.*|read_.*)$/;
const EXIT_CODE = /exit code[:\s]+(-?\d+)/i;

export function extractAntigravityFacts(
  content: string,
  file: AntigravityFile,
  root: string | null,
  brancheLue: string | null = null,
): SessionFacts {
  const record = newFactsRecord();
  const steps = parseSteps(content);
  const pending: string[] = []; // les commandes lancées, en attente de leur étape RUN_COMMAND
  let errors = 0;
  let external = false;
  for (const step of steps) {
    if (EXTERNAL_STEPS.test(step.type)) external = true;
    if (step.type === 'RUN_COMMAND') {
      const command = pending.shift();
      if (command === undefined) continue;
      const output = step.content ?? '';
      // Le code de sortie de l'étape (l'IDE l'écrit), sinon celui que cite la sortie.
      const code = step.exit_code ?? EXIT_CODE.exec(output)?.[1];
      const error = code !== undefined && Number(code) !== 0;
      if (error) errors += 1;
      recordCommand(record, command, output, error);
      continue;
    }
    for (const { name, args } of calls(step)) {
      if (!LOCAL_TOOLS.has(name)) external = true;
      const commandLine = args?.CommandLine;
      if (typeof commandLine === 'string') {
        external ||= isExternalCommand(commandLine);
        pending.push(commandLine);
        continue;
      }
      if (READ_TOOLS.test(name)) continue;
      for (const key of ['TargetFile', 'AbsolutePath']) {
        const path = args?.[key];
        if (typeof path === 'string') recordFile(record, path, root);
      }
    }
  }
  // Une commande sans étape de résultat (la conversation coupée) compte quand même, sans erreur.
  for (const command of pending) recordCommand(record, command, '', false);
  const session = parseAntigravitySession(content, file);
  const dates = steps.flatMap((step) => (step.created_at ? [step.created_at] : []));
  return buildFacts(record, {
    links: [],
    branch: brancheLue,
    errors,
    external,
    echanges: session?.turns.filter(isTypedTurn).length ?? 0,
    start: dates[0] ?? null,
    end: dates.at(-1) ?? file.mtime.toISOString(),
  });
}
