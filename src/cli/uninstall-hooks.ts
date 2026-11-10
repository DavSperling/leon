// Retrait des crochets de Claude Code et de l'accord : `leon retirer-crochets` (T08). Ce module :
// - ne retire que les entrées de Leon, reconnues comme à l'installation (isLeonHandler, install-hooks.ts : même
//   évènement, même forme de commande), avec leur groupe s'il ne contient plus rien, puis l'évènement et la clé
//   `hooks` que ce retrait a vidés : des réglages installés puis retirés reviennent à leur état d'avant. Tout le
//   reste est gardé, dans son ordre, et une forme que la doc ne connaît pas n'est pas touchée ;
// - n'écrit rien quand il n'y a rien à retirer, et écrit comme l'installateur (writeAtomically, à travers un lien
//   symbolique éventuel), sans sauvegarde : la première copie, celle d'avant Leon, reste telle quelle ;
// - passe Claude Code en version 0 dans `accord.json` (consent.ts), même quand les réglages n'ont pas pu être lus ou
//   écrits : plus rien ne part alors (leon.ts), ni d'un crochet resté dans les réglages d'un projet, ni de
//   `import-claude-code` ;
// - prévient ensuite le serveur de la connexion du moment (POST /api/v1/retrait, T43), qui vide les usages des
//   sessions de l'outil déjà envoyées : seulement une fois l'accord retiré sur le poste, et tant qu'il ne l'a pas
//   appris (`retrait_serveur_le`, consent.ts). Les retraits d'autres outils restés en attente partent avec. Un échec
//   (pas de connexion, serveur injoignable ou plus ancien que la route, jeton refusé) n'est qu'une ligne : le retrait
//   sur le poste reste fait et le code de sortie ne change pas. Le rattrapage (`leon rattraper`, lancé au démarrage
//   d'une session d'un outil qui garde ses crochets) le redit plus tard, comme pour les retraits faits avant la route ;
//   pour le dernier outil, aucun crochet ne reste : la ligne dit de relancer la commande. `leon setup` et
//   `installer-crochets` le redisent aussi avant d'écrire un nouvel accord, qui effacerait l'attente
//   (tellBeforeConsent) ;
// - efface aussi le lanceur ~/.leon/bin/leon (launcher.ts) quand plus aucun outil n'a d'accord dans `accord.json`, que
//   les réglages et l'accord ont bien été retirés et que le serveur a appris chaque retrait : ses crochets n'en ont plus
//   besoin, et relancer la commande ne sert plus. Un fichier qui n'est pas un lanceur écrit par Leon est gardé ;
// - ne demande pas de confirmation, puisqu'il ne fait que retirer, et ne recopie des réglages dans ses messages que
//   les commandes de Leon qu'il retire.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodeSessionKind } from '../capture/turn';
import {
  anyToolInstalled,
  CONSENT_AGAIN_HINT,
  consentPath,
  pendingServerWithdrawals,
  recordServerWithdrawal,
  withdrawalRecorded,
  writeConsent,
} from './consent';
import { resolveServerEnv } from './env';
import { launcherPath } from './hook-commands';
import { createWithdrawalSender, TokenRefusedError } from './import-claude-code';
import {
  errorCode,
  HOOKS,
  isLeonHandler,
  isRecord,
  type Json,
  load,
  parseSettings,
  SETTINGS_FILE,
  writeAtomically,
} from './install-hooks';
import { removeLauncher } from './launcher';

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
// `withdraw` : l'appel de la route du retrait, au serveur de la connexion du moment (connectionWithdrawal).
export type WithdrawalSender = (outil: CodeSessionKind) => Promise<void>;
export type UninstallDeps = {
  out: (text: string) => void;
  err: (text: string) => void;
  withdraw: WithdrawalSender;
};

// Une commande lancée à la main (retrait, `leon setup`) n'attend pas un serveur muet plus longtemps.
const WITHDRAWAL_TIMEOUT_MS = 15_000;

// La route du retrait au serveur de la connexion du moment, relue à chaque appel : sans connexion, l'appel échoue comme
// un serveur injoignable.
export const connectionWithdrawal =
  (
    fetchImpl: typeof fetch,
    env: Record<string, string | undefined>,
    home: string,
  ): WithdrawalSender =>
  async (outil) =>
    createWithdrawalSender(fetchImpl, await resolveServerEnv(env, home), {
      signal: AbortSignal.timeout(WITHDRAWAL_TIMEOUT_MS),
    })(outil);

// Messages fixes : ni l'adresse du serveur ni le jeton. Le premier quand un outil garde ses crochets (son démarrage
// lance le rattrapage), le second pour le dernier outil, le troisième quand le serveur refuse le jeton (ordinateur
// révoqué dans Réglages) : relancer ne suffit pas, il faut d'abord se reconnecter.
export const WITHDRAWAL_NOT_TOLD_MESSAGE =
  'Leon: the Leon server could not be told of this withdrawal (no connection, server unreachable, or older than this CLI). Your consent is withdrawn on this computer all the same; Leon tells the server at the next session start of a tool that still has its hooks, or when you run this command again.';
export const WITHDRAWAL_NOT_TOLD_LAST_MESSAGE =
  'Leon: the Leon server could not be told of this withdrawal (no connection, server unreachable, or older than this CLI). Your consent is withdrawn on this computer all the same; no tool keeps Leon hooks to tell the server later, so run this command again once online.';
export const WITHDRAWAL_REFUSED_MESSAGE =
  'Leon: the Leon server refused the token of this computer, so it could not be told of this withdrawal. Your consent is withdrawn on this computer all the same; run `leon login`, then this command again.';
