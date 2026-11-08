// Installateur et retrait des crochets de Codex (T17 et T20 du plan mémoire des sessions) : `leon installer-crochets
// --outil codex`, `leon setup` (setup.ts) et `leon retirer-crochets --outil codex`. Le démarrage (lot 4) : Codex reçoit
// le bloc de mes sessions récentes sur le dépôt. La capture (lot 5) : Stop, en tâche de fond, envoie les échanges
// nouveaux et les gestes de la session à chaque tour ; SessionEnd, quand Codex le lance (`codex exec`, pas `/quit`
// dans le terminal : annexe 03), envoie la fin. L'accord de capture se date à part (`capture_le`, consent.ts).
//
// Doc officielle (https://learn.chatgpt.com/docs/hooks, lue le 06/11) et essai réel du 06/11 (annexe 03-essai-codex) :
// - les crochets de l'utilisateur sont dans `${CODEX_HOME:-~/.codex}/hooks.json` : `hooks.<Évènement>` est une liste
//   de groupes `{ matcher?, hooks: [ { type: "command", command, timeout, additionalContextLimit } ] }`, comme Claude
//   Code. Codex lit aussi des tables `[[hooks.*]]` dans `config.toml` : on ne les touche pas, on avertit ;
// - un crochet ne tourne qu'une fois approuvé par `/hooks` (ou « Review hooks » dans l'app). L'empreinte porte sur sa
//   définition, et sa clé sur sa position (`<fichier>:session_start:<groupe>:<crochet>`) : on ajoute en fin de liste
//   pour ne pas déplacer, donc désapprouver, les crochets de l'utilisateur, ni le crochet de démarrage déjà approuvé.
//   Seuls Stop et SessionEnd, nouveaux, demandent alors une approbation ;
// - code de Codex 0.167 (codex-rs/protocol/src/hooks.rs, codex-rs/hooks/src/engine/discovery.rs) : `async: true` fait
//   tourner un crochet en tâche de fond, sauf SessionEnd (toujours attendu) ; le délai de SessionEnd est plafonné à
//   3 s, d'où la fin détachée dans le lanceur (launcher.ts) ; `additionalContextLimit` ne vaut que pour le démarrage. Un script modifié après l'approbation tourne
//   toujours : les mises à jour de Leon ne redemandent rien tant que la commande et ses options ne changent pas ;
// - au-delà d'environ 2 500 jetons, Codex tronque la sortie et l'écrit en entier sur le disque. Le bloc fait 8 000
//   octets au plus, donc 8 000 jetons au plus : `additionalContextLimit: 8000` ne le tronque jamais (D31).
//
// Comme l'installateur de Claude Code : seules les entrées de Leon sont touchées (isLeonLauncherCommand), un fichier
// illisible n'est jamais réécrit, l'écriture est atomique et refusée si le fichier a changé pendant la question, et
// l'accord (`outils.codex`, version 2) s'écrit après la confirmation.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  consentPath,
  FACTS_VERSION,
  factsConsent,
  recordCapture,
  withdrawalRecorded,
  writeConsent,
} from './consent';
import { type Evenement, isLeonLauncherCommand, launcherCommand } from './hook-commands';
import {
  errorCode,
  type InstallDeps,
  isLeonHandler,
  isRecord,
  isYes,
  type Json,
  load,
  parseSettings,
  writeAtomically,
} from './install-hooks';
import { removeUnusedLauncher, type UninstallDeps } from './uninstall-hooks';

export const CODEX_HOOKS_FILE = 'hooks.json';
// Le même délai que Claude Code : 7,5 s au pire pour la commande (briefing.ts).
export const CODEX_START_TIMEOUT_S = 10;
export const CODEX_CONTEXT_LIMIT = 8000;
// Stop tourne en tâche de fond : 60 s pour la capture (15 s de réseau, capture-session.ts). SessionEnd : le plafond de
// Codex, 3 s ; le lanceur rend la main avant node.
export const CODEX_TOUR_TIMEOUT_S = 60;
export const CODEX_FIN_TIMEOUT_S = 3;

// Le dossier de Codex (CODEX_HOME, sinon ~/.codex), défini avec son adaptateur.
export { codexHome } from './outils';

