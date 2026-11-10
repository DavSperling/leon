// Le lecteur des sessions de Cursor (T27 du plan mémoire des sessions) : ses tours et ses gestes, à partir du transcript
// `~/.cursor/projects/<slug>/agent-transcripts/<conversation>/<conversation>.jsonl`.
//
// D'après les relevés publics du format (Cursor 3.13, sonde Einsia/agent-git `docs/mechanism-probing/cursor-kiro-formats.md` :
// 104 transcripts ; adaptateurs d'agit et d'engram), confirmés par l'essai réel T26 du 08/11 (annexe 04 : la forme seule de
// trois transcripts ; outils vus : Shell `command`, `description` ; Grep `path`, `pattern` ; Glob `glob_pattern`,
// `target_directory`) :
// - deux formes de ligne : `{ role, message: { content: [...] } }` (rôles `user` et `assistant`) et
//   `{ type: "turn_ended", status }` (depuis la 3.13 ; `status` vaut `success`, `error` ou `aborted`) ;
// - blocs : `{ type: "text", text }`, et `{ type: "tool_use", name, input }` côté assistant. Aucune sortie d'outil n'est
//   écrite : ni code de sortie, ni SHA de commit, ni URL de PR ;
// - le message de la personne est dans `<user_query>…</user_query>`, précédé d'un `<timestamp>` en clair et localisé.
//   Cursor injecte aussi des messages en rôle `user` : au retour d'un sous-agent, d'une tâche de fond, d'une branche, et
//   après une interruption (le seul sans `<user_query>`) ;
// - aucune heure côté assistant, ni dossier, ni identifiant dans les lignes : la conversation est le nom du fichier,
//   les tours sont datés à l'heure du fichier (T27), et le dossier vient du crochet (`workspace_roots`) ;
// - le texte que Leon injecte au premier message n'apparaît pas dans le transcript ;
// - les sous-agents écrivent sous `<conversation>/subagents/` : ce ne sont pas des sessions.
import { basename } from 'node:path';
import { z } from 'zod';
import type { SessionFacts } from './api-contract';
import { prepareTurnText, removeBlocks } from './prepare-turn-text';
import {
  buildFacts,
  isExternalCommand,
  newFactsRecord,
  recordCommand,
  recordFile,
  replaceTasks,
} from './session-facts';
import { stripLeonBlocks } from './strip-leon-blocks';
import { isTypedTurn, type Turn } from './turn';

export type CursorSession = {
  sessionId: string; // la conversation (le nom du fichier)
  cwd: string | null; // jamais dans le transcript : le crochet le donne
  title: string | null;
  // Les messages que Cursor injecte en rôle `user`, jamais un message de la personne (T63), sont marqués `injecte`
  // (T43), comme tout tour `user`, et restent sur le poste (captureToolFile).
  turns: Turn[];
  branche: null; // le transcript n'en porte pas : la capture la lit par git
};

// L'heure et la conversation viennent du fichier, que le lecteur ne voit pas.
export type CursorFile = { path: string; mtime: Date };

const TITLE_FROM_TEXT_MAX = 80;

const LineSchema = z.object({
  role: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }).optional(),
});
type Line = z.infer<typeof LineSchema>;
const TextSchema = z.object({ type: z.literal('text'), text: z.string() });
const ToolUseSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string(),
  input: z.unknown(),
});

