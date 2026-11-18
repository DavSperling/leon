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
//   SYSTEM_MESSAGE, GENERIC, RUN_COMMAND, VIEW_FILE, CODE_ACTION, GREP_SEARCH, LIST_DIRECTORY,
//   EPHEMERAL_MESSAGE ; outils vus : run_command, view_file, write_to_file, replace_file_content, grep_search, list_dir, manage_task, schedule ;
// - le message que le crochet injecte (`ephemeralMessage`) n'y laisse aucune trace en 2.0.1 ; en 2.0.6 il s'écrit en
//   EPHEMERAL_MESSAGE, que ce lecteur ignore (seuls USER_INPUT et PLANNER_RESPONSE font des tours).
// shortcut: `manage_task` (la liste de tâches de l'agent) n'est pas encore lu, faute d'avoir relevé la forme de ses
// arguments ; à relever au prochain essai (le rapport du témoin la donne) pour remplir `taches`.
// - une étape par ligne : `{ step_index, source, type, created_at, content, thinking?, tool_calls? }`, où `tool_calls`
//   est une liste `{ name, args }` (`args` en objet ou en chaîne JSON) ;
// - `USER_INPUT` (source `USER_EXPLICIT`) : le message de la personne, entre `<USER_REQUEST>` et `</USER_REQUEST>`, à
//   côté de blocs qu'Antigravity ajoute (`<user_information>`, `<ADDITIONAL_METADATA>`) ;
// - `PLANNER_RESPONSE` : la réponse du modèle (`content`), sa pensée (`thinking`, qui ne part qu'en coulisses) et ses
//   appels d'outils ;
// - `CONVERSATION_HISTORY`, `CHECKPOINT`, `SYSTEM_MESSAGE` : ignorés ; les autres (`RUN_COMMAND`, `VIEW_FILE`,
//   `SEARCH_WEB`, `CALL_MCP_TOOL`, `INVOKE_SUBAGENT`…) sont les résultats des outils ;
// - un sous-agent a sa propre conversation, dont le premier message porte `<subagent_reminder>` : ce n'est pas une
//   session de la personne.
// L'appli 2.31.0 (annexe 11, essai du 13/11) : plus d'étape RUN_COMMAND ni de code de sortie, le résultat d'un appel est
// une étape GENERIC en `status` DONE ou ERROR ; la conversation d'un sous-agent commence par un SYSTEM_MESSAGE (sa
// consigne), et la session nomme ses sous-agents (chargés par la CLI : subagents.ts). Le message d'un sous-agent à la
// session (send_message, dans la conversation du sous-agent) part en tour injecté : antigravityReportTurns.
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import type { CoulisseBloc, SessionFacts } from './api-contract';
import { prepareTurnText, removeBlocks } from './prepare-turn-text';
import { collecteur, finishBlocs, prepare, target } from './session-backstage';
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
  // `injecte` (T43), comme tout tour `user`. Les messages des sous-agents n'y sont pas : antigravityReportTurns.
  turns: Turn[];
  branche: null; // le transcript n'en porte pas : la capture la lit par git
};

export type AntigravityFile = { path: string; mtime: Date };

// Les sous-agents d'une session (T63 amendé le 17/11, chargés par la CLI : loadAntigravitySubagents) : `named`, pour
// chaque conversation lue (la session comprise), les identifiants des sous-agents qu'elle nomme ; `transcripts`, la
// conversation de chaque sous-agent qui se lit (son `transcript_full.jsonl`, jamais décodé). Ils décident de `externe`
// et des coulisses, et donnent les tours de leurs messages à la session (antigravityReportTurns).
export type AntigravitySubagents = {
  named: ReadonlyMap<string, readonly string[]>;
  transcripts: ReadonlyMap<string, string>;
};

const TITLE_FROM_TEXT_MAX = 80;

const StepSchema = z.object({
  step_index: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
  type: z.string(),
  status: z.string().optional().catch(undefined), // DONE ou ERROR (2.31.0)
  created_at: z.iso.datetime({ offset: true }).optional().catch(undefined),
  content: z.string().optional(),
  thinking: z.string().optional().catch(undefined),
  tool_calls: z.array(z.unknown()).optional(),
  exit_code: z.number().int().optional().catch(undefined),
});
type Step = z.infer<typeof StepSchema>;
const ToolCallSchema = z.object({ name: z.string(), args: z.unknown().optional() });