// Avant un nouvel accord (tellBeforeConsent) : l'accord réécrit l'entrée, et le retrait n'attend plus.
export const EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE =
  'Leon: the Leon server could not be told of an earlier withdrawal of your consent (no connection, server unreachable, older than this CLI, or token refused): if you give your consent again now, the sessions sent before that withdrawal keep, on that server, the usages you had accepted for them.';

// `refused` : le serveur a refusé le jeton (401) ; `failed` : tout autre échec.
export type Told = 'told' | 'refused' | 'failed';

// Une date qui ne s'écrit pas fait seulement redire le retrait au serveur, qui le prend autant de fois qu'on le lui dit.
async function tellServer(
  home: string,
  outil: CodeSessionKind,
  send: WithdrawalSender,
): Promise<Told> {
  try {
    await send(outil);
  } catch (error) {
    return error instanceof TokenRefusedError ? 'refused' : 'failed';
  }
  await recordServerWithdrawal(home, outil).catch(() => {});
  return 'told';
}

// Les retraits que le serveur n'a pas appris (faits à l'instant, avant que la commande ne l'appelle, ou hors ligne), une
// fois chacun : la date de sa réponse les retire de l'attente. Rend `told` si chacun est appris, sinon pourquoi pas
// (un jeton refusé d'abord : c'est lui qu'il faut réparer).
export async function catchUpWithdrawals(home: string, send: WithdrawalSender): Promise<Told> {
  const outcomes: Told[] = [];
  for (const outil of await pendingServerWithdrawals(home)) {
    outcomes.push(await tellServer(home, outil, send));
  }
  if (outcomes.includes('refused')) return 'refused';
  return outcomes.includes('failed') ? 'failed' : 'told';
}

// Après le retrait sur le poste, dans les trois commandes de retrait.
export async function withdrawOnServer(home: string, deps: UninstallDeps): Promise<void> {
  const outcome = await catchUpWithdrawals(home, deps.withdraw);
  if (outcome === 'refused') deps.err(WITHDRAWAL_REFUSED_MESSAGE);
  if (outcome === 'failed') {
    deps.err(
      (await anyToolInstalled(home))
        ? WITHDRAWAL_NOT_TOLD_MESSAGE
        : WITHDRAWAL_NOT_TOLD_LAST_MESSAGE,
    );
  }
}

// Avant d'écrire un nouvel accord (`leon setup`, `installer-crochets`) : writeConsent réécrit l'entrée restée en version
// 0, et l'attente disparaît sans que plus rien ne la redise. Un échec ne bloque pas l'installation ; une ligne dit ce
// qu'il laisse.
export async function tellBeforeConsent(
  home: string,
  deps: Pick<UninstallDeps, 'err' | 'withdraw'>,
): Promise<void> {
  if ((await catchUpWithdrawals(home, deps.withdraw)) !== 'told') {
    deps.err(EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE);
  }
}

// Rend true si les réglages n'ont plus de crochet de Leon (retirés à l'instant ou absents).
async function removeFromSettings(path: string, deps: UninstallDeps): Promise<boolean> {
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  if (settings === null) {
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
  // Un fichier illisible vaut déjà un retrait, mais il est réécrit : la version 0 y est alors bien posée.
  if (await withdrawalRecorded(home, 'claude_code')) {
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
    `Consent withdrawn in ${path}: Leon receives nothing more from Claude Code, not even from \`leon import-claude-code\`. ${CONSENT_AGAIN_HINT}`,
  );
  return true;
}

// Le lanceur ne part qu'avec le dernier outil, et seulement si tout a été retiré : des réglages restés en place
// appelleraient un lanceur disparu. Il reste aussi tant que le serveur n'a pas appris un retrait : c'est lui qui relance
// la commande. Le code de sortie ne change pas : un lanceur qui reste n'est pas un échec.
export async function removeUnusedLauncher(home: string, deps: UninstallDeps): Promise<void> {
  if (await anyToolInstalled(home)) return;
  const path = launcherPath(home);
  if ((await pendingServerWithdrawals(home)).length > 0) {
    const present = await access(path).then(
      () => true,
      () => false,
    );
    if (present)
      deps.out(`Launcher kept: ${path} (until the Leon server is told of the withdrawal).`);
    return;
  }
  try {
    const outcome = await removeLauncher(home);
    if (outcome === 'retire') deps.out(`Launcher removed: ${path} (no other tool uses it).`);
    if (outcome === 'conserve') {
      deps.out(`${path} was left in place: it is not a launcher written by Leon.`);
    }
  } catch (error) {
    const code = errorCode(error);
    deps.err(`Leon: could not remove ${path}${code ? ` (${code})` : ''}: delete it by hand.`);
  }
}

// Rend le code de sortie : 0 si les crochets et l'accord sont retirés (ou l'étaient déjà), 1 si les réglages n'ont
// pas pu être lus ou écrits, ou si l'accord n'a pas pu s'écrire.
export async function uninstallHooks(
  options: UninstallOptions,
  deps: UninstallDeps,
): Promise<number> {
  const settingsDone = await removeFromSettings(join(options.configDir, SETTINGS_FILE), deps);
  const consentDone = await withdrawConsent(options.home, deps);
  if (consentDone) await withdrawOnServer(options.home, deps);
  if (settingsDone && consentDone) await removeUnusedLauncher(options.home, deps);
  deps.out('The sessions already sent stay in Leon: there is no way to delete them yet.');
  return settingsDone && consentDone ? 0 : 1;
}