function parseLines(content: string): Line[] {
  return content.split('\n').flatMap((raw) => {
    if (raw.trim() === '') return [];
    try {
      const parsed = LineSchema.safeParse(JSON.parse(raw));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

const blocks = (line: Line): unknown[] => {
  const content = line.message?.content;
  if (content === undefined) return [];
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
};
const texts = (line: Line): string[] =>
  blocks(line).flatMap((block) => {
    const parsed = TextSchema.safeParse(block);
    return parsed.success ? [parsed.data.text] : [];
  });

// Le texte entre `<user_query>` et `</user_query>`, ou null s'il n'y en a pas.
const USER_QUERY = /<user_query>([\s\S]*?)<\/user_query>/;
// Les débuts des messages que Cursor écrit lui-même dans un `<user_query>` (sonde du 31/07, Cursor 3.13).
// shortcut: les formes connues ; une forme nouvelle compterait comme un message tapé, à relever à chaque essai.
const INJECTED_STARTS = [
  'Perform any necessary follow-up actions in response to the subagent completion above.',
  'Briefly inform the user about the task result',
  'You are the forked subagent; continue executing your task.',
];

type UserText = { kind: 'tape' | 'injecte'; text: string };

// Un message `user` : celui de la personne, ou un message injecté. Sans `<user_query>`, un message ne vient de la
// personne que si le transcript n'en a aucun (une version de Cursor qui n'enveloppe pas encore) : sinon, c'est une
// reprise après interruption, écrite par Cursor.
function userText(raw: string, wrapped: boolean): UserText {
  const query = USER_QUERY.exec(raw)?.[1];
  if (query === undefined) {
    return { kind: wrapped ? 'injecte' : 'tape', text: removeBlocks(raw, 'timestamp') };
  }
  const text = query.trim();
  return {
    kind: INJECTED_STARTS.some((start) => text.startsWith(start)) ? 'injecte' : 'tape',
    text,
  };
}

const conversationOf = (file: CursorFile) => basename(file.path).replace(/\.jsonl$/, '');

// L'identifiant d'un tour : la conversation, puis son rang parmi les messages, complété de zéros (T27). Le transcript ne
// fait que s'allonger : le rang est stable.
const turnId = (conversation: string, rank: number) =>
  `${conversation}:${String(rank).padStart(6, '0')}`;

export function parseCursorSession(content: string, file: CursorFile): CursorSession | null {
  const conversation = conversationOf(file);
  if (conversation === '') return null;
  const lines = parseLines(content);
  const wrapped = lines.some(
    (line) => line.role === 'user' && texts(line).some((text) => USER_QUERY.test(text)),
  );
  const ts = file.mtime.toISOString();
  const turns: Turn[] = [];
  let rank = 0;
  for (const line of lines) {
    if (line.role !== 'user' && line.role !== 'assistant') continue;
    rank += 1;
    const text = texts(line).join('\n\n');
    const user = line.role === 'user' ? userText(text, wrapped) : null;
    const prepared = prepareTurnText(stripLeonBlocks(user?.text ?? text));
    if (prepared === null) continue;
    turns.push({
      external_id: turnId(conversation, rank),
      role: line.role,
      text: prepared,
      ts,
      capture_mode: 'file',
      ...(user === null ? {} : { injecte: user.kind === 'injecte' }),
    });
  }
  const firstUserText = turns.find(isTypedTurn)?.text;
  return {
    sessionId: conversation,
    cwd: null,
    title: firstUserText ? firstUserText.slice(0, TITLE_FROM_TEXT_MAX) : null,
    turns,
    branche: null,
  };
}

// --- Les gestes (C1) -----------------------------------------------------------------------------------------------

// Les outils de Cursor relevés (3.13, et les noms de la 2.4 vus dans state.vscdb) qui n'apportent rien d'ailleurs. On
// échoue fermé : tout autre nom (WebSearch, WebFetch, Task, un outil MCP, un outil inconnu) rend la session externe.
// shortcut: un outil du serveur MCP de Leon compte encore, jusqu'à T44 (lot 12) ; tout sous-agent aussi (T63).
const LOCAL_TOOLS = new Set([
  'Read',
  'Write',
  'StrReplace',
  'ApplyPatch',
  'Delete',
  'Shell',
  'Grep',
  'Glob',
  'LS',
  'ReadLints',
  'EditNotebook',
  'TodoWrite',
  'CreatePlan',
  'SemanticSearch',
  'CodebaseSearch',
  'SwitchMode',
  'AskQuestion',
  'read_file',
  'write',
  'search_replace',
  'apply_patch',
  'edit_file',
  'delete_file',
  'run_terminal_cmd',
  'grep',
  'glob_file_search',
  'list_dir',
  'codebase_search',
  'read_lints',
  'edit_notebook',
  'todo_write',
  'create_plan',
]);
const SHELL_TOOLS = new Set(['Shell', 'run_terminal_cmd']);
const FILE_TOOLS = new Set([
  'Write',
  'StrReplace',
  'Delete',
  'EditNotebook',
  'write',
  'search_replace',
  'edit_file',
  'delete_file',
  'edit_notebook',
]);
const PATCH_TOOLS = new Set(['ApplyPatch', 'apply_patch']);
const TODO_TOOLS = new Set(['TodoWrite', 'todo_write']);

const CommandSchema = z.object({ command: z.string() });
const PathSchema = z.object({
  path: z.string().optional(),
  file_path: z.string().optional(),
  target_file: z.string().optional(),
  target_notebook: z.string().optional(),
});
const TodoSchema = z.object({
  merge: z.boolean().optional(),
  todos: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).optional(),
      content: z.string().optional(),
      status: z.string(),
    }),
  ),
});
const TODO_STATES: Record<string, 'a_faire' | 'en_cours' | 'fait'> = {
  pending: 'a_faire',
  in_progress: 'en_cours',
  completed: 'fait',
};
const PATCH_FILE = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

