// Retrait des crochets de Claude Code et de l'accord : `pnpm leon retirer-crochets` (T08). Ce module :
// - ne retire que les entrées de Leon, reconnues comme à l'installation (isLeonHandler, install-hooks.ts : même
//   évènement, même forme de commande), avec leur groupe s'il ne contient plus rien, puis l'évènement et la clé
//   `hooks` que ce retrait a vidés : des réglages installés puis retirés reviennent à leur état d'avant. Tout le
//   reste est gardé, dans son ordre, et une forme que la doc ne connaît pas n'est pas touchée ;
// - n'écrit rien quand il n'y a rien à retirer, et écrit comme l'installateur (writeAtomically, à travers un lien
//   symbolique éventuel), sans sauvegarde : la première copie, celle d'avant Leon, reste telle quelle ;
// - passe Claude Code en version 0 dans `accord.json` (consent.ts), même quand les réglages n'ont pas pu être lus ou
//   écrits : plus rien ne part alors (leon.ts), ni d'un crochet resté dans les réglages d'un projet, ni de
//   `import-claude-code` ;
// - ne demande pas de confirmation, puisqu'il ne fait que retirer, et ne recopie jamais le contenu des réglages dans
//   ses messages.
import { join } from 'node:path';
import { consentPath, consentWithdrawn, writeConsent } from './consent';
import {
  HOOKS,
  isLeonHandler,
  isRecord,
  type Json,
  load,
  SETTINGS_FILE,
  writeAtomically,
} from './install-hooks';

// Le README est en français : la section citée garde son titre exact.
const README_HINT = `see the README, section "Retirer les crochets"`;

export type RemovedHook = { event: string; command: string };

// Les réglages sans les crochets de Leon, sans modifier l'objet reçu.
export function removeLeonHooks(settings: Json): { settings: Json; removed: RemovedHook[] } {
  const next = structuredClone(settings);
  const removed: RemovedHook[] = [];
  const hooksRoot = next.hooks;
  if (!isRecord(hooksRoot)) return { settings: next, removed };
  for (const spec of HOOKS) {
    const groups = hooksRoot[spec.event];
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const handlers: unknown[] = [];
      for (const handler of group.hooks) {
        if (isLeonHandler(handler, spec.subcommand)) {
          removed.push({ event: spec.event, command: handler.command });
        } else {
          handlers.push(handler);
        }
      }
      if (handlers.length === group.hooks.length) kept.push(group);
      else if (handlers.length > 0) kept.push({ ...group, hooks: handlers });
    }
    if (kept.length === 0 && groups.length > 0) delete hooksRoot[spec.event];
    else hooksRoot[spec.event] = kept;
  }
  if (removed.length > 0 && Object.keys(hooksRoot).length === 0) delete next.hooks;
  return { settings: next, removed };
}

export type UninstallOptions = { configDir: string; home: string };
export type UninstallDeps = { out: (text: string) => void; err: (text: string) => void };

const errorCode = (error: unknown): string | undefined => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' ? code : undefined;
};

// Rend true si les réglages n'ont plus de crochet de Leon (retirés à l'instant ou absents).
async function removeFromSettings(path: string, deps: UninstallDeps): Promise<boolean> {
  const loaded = await load(path);
  let settings: unknown = {};
  if (loaded.kind === 'present' && loaded.text.trim() !== '') {
    try {
      settings = JSON.parse(loaded.text);
    } catch {
      settings = null;
    }
  }
  if (loaded.kind === 'unreadable' || !isRecord(settings)) {
    deps.err(
      `Leon: ${path} is unreadable (not a valid JSON object, or an inaccessible file): no hook was removed. Fix the file and run the command again, or delete the Leon entries by hand (${README_HINT}).`,
    );
    return false;
  }

  const plan = removeLeonHooks(settings);
  if (plan.removed.length === 0) {
    deps.out(`No Leon hook in ${path}: nothing to remove.`);
    return true;
  }
  try {
    await writeAtomically(path, loaded, `${JSON.stringify(plan.settings, null, 2)}\n`);
  } catch (error) {
    const code = errorCode(error);
    deps.err(
      `Leon: could not write ${path} (permissions or disk space${code ? `: ${code}` : ''}). Nothing was modified: delete the Leon entries by hand (${README_HINT}).`,
    );
    return false;
  }
  deps.out(`Leon hooks removed from ${path}:`);
  for (const hook of plan.removed) deps.out(`  ${hook.event} · ${hook.command}`);
  deps.out(
    'Your other settings and hooks are not touched (their values and order stay; the formatting of the file may change). Claude Code reloads this file by itself.',
  );
  return true;
}

async function withdrawConsent(home: string, deps: UninstallDeps): Promise<boolean> {
  const path = consentPath(home);
  if (await consentWithdrawn(home, 'claude_code')) {
    deps.out(`Consent already withdrawn in ${path}.`);
    return true;
  }
  try {
    await writeConsent(home, 'claude_code', 0);
  } catch (error) {
    const code = errorCode(error);
    deps.err(
      `Leon: could not write ${path}${code ? ` (${code})` : ''}: your consent is not withdrawn. Run the command again.`,
    );
    return false;
  }
  deps.out(
    `Consent withdrawn in ${path}: Leon receives nothing more from Claude Code, not even from \`pnpm leon import-claude-code\`. To give it again, run \`pnpm leon installer-crochets\`.`,
  );
  return true;
}

// Rend le code de sortie : 0 si les crochets et l'accord sont retirés (ou l'étaient déjà), 1 si les réglages n'ont
// pas pu être lus ou écrits, ou si l'accord n'a pas pu s'écrire.
export async function uninstallHooks(
  options: UninstallOptions,
  deps: UninstallDeps,
): Promise<number> {
  const settingsDone = await removeFromSettings(join(options.configDir, SETTINGS_FILE), deps);
  const consentDone = await withdrawConsent(options.home, deps);
  deps.out('The sessions already sent stay in Leon: there is no way to delete them yet.');
  return settingsDone && consentDone ? 0 : 1;
}