// Le texte de l'accord de Codex, testé mot pour mot (install-codex.test.ts). Le changer, c'est changer ce que
// l'utilisateur a accepté. Celui du lot 4 disait que rien n'était capté : la capture a son propre accord (`capture_le`).
export const CODEX_CONSENT_LINES = [
  'What will be sent: these hooks are in your personal Codex settings, so they run in ALL your Codex sessions, in ALL your folders (personal ones included), in the terminal as with `codex exec`.',
  "  - After each turn (Stop, in the background) and at the end of a session when Codex runs that hook (`codex exec`; not after /quit in the terminal), the Leon server receives the new exchanges of the session (your messages and Codex's answers, not the context Codex adds itself) and the actions of the session, read from its rollout file: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), Git (branch, commits, pull requests), the plan, and a few markers (start and end times, number of messages and tool errors, whether the session used the web, an MCP server, a subagent or a network command).",
  '  - What a hook missed (a session left with /quit, a failed upload) is sent when a Claude Code or Codex session starts on this computer, in the background: only Codex sessions changed after you accept, from now on.',
  '  - Secrets are masked before sending, and again by the server. Each session stays private to its author.',
  "  - At the start of each session, the server receives the project key, the current Git branch and the session id. It sends back your recent sessions on this repository, from all your tools (their branch, pull requests, commits, files and remaining tasks), and the project's morning briefing: Codex adds this block to the session context, so it is given to Codex's model.",
];

const APPROVAL_LINE =
  'Codex runs a new hook only once you approve it: at the next start of Codex, type /hooks and approve the Leon hooks (in the Codex app: Settings › Hooks). A Leon hook you already approved stays approved.';

export type CodexInstallOptions = { codexDir: string; home: string; assumeYes: boolean };

type CodexEvent = 'SessionStart' | 'Stop' | 'SessionEnd';
type Change = { event: CodexEvent; action: 'ajout' | 'mise-a-jour' | 'inchange'; handler: Json };
type Plan = { next: Json; changes: Change[] };

// Les crochets de Leon pour Codex, dans cet ordre : chacun dans la liste de son évènement.
export function codexHooks(
  home: string,
): { event: CodexEvent; evenement: Evenement; handler: Json }[] {
  const command = (evenement: Evenement) => launcherCommand(home, 'codex', evenement);
  return [
    {
      event: 'SessionStart',
      evenement: 'demarrage',
      handler: {
        type: 'command',
        command: command('demarrage'),
        timeout: CODEX_START_TIMEOUT_S,
        additionalContextLimit: CODEX_CONTEXT_LIMIT,
      },
    },
    {
      event: 'Stop',
      evenement: 'tour',
      handler: {
        type: 'command',
        command: command('tour'),
        timeout: CODEX_TOUR_TIMEOUT_S,
        async: true,
      },
    },
    {
      event: 'SessionEnd',
      evenement: 'fin',
      handler: { type: 'command', command: command('fin'), timeout: CODEX_FIN_TIMEOUT_S },
    },
  ];
}

// Les réglages avec les crochets de Leon, sans modifier l'objet reçu : une entrée de Leon déjà là est mise à jour sur
// place (les doublons partent), sinon un groupe s'ajoute en fin de la liste de son évènement. null : une forme que la
// doc ne connaît pas (on n'écrit rien).
export function addCodexHooks(settings: Json, home: string): Plan | null {
  const next = structuredClone(settings);
  const hooksRoot = next.hooks ?? {};
  if (!isRecord(hooksRoot)) return null;
  const changes: Change[] = [];
  for (const { event, evenement, handler: wanted } of codexHooks(home)) {
    const groups = hooksRoot[event] ?? [];
    if (!Array.isArray(groups)) return null;
    let found = false;
    let changed = false;
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) return null;
      const handlers: unknown[] = [];
      for (const handler of group.hooks) {
        const ours =
          isRecord(handler) && typeof handler.command === 'string'
            ? isLeonLauncherCommand(handler.command)
            : null;
        if (ours?.outil !== 'codex' || ours.evenement !== evenement) {
          handlers.push(handler);
        } else if (found) {
          changed = true; // un doublon : un seul crochet reste
        } else {
          found = true;
          if (!isDeepStrictEqual(handler, wanted)) changed = true;
          handlers.push(wanted);
        }
      }
      if (handlers.length > 0 || group.hooks.length === 0) kept.push({ ...group, hooks: handlers });
    }
    if (!found) kept.push({ hooks: [wanted] });
    hooksRoot[event] = kept;
    changes.push({
      event,
      action: !found ? 'ajout' : changed ? 'mise-a-jour' : 'inchange',
      handler: wanted,
    });
  }
  next.hooks = hooksRoot;
  return { next, changes };
}

