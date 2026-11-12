// Ce que partagent les installateurs des outils hors Claude Code (Cursor, T29 ; Antigravity, T34) : montrer les
// crochets et le texte de l'accord, demander, écrire le fichier de crochets sans perte, puis l'accord de capture ; et
// le retrait. Comme install-codex.ts : seules les entrées de Leon sont touchées, un fichier illisible n'est jamais
// réécrit, l'écriture est atomique et refusée si le fichier a changé pendant la question, l'accord (`outils.<outil>`,
// version 2, et `capture_le`) s'écrit après la confirmation, puis les usages (offerUsages, T47).
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  consentPath,
  FACTS_VERSION,
  factsConsent,
  recordCapture,
  withdrawalRecorded,
  writeConsent,
} from './consent';
import { launcherPath, type Outil } from './hook-commands';
import {
  errorCode,
  type InstallDeps,
  isYes,
  type Json,
  type Loaded,
  load,
  offerUsages,
  parseSettings,
  type UsageOptions,
  usagesToOffer,
  writeAtomically,
} from './install-hooks';
import { ADAPTATEURS } from './outils';
import { removeUnusedLauncher, type UninstallDeps, withdrawOnServer } from './uninstall-hooks';

export type ToolHookChange = {
  event: string;
  action: 'ajout' | 'mise-a-jour' | 'inchange';
  command: string;
  timeout: number;
};
export type ToolHookPlan = { next: Json; changes: ToolHookChange[] };

export type ToolInstall = {
  outil: Outil;
  path: string; // le fichier de crochets de l'outil
  home: string;
  assumeYes: boolean;
  // Les réglages avec les crochets de Leon ; null : une forme inconnue, rien n'est écrit.
  plan: (settings: Json) => ToolHookPlan | null;
  consentLines: readonly string[];
  afterWrite: readonly string[]; // ce qu'il reste à faire dans l'outil (le recharger…)
} & UsageOptions;

const LABELS = { ajout: 'add', 'mise-a-jour': 'update', inchange: 'already in place' } as const;

// macOS refuse à une app (Cursor, Antigravity) de lancer un script rangé dans ces dossiers sans une autorisation
// expresse (essai T26 : EPERM, le crochet ne démarre pas). Le lanceur `~/.leon/bin/leon` convient ; sous la forme clone,
// il lance pnpm dans le clone : un clone rangé là ne marche pas.
const MACOS_PROTECTED = ['Documents', 'Desktop', 'Downloads'];

// Un avertissement quand le lanceur, sous la forme clone, pointe vers un dossier protégé de macOS ; null sinon.
export async function protectedCloneWarning(
  home: string,
  label: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (platform !== 'darwin') return null;
  const script = await readFile(launcherPath(home), 'utf8').catch(() => '');
  const clone = /--dir '((?:[^']|'\\'')*)'/.exec(script)?.[1]?.replaceAll(`'\\''`, "'");
  if (!clone) return null;
  const inside = MACOS_PROTECTED.find((name) =>
    `${resolve(clone)}${sep}`.startsWith(`${join(home, name)}${sep}`),
  );
  return inside
    ? `Warning: the launcher runs Leon from a clone in ~/${inside} (${clone}), a folder macOS does not let ${label} run scripts from: its hooks would fail. Move the clone elsewhere, or use the installed form (\`leon setup\` without --depot).`
    : null;
}