// Une étape, ou null si la ligne ne se lit pas.
function parseStep(raw: string): Step | null {
  try {
    const parsed = StepSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const parseSteps = (content: string): Step[] =>
  content.split('\n').flatMap((raw) => (raw.trim() === '' ? [] : (parseStep(raw) ?? [])));

// Les étapes de la conversation d'un sous-agent, ou null si elle manque, porte une ligne illisible, ou n'est pas celle
// d'un sous-agent (isSubagent : une conversation ordinaire qu'une fiche nommerait).
function subagentSteps(content: string | undefined): Step[] | null {
  if (content === undefined) return null;
  const steps: Step[] = [];
  for (const raw of content.split('\n')) {
    if (raw.trim() === '') continue;
    const step = parseStep(raw);
    if (step === null) return null;
    steps.push(step);
  }
  return isSubagent(steps) ? steps : null;
}

// Les étapes d'un sous-agent qui a rendu la main (annexe 11) : sa dernière étape est une PLANNER_RESPONSE sans appel
// d'outil. null si sa conversation ne se lit pas (subagentSteps), ou s'il n'a pas fini : on ne sait pas tout ce qu'il
// a fait (échec fermé).
function finishedSubagent(content: string | undefined): Step[] | null {
  const steps = subagentSteps(content);
  const last = steps?.at(-1);
  return last?.type === 'PLANNER_RESPONSE' && !last.tool_calls?.length ? steps : null;
}

// `brain/<conversation>/.system_generated/logs/transcript.jsonl` : la conversation est le dossier sous `brain`.
export const conversationOf = (path: string): string => basename(dirname(dirname(dirname(path))));

const tagContent = (text: string, tag: string): string | null => {
  const start = text.indexOf(`<${tag}>`);
  if (start === -1) return null;
  const end = text.indexOf(`</${tag}>`, start);
  return end === -1 ? null : text.slice(start + tag.length + 2, end);
};

// La conversation d'un sous-agent : sa première étape est sa consigne, un SYSTEM_MESSAGE (2.31.0), ou un message qui
// porte `<subagent_reminder>` (l'ancienne forme).
const isSubagent = (steps: Step[]) =>
  steps[0]?.type === 'SYSTEM_MESSAGE' ||
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

type Call = { name: string; args: Record<string, unknown> | null };

// Les appels d'une étape, avec leurs `args` tels que l'étape les donne (sessionSteps les a déjà décodés). Des `args`
// en une seule chaîne JSON sont d'abord parsés.
function calls(step: Step): Call[] {
  return (step.tool_calls ?? []).map((raw) => {
    const call = ToolCallSchema.safeParse(raw);
    // Hors de la forme { name, args }, l'appel garde son rang, sans nom : un outil inconnu (échec fermé).
    if (!call.success) return { name: '', args: null };
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
    // Une chaîne qui ne se lit pas en objet (coupée ?) : un outil inconnu aussi, sinon une commande y disparaîtrait.
    if (typeof call.data.args === 'string' && record === null) return { name: '', args: null };
    return { name: call.data.name, args: record };
  });
}

// Un appel lu dans `transcript.jsonl` (annexe 11). Toutes ses valeurs sont du texte JSON (2.31.0, où une chaîne est
// écrite entre guillemets) : ses chaînes sont décodées, un nombre ou `true` restent des chaînes, qu'aucun lecteur
// n'utilise. Sinon, une valeur, n'importe laquelle, qui commence par un guillemet (l'appel a l'air écrit en JSON,
// mais une valeur ne se décode pas : coupée ?) le rend illisible : un outil inconnu, comme un appel hors forme (échec
// fermé). Sinon, la forme nue de l'ancienne appli (2.0.1) : tel quel.
// shortcut: une valeur nue de la 2.0.1 qui commence par un guillemet (`"./a b.sh" --x`) rend aussi son appel illisible,
// donc la session externe ; à revoir si une session de la 2.0.1 se capte encore.
function decoded(call: Call): Call {
  if (call.args === null) return call;
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(call.args)) {
    let json: unknown;
    try {
      json = typeof value === 'string' ? JSON.parse(value) : undefined; // JSON.parse ne rend jamais undefined
    } catch {
      json = undefined;
    }
    if (json === undefined) {
      const encoded = Object.values(call.args).some(
        (other) => typeof other === 'string' && other.startsWith('"'),
      );
      return encoded ? { name: '', args: null } : call;
    }
    args[key] = typeof json === 'string' ? json : value;
  }
  return { name: call.name, args };
}

// Les étapes de la session. La forme des `args` se décide d'après le fichier lu : dans `transcript_full.jsonl`, les
// valeurs ont leur type et ne sont jamais décodées ; dans un autre (`transcript.jsonl`), chaque appel passe par
// decoded, sinon un chemin hors du dépôt y passerait pour un chemin du dépôt, un secret ne se masquerait pas, une
// commande réseau passerait pour locale. Les sous-agents ne se lisent que dans `transcript_full.jsonl` (subagents.ts).
function sessionSteps(content: string, file: AntigravityFile): Step[] {
  const steps = parseSteps(content);
  if (basename(file.path) === 'transcript_full.jsonl') return steps;
  return steps.map((step) =>
    step.tool_calls === undefined ? step : { ...step, tool_calls: calls(step).map(decoded) },
  );
}

type CallWithResult = Call & { step: Step; index: number; rang: number; result?: Step };

// Les appels d'outils, chacun avec l'étape de son résultat (T52 amendé le 17/11, annexe 11) : après une étape à k
// appels, les k étapes suivantes de source MODEL qui ne sont pas des PLANNER_RESPONSE, dans l'ordre (en 2.31.0 des
// GENERIC, avant des RUN_COMMAND, VIEW_FILE…). La PLANNER_RESPONSE suivante clôt l'attente : un appel resté sans étape
// est sans résultat. `index` : le rang de l'étape lue, quand elle n'a pas de `step_index`.
function callsWithResults(steps: Step[]): CallWithResult[] {
  const all: CallWithResult[] = [];
  let waiting: CallWithResult[] = [];
  for (const [index, step] of steps.entries()) {
    if (step.type === 'PLANNER_RESPONSE') {
      waiting = calls(step).map((call, rang) => ({ ...call, step, index, rang }));
      all.push(...waiting);
    } else if (step.source === 'MODEL') {
      const call = waiting.shift();
      if (call) call.result = step;
    }
  }
  return all;
}

// Les messages d'un sous-agent à la conversation qui l'a lancé (annexe 11) : ses appels send_message dont le `Recipient`
// est l'identifiant de cette conversation, exactement (un sous-agent ne se lit que dans `transcript_full.jsonl`, où rien
// n'est entre guillemets). Le tour de chaque message (antigravityReportTurns) et le bloc rapport des coulisses en
// partent.
const messagesTo = (parent: string, steps: Step[]) =>
  callsWithResults(steps).filter(
    ({ name, args }) => name === 'send_message' && args?.Recipient === parent,
  );

const turnId = (conversation: string, step: Step, index: number) =>
  `${conversation}:${String(step.step_index ?? index).padStart(6, '0')}`;

export function parseAntigravitySession(
  content: string,
  file: AntigravityFile,
): AntigravitySession | null {
  const conversation = conversationOf(file.path);
  const steps = sessionSteps(content, file);
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
      // Échec fermé : une étape sans `source`, format inconnu, ne passe jamais pour un message tapé.
      ...(role === 'user' ? { injecte: step.source !== 'USER_EXPLICIT' } : {}),
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

const EXTERNAL_ID_MAX = 200; // celui du contrat (TurnSchema)

// Le message de chaque sous-agent direct de la session (décision d'Amos du 17/11, « comme Claude Code ») : un tour
// `user` marqué injecté (T43), écrit par Antigravity, qui part sous l'accord de base. Le message d'un sous-agent de
// sous-agent va à son parent, pas à la session. Un sous-agent qui n'a pas fini donne les messages qu'il a déjà
// envoyés : la session les a reçus. Un envoi dont l'étape de résultat est en ERROR, elle ne l'a pas reçu : aucun tour.
// Rien d'autre de sa conversation (sa consigne, son raisonnement, ses appels et leurs sorties), ni le texte des étapes
// SYSTEM_MESSAGE de la session (jamais relevé). Ces tours viennent d'autres fichiers que celui de la session : la CLI
// les envoie à part de ses tours (captureToolFile). Identifiant : la session, le sous-agent, le rang de l'étape, celui
// de l'appel dans l'étape.
export function antigravityReportTurns(
  file: AntigravityFile,
  subagents: AntigravitySubagents,
): Turn[] {
  const session = conversationOf(file.path);
  const turns: Turn[] = [];
  const seen = new Set<string>();
  for (const child of subagents.named.get(session) ?? []) {
    const steps = subagentSteps(subagents.transcripts.get(child));
    for (const { args, step, index, rang, result } of steps === null
      ? []
      : messagesTo(session, steps)) {
      if (result?.status === 'ERROR') continue;
      const message = args?.Message;
      const text = typeof message === 'string' ? prepareTurnText(stripLeonBlocks(message)) : null;
      const external_id = `${session}:${child}:${step.step_index ?? index}:${rang}`;
      // Un identifiant trop long ferait refuser tout le lot par le serveur.
      if (text === null || external_id.length > EXTERNAL_ID_MAX || seen.has(external_id)) continue;
      seen.add(external_id);
      turns.push({
        external_id,
        role: 'user',
        text,
        ts: step.created_at ?? file.mtime.toISOString(),
        capture_mode: 'file',
        injecte: true,
      });
    }
  }
  return turns;
}

// --- Les gestes (C1) -----------------------------------------------------------------------------------------------

// Les outils d'Antigravity relevés aux essais (T31, annexe 11) qui n'apportent rien d'ailleurs (D17). On échoue fermé,
// comme Cursor (#160) : tout autre outil (la recherche web, un outil MCP, une page web, le navigateur, un outil inconnu)
// rend la session externe, une commande aussi si elle va sur le réseau. Les étapes connues de ces outils
// (EXTERNAL_STEPS) la rendent externe même sans leur appel. `send_message` ne parle qu'à un sous-agent ou à son parent ;
// `invoke_subagent` se juge sur la conversation de son sous-agent (T63 : isExternal).
// shortcut: `schedule` compte comme externe tant qu'on ne sait pas ce qu'il fait, à revoir au prochain essai.
// shortcut: un outil du serveur MCP de Leon compte encore, même local (D36) : ni la forme d'un appel MCP dans le
// transcript (l'étape CALL_MCP_TOOL ne dit pas le serveur) ni la configuration MCP d'Antigravity ne sont relevées
// (T44 ; leon-mcp.ts). Les relever au prochain essai, avec l'URL que pose l'installation du connecteur.
const LOCAL_TOOLS = new Set([
  'run_command',
  'view_file',
  'read_file', // le nom de view_file en 2.31.0
  'write_to_file',
  'replace_file_content',
  'grep_search',
  'list_dir',
  'manage_task',
  'send_message',
]);
const EXTERNAL_STEPS = /^(?:SEARCH_WEB|CALL_MCP_TOOL|READ_URL_CONTENT|INVOKE_SUBAGENT|BROWSER_.*)$/;
// Les outils qui lisent sans écrire : leurs chemins ne sont pas des fichiers écrits.
const READ_TOOLS = /^(?:view_.*|list_.*|grep_.*|find_.*|codebase_search|search_.*|read_.*)$/;
const EXIT_CODE = /exit code[:\s]+(-?\d+)/i;

// Une commande a échoué si son étape de résultat est en ERROR (2.31.0 : un refus l'est), ou si son code de sortie (que
// l'IDE écrivait dans l'étape, sinon celui que cite la sortie) n'est pas nul.
function failed(result: Step, output: string): boolean {
  const code = result.exit_code ?? EXIT_CODE.exec(output)?.[1];
  return result.status === 'ERROR' || (code !== undefined && Number(code) !== 0);
}

// Une conversation, la session comme un sous-agent, est externe si l'un de ses appels l'est ; ses appels
// `invoke_subagent` se jugent sur ses sous-agents nommés (T63 amendé le 17/11) : moins de sous-agents nommés que
// d'appels, ou un sous-agent externe, la rendent externe. `visited` : les conversations déjà jugées.
function isExternal(
  id: string,
  steps: Step[],
  subagents: AntigravitySubagents | undefined,
  visited: Set<string>,
): boolean {
  let invoked = 0;
  for (const step of steps) {
    if (EXTERNAL_STEPS.test(step.type)) return true;
    for (const { name, args } of calls(step)) {
      if (name === 'invoke_subagent') invoked += 1;
      else if (!LOCAL_TOOLS.has(name)) return true;
      const commandLine = args?.CommandLine;
      if (typeof commandLine === 'string' && isExternalCommand(commandLine)) return true;
    }
  }
  const named = subagents?.named.get(id) ?? [];
  return (
    named.length < invoked || named.some((child) => isExternalSubagent(child, subagents, visited))
  );
}

// Un sous-agent rend la session externe si sa conversation manque, porte une ligne illisible, s'il n'a pas rendu la
// main (finishedSubagent), ou si l'un de ses appels l'est, par la même règle. Une conversation revue n'apporte rien de
// plus : si elle était externe, la session l'est déjà.
function isExternalSubagent(
  id: string,
  subagents: AntigravitySubagents | undefined,
  visited: Set<string>,
): boolean {
  if (visited.has(id)) return false;
  visited.add(id);
  const steps = finishedSubagent(subagents?.transcripts.get(id));
  return steps === null || isExternal(id, steps, subagents, visited);
}

// `subagents` : les sous-agents de la session (loadAntigravitySubagents), qui ne décident que de `externe` ; sans eux,
// un appel invoke_subagent rend la session externe.
export function extractAntigravityFacts(
  content: string,
  file: AntigravityFile,
  root: string | null,
  brancheLue: string | null = null,
  subagents?: AntigravitySubagents,
): SessionFacts {
  const record = newFactsRecord();
  const steps = sessionSteps(content, file);
  let errors = 0;
  for (const { name, args, result } of callsWithResults(steps)) {
    const commandLine = args?.CommandLine;
    if (typeof commandLine === 'string') {
      // Une commande sans étape de résultat (la conversation coupée) compte quand même, sans erreur.
      const output = result?.content ?? '';
      const error = result !== undefined && failed(result, output);
      if (error) errors += 1;
      recordCommand(record, commandLine, output, error);
      continue;
    }
    if (READ_TOOLS.test(name)) continue;
    for (const key of ['TargetFile', 'AbsolutePath']) {
      const path = args?.[key];
      if (typeof path === 'string') recordFile(record, path, root);
    }
  }
  const conversation = conversationOf(file.path);
  const session = parseAntigravitySession(content, file);
  const dates = steps.flatMap((step) => (step.created_at ? [step.created_at] : []));
  return buildFacts(record, {
    links: [],
    branch: brancheLue,
    errors,
    external: isExternal(conversation, steps, subagents, new Set([conversation])),
    echanges: session?.turns.filter(isTypedTurn).length ?? 0,
    start: dates[0] ?? null,
    end: dates.at(-1) ?? file.mtime.toISOString(),
  });
}

// --- Les coulisses (T52 amendé le 17/11, C10) -----------------------------------------------------------------------

// Le nom commun de chaque outil connu (C10 amendé le 17/11) : le serveur ne garde une cible que sous les noms de Claude
// Code. Un outil connu sans nom commun garde le sien, sans cible ; un nom inconnu (un outil MCP, peut-être) part en
// `[outil]`.
const TOOL_NAMES = new Map([
  ['run_command', 'Bash'],
  ['read_file', 'Read'],
  ['view_file', 'Read'],
  ['write_to_file', 'Write'],
  ['replace_file_content', 'Edit'],
  // shortcut: le nom de leur argument de chemin n'est pas relevé (annexe 11) : sans cible jusqu'au prochain essai.
  ['grep_search', 'Grep'],
  ['list_dir', 'LS'],
  ...[
    'invoke_subagent',
    'send_message',
    'manage_task',
    'search_web',
    'read_url_content',
    'webview_browser',
    'schedule',
  ].map((name) => [name, name] as const),
]);
// Le chemin d'un outil de fichier. `Path` est le nom relevé pour read_file (annexe 11) ; les faits ne le lisent pas
// (READ_TOOLS écarte read_file avant), ils n'ont que TargetFile et AbsolutePath.
const PATH_KEYS = ['TargetFile', 'AbsolutePath', 'Path'];

// Une commande se juge comme dans les faits (failed) ; un autre outil sur le seul `status`, sa sortie pouvant citer un
// « exit code ».
const statut = (result: Step | undefined, command: boolean) =>
  result === undefined
    ? 'sans_resultat'
    : (command ? failed(result, result.content ?? '') : result.status === 'ERROR')
      ? 'erreur'
      : 'ok';

// Les coulisses d'une session Antigravity, dans l'ordre du temps : le raisonnement de la session (`thinking`, le texte
// entier), chaque appel d'outil réduit (nom commun, cible réduite, statut lu sur son étape de résultat), la consigne
// (`Prompt` de invoke_subagent) et le rapport de chaque sous-agent, et les appels des sous-agents qui ont rendu la
// main. Jamais la sortie d'un outil : l'étape de résultat ne sert qu'au statut. Identifiants (C10 amendé le 17/11) : le
// rang de l'étape, puis celui de l'appel dans l'étape, précédés de l'identifiant du sous-agent pour les siens.
export function extractAntigravityBackstage(
  content: string,
  file: AntigravityFile,
  root: string | null,
  subagents: AntigravitySubagents,
): CoulisseBloc[] {
  const { blocs, push } = collecteur();
  const tsOf = (step: Step) => step.created_at ?? file.mtime.toISOString();
  const session = conversationOf(file.path);
  const visited = new Set([session]);

  // `prefix` : vide pour la session, l'identifiant du sous-agent suivi de « : » pour un sous-agent.
  function read(id: string, steps: Step[], prefix: string): void {
    // Le raisonnement d'un sous-agent ne part pas (D29).
    for (const [index, step] of steps.entries()) {
      const texte =
        prefix === '' && step.type === 'PLANNER_RESPONSE' && step.thinking !== undefined
          ? prepare(step.thinking)
          : null;
      if (texte !== null)
        push({ role: 'raisonnement', id: String(step.step_index ?? index), ts: tsOf(step), texte });
    }
    for (const { name, args, step, index, rang, result } of callsWithResults(steps)) {
      if (name === '') continue; // un appel hors forme ne part pas (D29)
      const callId = `${prefix}${step.step_index ?? index}:${rang}`;
      const outil = TOOL_NAMES.get(name) ?? '[outil]';
      const path = PATH_KEYS.map((key) => args?.[key]).find((value) => typeof value === 'string');
      const cible = target(outil, { command: args?.CommandLine, file_path: path }, root);
      const ts = tsOf(step);
      push({
        role: 'appel_outil',
        id: callId,
        ts,
        outil,
        ...(cible === undefined ? {} : { cible }),
        statut: statut(result, typeof args?.CommandLine === 'string'),
      });
      const prompt = name === 'invoke_subagent' ? args?.Prompt : undefined;
      const consigne = typeof prompt === 'string' ? prepare(prompt) : null;
      if (consigne !== null)
        push({
          role: 'sous_agent',
          id: `${callId}:consigne`,
          ts,
          partie: 'consigne',
          texte: consigne,
        });
    }
    for (const child of subagents.named.get(id) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      // Un sous-agent qui n'a pas rendu la main, ou ne se lit pas : ni rapport, ni appels.
      const childSteps = finishedSubagent(subagents.transcripts.get(child));
      if (childSteps === null) continue;
      read(child, childSteps, `${child}:`);
      // Le rapport : le Message du dernier send_message vers la conversation qui l'a lancé, le sous-agent fini.
      const report = messagesTo(id, childSteps).at(-1);
      const message = report?.args?.Message;
      const texte = typeof message === 'string' ? prepare(message) : null;
      if (report && texte !== null)
        push({
          role: 'sous_agent',
          id: `${child}:rapport`,
          ts: tsOf(report.step),
          partie: 'rapport',
          texte,
        });
    }
  }

  read(session, sessionSteps(content, file), '');
  return finishBlocs(blocs);
}
