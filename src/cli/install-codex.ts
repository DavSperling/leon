// Installateur et retrait du crochet de Codex (T17 du plan mémoire des sessions) : `leon installer-crochets --outil
// codex`, `leon setup` (setup.ts) et `leon retirer-crochets --outil codex`. Au lot 4, le démarrage seulement : Codex
// reçoit le bloc de mes sessions récentes sur le dépôt ; rien n'est capté (lot 5).
//
// Doc officielle (https://learn.chatgpt.com/docs/hooks, lue le 06/11) et essai réel du 06/11 (annexe 03-essai-codex) :
// - les crochets de l'utilisateur sont dans `${CODEX_HOME:-~/.codex}/hooks.json` : `hooks.<Évènement>` est une liste
//   de groupes `{ matcher?, hooks: [ { type: "command", command, timeout, additionalContextLimit } ] }`, comme Claude
//   Code. Codex lit aussi des tables `[[hooks.*]]` dans `config.toml` : on ne les touche pas, on avertit ;
// - un crochet ne tourne qu'une fois approuvé par `/hooks` (ou « Review hooks » dans l'app). L'empreinte porte sur sa
//   définition, et sa clé sur sa position (`<fichier>:session_start:<groupe>:<crochet>`) : on ajoute en fin de liste
//   pour ne pas déplacer, donc désapprouver, les crochets de l'utilisateur. Un script modifié après l'approbation tourne
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
  withdrawalRecorded,
  writeConsent,
} from './consent';
import { isLeonLauncherCommand, launcherCommand } from './hook-commands';
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

// Le dossier de Codex : CODEX_HOME, sinon ~/.codex.
export const codexHome = (home: string, env: Record<string, string | undefined>): string =>
  env.CODEX_HOME || join(home, '.codex');

// Le texte de l'accord de Codex, testé mot pour mot (install-codex.test.ts). Le changer, c'est changer ce que
// l'utilisateur a accepté.
export const CODEX_CONSENT_LINES = [
  'What will be sent: this hook is in your personal Codex settings, so it runs in ALL your Codex sessions, in ALL your folders (personal ones included), in the terminal as with `codex exec`.',
  '  - At the start of each session, the Leon server receives the project key, the current Git branch and the session id.',
  "  - It sends back your recent sessions on this repository, from all your tools (their branch, pull requests, commits, files and remaining tasks), and the project's morning briefing: Codex adds this block to the session context, so it is given to Codex's model.",
  '  - Nothing is captured from Codex sessions for now: Leon receives neither their exchanges nor their actions.',
];

const APPROVAL_LINE =
  'Codex runs a new hook only once you approve it: at the next start of Codex, type /hooks and approve the Leon hook (in the Codex app: Settings › Hooks).';

export type CodexInstallOptions = { codexDir: string; home: string; assumeYes: boolean };

type Plan = { next: Json; action: 'ajout' | 'mise-a-jour' | 'inchange'; command: string };

// Les réglages avec le crochet de démarrage de Leon, sans modifier l'objet reçu : une entrée de Leon déjà là est mise à
// jour sur place (les doublons partent), sinon un groupe s'ajoute en fin de liste. null : une forme que la doc ne connaît
// pas (on n'écrit rien).
export function addCodexHook(settings: Json, home: string): Plan | null {
  const wanted = {
    type: 'command',
    command: launcherCommand(home, 'codex', 'demarrage'),
    timeout: CODEX_START_TIMEOUT_S,
    additionalContextLimit: CODEX_CONTEXT_LIMIT,
  };
  const next = structuredClone(settings);
  const hooksRoot = next.hooks ?? {};
  if (!isRecord(hooksRoot)) return null;
  const groups = hooksRoot.SessionStart ?? [];
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
      if (ours?.outil !== 'codex' || ours.evenement !== 'demarrage') {
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
  hooksRoot.SessionStart = kept;
  next.hooks = hooksRoot;
  return {
    next,
    action: !found ? 'ajout' : changed ? 'mise-a-jour' : 'inchange',
    command: wanted.command,
  };
}

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

// Rend le code de sortie : 0 si le crochet et l'accord sont en place ou si l'utilisateur a refusé, 1 sinon.
export async function installCodexHook(
  options: CodexInstallOptions,
  deps: InstallDeps,
): Promise<number> {
  const path = join(options.codexDir, CODEX_HOOKS_FILE);
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  const plan = settings && addCodexHook(settings, options.home);
  if (settings === null || plan === null) {
    deps.err(
      `Leon: ${path} is unreadable or does not have the expected shape. Nothing was written: fix the file and run the command again.`,
    );
    return 1;
  }
  const consentFile = consentPath(options.home);
  const consented = (await factsConsent(options.home, 'codex')) !== null;
  for (const line of await codexWarnings(options.codexDir, settings)) deps.out(line);
  if (plan.action === 'inchange' && consented) {
    deps.out(`The Leon hook is already in place in ${path}: nothing to do.`);
    return 0;
  }

  const label = { ajout: 'add', 'mise-a-jour': 'update', inchange: 'already in place' }[
    plan.action
  ];
  for (const line of [
    `Leon hook for ${path}:`,
    '',
    `  SessionStart · timeout ${CODEX_START_TIMEOUT_S} s · ${label}`,
    `    ${plan.command}`,
    '',
    ...CODEX_CONSENT_LINES,
    'Your other hooks are not touched (their values and order stay; the formatting of the file may change).',
  ]) {
    deps.out(line);
  }
  if (!options.assumeYes) {
    const answer = await deps.ask(
      `\nWrite this hook${consented ? '' : ` and record this consent in ${consentFile}`}? [y/N] `,
    );
    if (!isYes(answer)) {
      deps.out('Nothing was written.');
      return 0;
    }
  }

  if (plan.action !== 'inchange') {
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
    deps.out(`\nHook installed in ${path}.`);
    deps.out(APPROVAL_LINE);
  }
  if (!consented) {
    try {
      await writeConsent(options.home, 'codex', FACTS_VERSION);
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${consentFile}${code ? ` (${code})` : ''}: until it is, the hook sends nothing. Run the command again.`,
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
      deps.out(`Consent withdrawn in ${consentFile}: Leon sends nothing more to Codex.`);
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