// Rend le code de sortie : 0 si les crochets et l'accord (capture comprise) sont en place, ou si l'utilisateur a refusé ;
// 1 sinon, ou si un usage accepté n'a pas pu s'écrire.
export async function installToolHooks(install: ToolInstall, deps: InstallDeps): Promise<number> {
  const { path, outil, home } = install;
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  const plan = settings && install.plan(settings);
  if (settings === null || plan === null) {
    deps.err(
      `Leon: ${path} is unreadable or does not have the expected shape. Nothing was written: fix the file and run the command again.`,
    );
    return 1;
  }
  const consentFile = consentPath(home);
  const consent = await factsConsent(home, outil);
  const warning = await protectedCloneWarning(home, ADAPTATEURS[outil].label);
  if (warning) deps.out(warning);
  const unchanged = plan.changes.every((change) => change.action === 'inchange');
  if (unchanged && consent?.capture_le) {
    if (usagesToOffer(outil, consent, install).length === 0) {
      deps.out(`The Leon hooks are already in place in ${path}: nothing to do.`);
      return 0;
    }
    deps.out(`The Leon hooks are already in place in ${path}.`);
    return (await offerUsages(outil, install, deps)) ? 0 : 1;
  }
  for (const line of [
    `Leon hooks for ${path}:`,
    '',
    ...plan.changes.flatMap((change) => [
      `  ${change.event} · timeout ${change.timeout} s · ${LABELS[change.action]}`,
      `    ${change.command}`,
    ]),
    '',
    ...install.consentLines,
    'Your other hooks are not touched (their values and order stay; the formatting of the file may change).',
  ]) {
    deps.out(line);
  }
  if (!install.assumeYes) {
    const answer = await deps.ask(
      `\nWrite these hooks${consent?.capture_le ? '' : ` and record this consent in ${consentFile}`}? [y/N] `,
    );
    if (!isYes(answer)) {
      deps.out('Nothing was written.');
      return 0;
    }
  }
  if (!unchanged) {
    if (!(await writeSettings(path, loaded, plan.next, deps))) return 1;
    deps.out(`\nHooks installed in ${path}.`);
    for (const line of install.afterWrite) deps.out(line);
  }
  if (!consent?.capture_le) {
    try {
      if (consent === null) await writeConsent(home, outil, FACTS_VERSION);
      await recordCapture(home, outil);
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${consentFile}${code ? ` (${code})` : ''}: until it is, the hooks send nothing. Run the command again.`,
      );
      return 1;
    }
    deps.out(`Consent recorded in ${consentFile}.`);
  }
  return (await offerUsages(outil, install, deps)) ? 0 : 1;
}

// Écrit les réglages, seulement si le fichier n'a pas changé depuis sa lecture.
async function writeSettings(
  path: string,
  loaded: Loaded,
  next: Json,
  deps: Pick<InstallDeps, 'err'>,
): Promise<boolean> {
  const now = await load(path);
  if (
    now.kind !== loaded.kind ||
    (now.kind === 'present' && loaded.kind === 'present' && now.text !== loaded.text)
  ) {
    deps.err(
      `Leon: ${path} changed during the installation. Nothing was written: run the command again.`,
    );
    return false;
  }
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeAtomically(path, loaded, `${JSON.stringify(next, null, 2)}\n`);
    return true;
  } catch (error) {
    const code = errorCode(error);
    deps.err(
      `Leon: could not write ${path} (permissions or disk space${code ? `: ${code}` : ''}). Nothing was modified.`,
    );
    return false;
  }
}

// Le retrait : les crochets de Leon pour l'outil (`remove` rend les réglages sans eux, et les lignes retirées), puis son
// accord en version 0, puis le serveur de la connexion (withdrawOnServer), puis le lanceur s'il ne sert plus à aucun
// outil. Rend 0 si tout est retiré (ou l'était déjà).
export async function uninstallToolHooks(
  options: { outil: Outil; path: string; home: string },
  remove: (settings: Json) => { next: Json; removed: string[] },
  deps: UninstallDeps,
): Promise<number> {
  const { path, outil, home } = options;
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  let hooksDone = settings !== null;
  if (settings === null) {
    deps.err(`Leon: ${path} is unreadable: no hook was removed. Delete the Leon entries by hand.`);
  } else {
    const { next, removed } = remove(settings);
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
  }
  const consentFile = consentPath(home);
  let consentDone = true;
  if (await withdrawalRecorded(home, outil)) {
    deps.out(`Consent already withdrawn in ${consentFile}.`);
  } else {
    try {
      await writeConsent(home, outil, 0);
      deps.out(
        `Consent withdrawn in ${consentFile}: nothing is sent from or to ${ADAPTATEURS[outil].label} anymore.`,
      );
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${consentFile}${code ? ` (${code})` : ''}. Run the command again.`,
      );
      consentDone = false;
    }
  }
  if (consentDone) await withdrawOnServer(home, deps);
  if (hooksDone && consentDone) await removeUnusedLauncher(home, deps);
  return hooksDone && consentDone ? 0 : 1;
}