const describeHook = ({ event, action, handler }: Change): string[] => {
  const label = { ajout: 'add', 'mise-a-jour': 'update', inchange: 'already in place' }[action];
  const background = handler.async === true ? ' · in the background' : '';
  return [
    `  ${event} · timeout ${String(handler.timeout)} s${background} · ${label}`,
    `    ${String(handler.command)}`,
  ];
};

// Ce qui peut gêner, sans rien lire d'autre que des noms : des crochets aussi dans config.toml, ou ceux de Leon pour
// Claude Code recopiés par la migration de Codex (ils n'y font rien : isOtherToolHook).
async function codexWarnings(codexDir: string, settings: Json): Promise<string[]> {
  const found: string[] = [];
  const toml = await readFile(join(codexDir, 'config.toml'), 'utf8').catch(() => '');
  if (/^\s*\[\[hooks\.(?!state\b)/m.test(toml)) {
    found.push(
      `Warning: ${join(codexDir, 'config.toml')} also has [[hooks.*]] tables: Codex runs those too. Leon does not touch them.`,
    );
  }
  const hooks = isRecord(settings.hooks) ? settings.hooks : {};
  const copied = Object.values(hooks).some(
    (groups) =>
      Array.isArray(groups) &&
      groups.some(
        (group) =>
          isRecord(group) &&
          Array.isArray(group.hooks) &&
          group.hooks.some(
            (handler) =>
              isLeonHandler(handler, 'briefing') || isLeonHandler(handler, 'capter-session'),
          ),
      ),
  );
  if (copied) {
    found.push(
      'Warning: this file also has the Leon hooks of Claude Code (`briefing`, `capter-session`), probably copied by Codex: they do nothing in Codex and can be deleted.',
    );
  }
  return found;
}

// Rend le code de sortie : 0 si les crochets et l'accord (capture comprise) sont en place ou si l'utilisateur a refusé,
// 1 sinon.
export async function installCodexHook(
  options: CodexInstallOptions,
  deps: InstallDeps,
): Promise<number> {
  const path = join(options.codexDir, CODEX_HOOKS_FILE);
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  const plan = settings && addCodexHooks(settings, options.home);
  if (settings === null || plan === null) {
    deps.err(
      `Leon: ${path} is unreadable or does not have the expected shape. Nothing was written: fix the file and run the command again.`,
    );
    return 1;
  }
  const consentFile = consentPath(options.home);
  const consent = await factsConsent(options.home, 'codex');
  const unchanged = plan.changes.every((change) => change.action === 'inchange');
  for (const line of await codexWarnings(options.codexDir, settings)) deps.out(line);
  if (unchanged && consent?.capture_le) {
    deps.out(`The Leon hooks are already in place in ${path}: nothing to do.`);
    return 0;
  }

  for (const line of [
    `Leon hooks for ${path}:`,
    '',
    ...plan.changes.flatMap(describeHook),
    '',
    ...CODEX_CONSENT_LINES,
    'Your other hooks are not touched (their values and order stay; the formatting of the file may change).',
  ]) {
    deps.out(line);
  }
  if (!options.assumeYes) {
    const answer = await deps.ask(
      `\nWrite these hooks${consent?.capture_le ? '' : ` and record this consent in ${consentFile}`}? [y/N] `,
    );
    if (!isYes(answer)) {
      deps.out('Nothing was written.');
      return 0;
    }
  }

  if (!unchanged) {
    const now = await load(path);
    if (
      now.kind !== loaded.kind ||
      (now.kind === 'present' && loaded.kind === 'present' && now.text !== loaded.text)
    ) {
      deps.err(
        `Leon: ${path} changed during the installation. Nothing was written: run the command again.`,
      );
      return 1;
    }
    try {
      await mkdir(options.codexDir, { recursive: true, mode: 0o700 });
      await writeAtomically(path, loaded, `${JSON.stringify(plan.next, null, 2)}\n`);
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${path} (permissions or disk space${code ? `: ${code}` : ''}). Nothing was modified.`,
      );
      return 1;
    }
    deps.out(`\nHooks installed in ${path}.`);
    deps.out(APPROVAL_LINE);
  }
  if (!consent?.capture_le) {
    try {
      // L'accord du lot 4 (le démarrage seul) est gardé, avec sa date et ses usages : la capture s'y ajoute, datée.
      if (consent === null) await writeConsent(options.home, 'codex', FACTS_VERSION);
      await recordCapture(options.home, 'codex');
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${consentFile}${code ? ` (${code})` : ''}: until it is, the hooks send nothing. Run the command again.`,
      );
      return 1;
    }
    deps.out(`Consent recorded in ${consentFile}.`);
  }
  return 0;
}

// Le retrait : les crochets de Leon pour Codex (tous évènements), puis l'accord de Codex en version 0, puis le lanceur
// s'il ne sert plus à aucun outil. Rend 0 si tout est retiré (ou l'était déjà).
export async function uninstallCodexHook(
  options: { codexDir: string; home: string },
  deps: UninstallDeps,
): Promise<number> {
  const path = join(options.codexDir, CODEX_HOOKS_FILE);
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  let hooksDone = settings !== null;
  if (settings === null) {
    deps.err(`Leon: ${path} is unreadable: no hook was removed. Delete the Leon entries by hand.`);
  } else if (isRecord(settings.hooks)) {
    const removed: string[] = [];
    const next = structuredClone(settings);
    const hooksRoot = next.hooks as Json;
    for (const [event, groups] of Object.entries(hooksRoot)) {
      if (!Array.isArray(groups)) continue;
      const kept = groups.flatMap((group) => {
        if (!isRecord(group) || !Array.isArray(group.hooks)) return [group];
        const handlers = group.hooks.filter((handler) => {
          const ours =
            isRecord(handler) &&
            typeof handler.command === 'string' &&
            isLeonLauncherCommand(handler.command)?.outil === 'codex';
          if (ours) removed.push(`${event} · ${handler.command}`);
          return !ours;
        });
        if (handlers.length === group.hooks.length) return [group];
        return handlers.length > 0 ? [{ ...group, hooks: handlers }] : [];
      });
      if (kept.length === 0 && groups.length > 0) delete hooksRoot[event];
      else hooksRoot[event] = kept;
    }
    if (removed.length > 0 && Object.keys(hooksRoot).length === 0) delete next.hooks;
    if (removed.length === 0) {
      deps.out(`No Leon hook in ${path}: nothing to remove.`);
    } else {
      try {
        await writeAtomically(path, loaded, `${JSON.stringify(next, null, 2)}\n`);
        deps.out(`Leon hooks removed from ${path}:`);
        for (const line of removed) deps.out(`  ${line}`);
      } catch (error) {
        const code = errorCode(error);
        deps.err(
          `Leon: could not write ${path}${code ? ` (${code})` : ''}: delete the Leon entries by hand.`,
        );
        hooksDone = false;
      }
    }
  } else {
    deps.out(`No Leon hook in ${path}: nothing to remove.`);
  }

  const consentFile = consentPath(options.home);
  let consentDone = true;
  if (await withdrawalRecorded(options.home, 'codex')) {
    deps.out(`Consent already withdrawn in ${consentFile}.`);
  } else {
    try {
      await writeConsent(options.home, 'codex', 0);
      deps.out(`Consent withdrawn in ${consentFile}: nothing is sent from or to Codex anymore.`);
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${consentFile}${code ? ` (${code})` : ''}. Run the command again.`,
      );
      consentDone = false;
    }
  }
  if (hooksDone && consentDone) await removeUnusedLauncher(options.home, deps);
  return hooksDone && consentDone ? 0 : 1;
}
