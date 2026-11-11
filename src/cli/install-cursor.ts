// Installateur et retrait des crochets de Cursor (T29 du plan mémoire des sessions) : `leon setup` (setup.ts),
// `leon installer-crochets --outil cursor` et `leon retirer-crochets --outil cursor`.
//
// D'après la doc de Cursor (relevée le 02/11, annexe 02 de l'étude), confirmée par l'essai réel T26 du 08/11 (annexe 04) :
// - les crochets de l'utilisateur sont dans `~/.cursor/hooks.json`, forme plate : `{ "version": 1, "hooks": { "<évènement>":
//   [ { "command", "timeout" } ] } }`, une liste d'entrées par évènement, sans groupe ;
// - beforeSubmitPrompt (5 s, `crochet cursor prompt`) : le bloc de démarrage, une fois par conversation (D32 amendé : le
//   premier message ; sessionStart n'est pas attendu par Cursor, l'essai l'a vu ne passer qu'avec un délai ailleurs) ;
// - stop (30 s, `crochet cursor tour`) : la capture, à chaque tour. Pas de sessionEnd, jamais appelé pendant l'essai ;
// - aucune approbation : Cursor a lu le fichier, `timeout` compris, sans rien demander.
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  CATCH_UP_WHEN,
  type Evenement,
  isLeonLauncherCommand,
  launcherCommand,
} from './hook-commands';
import { type InstallDeps, isRecord, type Json } from './install-hooks';
import {
  installToolHooks,
  type ToolHookPlan,
  type ToolInstall,
  uninstallToolHooks,
} from './install-outil';
import { cursorHome } from './outils';
import type { UninstallDeps } from './uninstall-hooks';

export const CURSOR_HOOKS_FILE = 'hooks.json';
export const CURSOR_PROMPT_TIMEOUT_S = 5;
export const CURSOR_TOUR_TIMEOUT_S = 30;

export const cursorHooksPath = (home: string): string => join(cursorHome(home), CURSOR_HOOKS_FILE);

// Le texte de l'accord de Cursor, testé mot pour mot (install-cursor.test.ts). Le changer, c'est changer ce que
// l'utilisateur a accepté.
export const CURSOR_CONSENT_LINES = [
  'What will be sent: these hooks are in your personal Cursor settings, so they run in ALL your Cursor agent conversations, in ALL your folders (personal ones included), in the editor as in the command line.',
  "  - After each turn (stop), the Leon server receives the new exchanges of the conversation (your messages and the agent's answers; the messages Cursor writes itself in your place, such as a subagent's report, labeled as written by Cursor, not by you) and its actions, read from its transcript file: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), the current Git branch, the to-do list, and a few markers (number of messages and failed turns, whether the conversation used the web, an MCP server, a subagent or a network command).",
  `  - What a hook missed ${CATCH_UP_WHEN}. It covers only Cursor conversations changed after you accept, from now on. Cursor's internal databases (state.vscdb) are never read.`,
  '  - Secrets are masked before sending, and again by the server. Each conversation stays private to its author.',
  "  - At your first message in each conversation (beforeSubmitPrompt), the server receives the project key, the current Git branch and the conversation id. It sends back your recent sessions on this repository, from all your tools (their branch, pull requests, commits, files and remaining tasks), and the project's morning briefing: Cursor adds this block to the context of the conversation, so it is given to Cursor's model. It is sent once per conversation.",
];

const AFTER_WRITE = [
  'Cursor reads its hooks file on its own; if the Leon hooks do not run, restart Cursor.',
];

type CursorEvent = 'beforeSubmitPrompt' | 'stop';

export function cursorHooks(
  home: string,
): { event: CursorEvent; evenement: Evenement; entry: Json }[] {
  return [
    {
      event: 'beforeSubmitPrompt',
      evenement: 'prompt',
      entry: {
        command: launcherCommand(home, 'cursor', 'prompt'),
        timeout: CURSOR_PROMPT_TIMEOUT_S,
      },
    },
    {
      event: 'stop',
      evenement: 'tour',
      entry: { command: launcherCommand(home, 'cursor', 'tour'), timeout: CURSOR_TOUR_TIMEOUT_S },
    },
  ];
}

const leonEntry = (entry: unknown) =>
  isRecord(entry) && typeof entry.command === 'string'
    ? isLeonLauncherCommand(entry.command)
    : null;

// Les réglages avec les crochets de Leon, sans modifier l'objet reçu : une entrée de Leon déjà là est mise à jour sur
// place (les doublons partent), sinon elle s'ajoute en fin de la liste de son évènement. null : une forme inconnue
// (une autre version que 1, des listes qui n'en sont pas).
export function addCursorHooks(settings: Json, home: string): ToolHookPlan | null {
  const next = structuredClone(settings);
  if (next.version !== undefined && next.version !== 1) return null;
  next.version = 1;
  const hooksRoot = next.hooks ?? {};
  if (!isRecord(hooksRoot)) return null;
  const changes: ToolHookPlan['changes'] = [];
  for (const { event, evenement, entry: wanted } of cursorHooks(home)) {
    const entries = hooksRoot[event] ?? [];
    if (!Array.isArray(entries)) return null;
    let found = false;
    let changed = false;
    const kept: unknown[] = [];
    for (const entry of entries) {
      const ours = leonEntry(entry);
      if (ours?.outil !== 'cursor' || ours.evenement !== evenement) kept.push(entry);
      else if (found) changed = true;
      else {
        found = true;
        if (!isDeepStrictEqual(entry, wanted)) changed = true;
        kept.push(wanted);
      }
    }
    if (!found) kept.push(wanted);
    hooksRoot[event] = kept;
    changes.push({
      event,
      action: !found ? 'ajout' : changed ? 'mise-a-jour' : 'inchange',
      command: String(wanted.command),
      timeout: Number(wanted.timeout),
    });
  }
  next.hooks = hooksRoot;
  return { next, changes };
}

export async function installCursorHooks(
  options: Pick<ToolInstall, 'home' | 'assumeYes' | 'interactive' | 'decisions'>,
  deps: InstallDeps,
): Promise<number> {
  return installToolHooks(
    {
      ...options,
      outil: 'cursor',
      path: cursorHooksPath(options.home),
      plan: (settings) => addCursorHooks(settings, options.home),
      consentLines: CURSOR_CONSENT_LINES,
      afterWrite: AFTER_WRITE,
    },
    deps,
  );
}

// Les réglages sans aucune entrée de Leon pour Cursor (tous évènements) ; une liste vidée part avec son évènement.
export function removeCursorHooks(settings: Json): { next: Json; removed: string[] } {
  const next = structuredClone(settings);
  const removed: string[] = [];
  if (!isRecord(next.hooks)) return { next, removed };
  for (const [event, entries] of Object.entries(next.hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => {
      const ours = leonEntry(entry)?.outil === 'cursor';
      if (ours) removed.push(`${event} · ${String((entry as Json).command)}`);
      return !ours;
    });
    if (kept.length === entries.length) continue;
    if (kept.length === 0) delete next.hooks[event];
    else next.hooks[event] = kept;
  }
  return { next, removed };
}

export async function uninstallCursorHooks(
  options: { home: string },
  deps: UninstallDeps,
): Promise<number> {
  return uninstallToolHooks(
    { outil: 'cursor', path: cursorHooksPath(options.home), home: options.home },
    removeCursorHooks,
    deps,
  );
}