// Les gestes d'une session Cursor, à partir de son transcript. `root` est la racine du dépôt ; `brancheLue`, la
// branche que lit git à la capture (le transcript n'en porte pas). Sans sortie d'outil dans le transcript, une commande
// n'est jamais marquée en erreur, et ni commit ni PR ne se relèvent : les erreurs sont les tours finis en erreur.
// shortcut: l'essai T26 n'a trouvé aucune sortie d'outil dans le transcript ; relever commits et PR le jour où Cursor
// les écrit.
export function extractCursorFacts(
  content: string,
  file: CursorFile,
  root: string | null,
  brancheLue: string | null = null,
): SessionFacts {
  const record = newFactsRecord();
  const lines = parseLines(content);
  let errors = 0;
  let external = false;
  // TodoWrite réécrit la liste, ou la complète tâche par tâche avec `merge`.
  const todos = new Map<string, { texte: string; etat: 'a_faire' | 'en_cours' | 'fait' }>();
  for (const line of lines) {
    if (line.type === 'turn_ended' && line.status === 'error') errors += 1;
    if (line.role !== 'assistant') continue;
    for (const block of blocks(line)) {
      const tool = ToolUseSchema.safeParse(block);
      if (!tool.success) continue;
      const { name, input } = tool.data;
      if (!LOCAL_TOOLS.has(name)) external = true;
      if (SHELL_TOOLS.has(name)) {
        const command = CommandSchema.safeParse(input);
        if (command.success) {
          external ||= isExternalCommand(command.data.command);
          recordCommand(record, command.data.command, '', false);
        }
      }
      if (FILE_TOOLS.has(name)) {
        const paths = PathSchema.safeParse(input);
        const path = paths.success
          ? (paths.data.path ??
            paths.data.file_path ??
            paths.data.target_file ??
            paths.data.target_notebook)
          : undefined;
        if (path !== undefined) recordFile(record, path, root);
      }
      if (PATCH_TOOLS.has(name)) {
        const patch =
          typeof input === 'string'
            ? input
            : typeof (input as { patch?: unknown } | null)?.patch === 'string'
              ? (input as { patch: string }).patch
              : '';
        for (const [, path] of patch.matchAll(PATCH_FILE)) {
          if (path) recordFile(record, path.trim(), root);
        }
      }
      const todo = TODO_TOOLS.has(name) ? TodoSchema.safeParse(input) : null;
      if (todo?.success) {
        if (!todo.data.merge) todos.clear();
        for (const [index, item] of todo.data.todos.entries()) {
          const key = String(item.id ?? `todo:${index}`);
          const etat = TODO_STATES[item.status];
          const texte = item.content ?? todos.get(key)?.texte;
          if (etat === undefined)
            todos.delete(key); // annulée
          else if (texte !== undefined) todos.set(key, { texte, etat });
        }
        replaceTasks(record, [...todos.values()]);
      }
    }
  }
  const session = parseCursorSession(content, file);
  const fin = file.mtime.toISOString();
  return buildFacts(record, {
    links: [],
    branch: brancheLue,
    errors,
    external,
    echanges: session?.turns.filter(isTypedTurn).length ?? 0,
    start: null,
    end: fin,
  });
}
