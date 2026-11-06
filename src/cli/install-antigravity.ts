// Installateur et retrait des crochets d'Antigravity (T34 du plan mémoire des sessions) : `leon setup` (setup.ts),
// `leon installer-crochets --outil antigravity` et `leon retirer-crochets --outil antigravity`.
//
// shortcut: écrit avant l'essai réel T31, d'après le plan, l'annexe 02 de l'étude et la forme des `hooks.json` d'`agy`
// 1.4 (alexherrero/crickets) ; à recaler sur l'annexe 05 (évènements présents, délais, approbation) :
// - `~/.gemini/config/hooks.json` est un objet d'entrées nommées : `{ "<nom>": { "<Évènement>": [ { "type": "command",
//   "command", "timeout" } ], "enabled": true } }`. Seule l'entrée nommée `leon` est touchée ;
// - SessionStart (10 s, `crochet antigravity demarrage`) et PreInvocation (10 s, `crochet antigravity prompt`) donnent le
//   bloc, une fois par conversation : SessionStart manquait au binaire 2.0.6, PreInvocation le remplace alors ;
// - Stop (30 s, `crochet antigravity tour`) capte, une fois la conversation inactive (`fullyIdle`) ;
// - une entrée mal formée a fait ignorer tout le fichier par `agy` 1.4 (relevé par la communauté) : celle de Leon a
//   toujours la forme complète, et un fichier que `JSON.parse` refuse (du JSON avec commentaires) n'est jamais réécrit.
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { type Evenement, launcherCommand } from './hook-commands';
import { type InstallDeps, isRecord, type Json } from './install-hooks';
import { installToolHooks, type ToolHookPlan, uninstallToolHooks } from './install-outil';
import { geminiHome } from './outils';
import type { UninstallDeps } from './uninstall-hooks';

export const ANTIGRAVITY_ENTRY = 'leon';
export const ANTIGRAVITY_START_TIMEOUT_S = 10;
export const ANTIGRAVITY_TOUR_TIMEOUT_S = 30;

export const antigravityHooksPath = (home: string): string =>
  join(geminiHome(home), 'config', 'hooks.json');

// Le texte de l'accord d'Antigravity, testé mot pour mot (install-antigravity.test.ts). Le changer, c'est changer ce
// que l'utilisateur a accepté.
export const ANTIGRAVITY_CONSENT_LINES = [
  'What will be sent: these hooks are in your personal Antigravity settings, so they run in ALL your Antigravity conversations (the app, the IDE and the `agy` command line), in ALL your folders (personal ones included).',
  "  - When a conversation is idle again (Stop), the Leon server receives its new exchanges (your requests and the agent's answers, not the context Antigravity adds itself) and its actions, read from its transcript file: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), the current Git branch, and a few markers (start and end times, number of messages and failed commands, whether the conversation searched the web, used an MCP server, a subagent or a network command).",
  '  - What a hook missed is sent when a Claude Code, Codex, Cursor or Antigravity session starts on this computer, in the background: only Antigravity conversations changed after you accept, from now on. The conversation files of Antigravity (.pb) and its databases are never read.',
  '  - Secrets are masked before sending, and again by the server. Each conversation stays private to its author.',
  "  - At the start of each conversation (SessionStart, or before the first model call: PreInvocation), the server receives the project key, the current Git branch and the conversation id. It sends back your recent sessions on this repository, from all your tools (their branch, pull requests, commits, files and remaining tasks), and the project's morning briefing: Antigravity adds this block to the conversation, so it is given to Antigravity's model. It is sent once per conversation.",
];

const AFTER_WRITE = [
  'Antigravity reads this file when it starts: restart the app, the IDE or `agy` for the Leon hooks to run.',
];

type AntigravityEvent = 'SessionStart' | 'PreInvocation' | 'Stop';

export function antigravityHooks(home: string): {
  event: AntigravityEvent;
  evenement: Evenement;
  handler: Json;
}[] {
  const handler = (evenement: Evenement, timeout: number) => ({
    type: 'command',
    command: launcherCommand(home, 'antigravity', evenement),
    timeout,
  });
  return [
    {
      event: 'SessionStart',
      evenement: 'demarrage',
      handler: handler('demarrage', ANTIGRAVITY_START_TIMEOUT_S),
    },
    {
      event: 'PreInvocation',
      evenement: 'prompt',
      handler: handler('prompt', ANTIGRAVITY_START_TIMEOUT_S),
    },
    { event: 'Stop', evenement: 'tour', handler: handler('tour', ANTIGRAVITY_TOUR_TIMEOUT_S) },
  ];
}

// Les réglages avec l'entrée `leon` telle que Leon la veut, sans modifier l'objet reçu ni les autres entrées. null : une
// forme inconnue (le fichier n'est pas un objet d'entrées).
export function addAntigravityHooks(settings: Json, home: string): ToolHookPlan | null {
  const next = structuredClone(settings);
  const current = next[ANTIGRAVITY_ENTRY];
  if (current !== undefined && !isRecord(current)) return null;
  const wanted: Json = { enabled: true };
  const changes: ToolHookPlan['changes'] = [];
  for (const { event, handler } of antigravityHooks(home)) {
    wanted[event] = [handler];
    const before = current?.[event];
    changes.push({
      event,
      action:
        before === undefined
          ? 'ajout'
          : isDeepStrictEqual(before, [handler])
            ? 'inchange'
            : 'mise-a-jour',
      command: String(handler.command),
      timeout: Number(handler.timeout),
    });
  }
  // Une entrée `leon` qui porte autre chose (un évènement de plus, `enabled` à faux) est remise à sa forme.
  if (current !== undefined && !isDeepStrictEqual(current, wanted)) {
    for (const change of changes) if (change.action === 'inchange') change.action = 'mise-a-jour';
  }
  next[ANTIGRAVITY_ENTRY] = wanted;
  return { next, changes };
}

export async function installAntigravityHooks(
  options: { home: string; assumeYes: boolean },
  deps: InstallDeps,
): Promise<number> {
  return installToolHooks(
    {
      outil: 'antigravity',
      path: antigravityHooksPath(options.home),
      home: options.home,
      assumeYes: options.assumeYes,
      plan: (settings) => addAntigravityHooks(settings, options.home),
      consentLines: ANTIGRAVITY_CONSENT_LINES,
      afterWrite: AFTER_WRITE,
    },
    deps,
  );
}

export function removeAntigravityHooks(settings: Json): { next: Json; removed: string[] } {
  const next = structuredClone(settings);
  const entry = next[ANTIGRAVITY_ENTRY];
  if (entry === undefined) return { next, removed: [] };
  delete next[ANTIGRAVITY_ENTRY];
  const removed = isRecord(entry)
    ? Object.entries(entry).flatMap(([event, handlers]) =>
        Array.isArray(handlers)
          ? handlers.map(
              (handler) => `${event} · ${String(isRecord(handler) ? handler.command : '')}`,
            )
          : [],
      )
    : [];
  return { next, removed: removed.length > 0 ? removed : [`entry ${ANTIGRAVITY_ENTRY}`] };
}

export async function uninstallAntigravityHooks(
  options: { home: string },
  deps: UninstallDeps,
): Promise<number> {
  return uninstallToolHooks(
    { outil: 'antigravity', path: antigravityHooksPath(options.home), home: options.home },
    removeAntigravityHooks,
    deps,
  );
}
