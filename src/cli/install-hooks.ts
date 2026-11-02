// Installateur des crochets de Claude Code : `pnpm leon installer-crochets [--oui] [--depot <chemin>]` écrit, dans les
// réglages de l'utilisateur, le crochet de démarrage (`leon briefing`) et le crochet de fin de session
// (`leon capter-session`), après confirmation.
//
// Doc officielle de Claude Code, lue le 2026-10-20 :
// - Les crochets : https://code.claude.com/docs/en/hooks
//   · Ils s'écrivent sous la clé `hooks` d'un fichier de réglages : `hooks.<Évènement>` est une liste de groupes
//     `{ matcher?, hooks: [ { type: "command", command, timeout } ] }`. Sans `matcher` (ou vide, ou « * »), le groupe
//     vaut pour tous les cas : SessionStart (`startup`, `resume`, `clear`, `compact`, `fork`) comme SessionEnd
//     (`clear`, `resume`, `logout`, `prompt_input_exit`, `other`). `timeout` est en secondes (600 par défaut pour
//     une commande).
//   · SessionStart : Claude Code ajoute la sortie standard de la commande au contexte de la session ; avec le code
//     de sortie 0, il ne voit jamais la sortie d'erreur. Le JSON reçu sur l'entrée standard porte `session_id`,
//     `transcript_path`, `cwd` et `hook_event_name` (et `source`).
//   · SessionEnd : même JSON, avec `reason` ; ce crochet ne peut pas bloquer la fin de session. Son délai par défaut
//     est de 1,5 s ; un `timeout` plus long dans les réglages relève le budget d'autant, jusqu'à 60 s : d'où les 30 s
//     de `leon capter-session` (son envoi s'interrompt de lui-même à 15 s, voir capture-session.ts).
//   · Pour retirer un crochet : supprimer son entrée du fichier. `"disableAllHooks": true` les éteint tous.
//   · Les modifications des crochets dans un fichier de réglages sont reprises par Claude Code tout seul.
// - Les réglages : https://code.claude.com/docs/en/settings
//   · Ceux de l'utilisateur sont dans `~/.claude/settings.json`, ou dans `settings.json` du dossier
//     `CLAUDE_CONFIG_DIR` quand cette variable est posée (claudeConfigDir, env.ts).
//   · Ce sont des réglages en JSON strict : un commentaire ou une virgule finale est une erreur de syntaxe. Un
//     fichier qu'on ne sait pas lire n'est donc jamais réécrit.
//
// Les réglages de l'utilisateur sont à lui, et Claude Code peut les réécrire à tout moment. Ce module :
// - ne touche qu'aux deux entrées de Leon (reconnues à la forme de leur commande, `pnpm … leon briefing` ou
//   `pnpm … leon capter-session`) et garde tout le reste, dans son ordre ;
// - met à jour ces entrées quand le dépôt a changé de place, au lieu d'en ajouter une seconde, et n'écrit rien
//   quand tout est déjà en place ;
// - copie le fichier dans `settings.json.leon-sauvegarde` avant d'écrire, avec les mêmes droits, mais seulement si
//   cette sauvegarde n'existe pas : la première copie, celle d'avant Leon, n'est jamais remplacée (une mise à jour de
//   ses crochets y mettrait des crochets de Leon) ;
// - écrit dans un fichier voisin puis le renomme, à travers un lien symbolique éventuel, et refuse d'écrire si le
//   fichier a changé pendant que l'utilisateur confirmait ;
// - répond clairement, sans rien modifier, à une écriture impossible (droits, disque plein) ou à un fichier qui est
//   un lien symbolique vers un fichier absent ;
// - prévient quand le `.env.local` du dépôt ne donne pas LEON_URL et LEON_TOKEN (sans eux, les commandes ne font
//   rien et ne le disent que sur la sortie d'erreur, que Claude Code ne montre pas avec le code de sortie 0) ;
// - montre ce qui part et ce qui est donné au modèle de Claude Code, puis écrit l'accord (consent.ts, version 2)
//   après la confirmation, sans jamais rabaisser un accord plus récent. Des crochets déjà en place sans cet accord
//   (installés avant lui) ne font demander que l'accord : `settings.json` n'est alors pas touché ;
// - ne recopie jamais le contenu des réglages ni les valeurs du `.env.local` dans ses messages.
//
// Sessions concernées (doc de Claude Code, https://code.claude.com/docs/en/headless et /hooks, lues le 2026-10-20) :
// le crochet est dans les réglages de l'utilisateur, donc vaut pour tous ses dossiers. Sans `--bare`, `claude -p`
// charge les crochets de `~/.claude` comme une session interactive (et sur SIGTERM exécute les crochets SessionEnd) :
// ses sessions sont envoyées elles aussi. En session interactive, Claude Code retient les crochets, même ceux de
// `~/.claude/settings.json`, tant que le dossier n'est pas approuvé (« Workspace trust ») ; `-p` ne montre jamais cette
// fenêtre et tient le dossier pour approuvé. Les crochets de tous les fichiers de réglages s'additionnent : seuls
// deux gestionnaires strictement identiques ne s'exécutent qu'une fois.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual, parseEnv } from 'node:util';
import { consentPath, FACTS_VERSION, factsConsent, writeConsent } from './consent';
import { parseServerEnv } from './env';
import { type HookSubcommand, hookCommand } from './hook-commands';

// 7,5 s au pire pour le démarrage (briefing.ts) : 10 s. Pour la fin de session, 30 s sont de la marge sur les 15 s
// de l'envoi (HOOK_DEADLINE_MS) et restent sous le maximum de 60 s de Claude Code.
export const SESSION_START_TIMEOUT_S = 10;
export const SESSION_END_TIMEOUT_S = 30;
export const SETTINGS_FILE = 'settings.json';
export const BACKUP_FILE = 'settings.json.leon-sauvegarde';

type HookEvent = 'SessionStart' | 'SessionEnd';
type HookSpec = {
  event: HookEvent;
  subcommand: HookSubcommand;
  timeout: number;
  role: string;
};

const HOOKS: readonly HookSpec[] = [
  {
    event: 'SessionStart',
    subcommand: 'briefing',
    timeout: SESSION_START_TIMEOUT_S,
    role: "at the start of a session, prints your recent sessions on this repository and the project's morning briefing: Claude Code adds them to the session context.",
  },
  {
    event: 'SessionEnd',
    subcommand: 'capter-session',
    timeout: SESSION_END_TIMEOUT_S,
    role: 'at the end of every session, sends the text of the exchanges and the actions of the session to Leon (secrets masked); the session stays private to its author.',
  },
];

// Ce qui est lu, ce qui part et ce qui est donné au modèle de Claude Code : le texte de l'accord en version 2 (C7),
// testé mot pour mot (install-hooks.test.ts). Le changer, c'est changer ce que l'utilisateur a accepté.
const CONSENT_LINES = [
  'What will be sent: these hooks are in your personal settings, so they run in ALL your Claude Code sessions, in ALL your folders (personal ones included). Sessions started by a script (`claude -p`) run them too, except with `--bare`, which loads no hooks.',
  "  - At the end of each session, the Leon server receives the text of the exchanges (your messages and Claude's answers) and the actions of the session, read from its transcript: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), Git (branch, commits, pull requests), the task list, and a few markers (start and end times, number of messages and tool errors, whether the session used the web, an MCP server, a subagent or a network command).",
  '  - Secrets are masked before sending, and again by the server. Each session stays private to its author.',
  "  - At the start of each session, the server receives the project key, the current Git branch and the session id. It sends back your recent sessions on this repository (their branch, pull requests, commits, files and remaining tasks) and the project's morning briefing: Claude Code adds this block to the session context, so it is given to Claude Code's model.",
];

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Un mot de shell : des caractères sans signification pour lui, ou des morceaux entre apostrophes ou guillemets
// (l'apostrophe d'un chemin s'écrit '\'' : hook-commands.ts).
const WORD = String.raw`(?:[^\s'"\\;&|<>()\x60]|'[^']*'|"[^"]*"|\\')+`;
// Les options de pnpm que Leon a écrites un jour dans un crochet (README du premier jet compris).
const PNPM_OPTION = String.raw`(?: -s| --silent| --config\.[A-Za-z-]+=[A-Za-z0-9-]+| (?:--dir|-C) ${WORD}| --dir=${WORD})`;

// Un crochet de Leon : `pnpm <options de pnpm> leon <sous-commande>`, et rien d'autre. Toute autre commande, même
// si elle cite `leon briefing`, est à l'utilisateur et n'est pas touchée.
function leonCommandPattern(subcommand: HookSubcommand): RegExp {
  return new RegExp(`^pnpm${PNPM_OPTION}* leon ${subcommand}$`);
}

export type HookChange = {
  event: HookEvent;
  action: 'ajout' | 'mise-a-jour' | 'inchange';
  command: string;
  timeout: number;
};

// Réglages dont la forme n'est pas celle de la doc : on n'y écrit rien. Le message est fixe, sans contenu du fichier.
export class SettingsShapeError extends Error {}

function applyHook(root: Json, spec: HookSpec, repoDir: string): HookChange {
  const wanted = {
    type: 'command',
    command: hookCommand(repoDir, spec.subcommand),
    timeout: spec.timeout,
  };
  const pattern = leonCommandPattern(spec.subcommand);

  const hooksRoot = root.hooks ?? {};
  if (!isRecord(hooksRoot)) throw new SettingsShapeError('the "hooks" key must be an object');
  const groups = hooksRoot[spec.event] ?? [];
  if (!Array.isArray(groups)) {
    throw new SettingsShapeError(`"hooks.${spec.event}" must be an array`);
  }

  let found = false;
  let changed = false;
  const kept: unknown[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      throw new SettingsShapeError(
        `each group in "hooks.${spec.event}" must be an object with a "hooks" array`,
      );
    }
    const handlers: unknown[] = [];
    let dropped = false;
    for (const handler of group.hooks) {
      const isLeon =
        isRecord(handler) &&
        typeof handler.command === 'string' &&
        pattern.test(handler.command.trim());
      if (!isLeon) {
        handlers.push(handler);
      } else if (found) {
        // Un doublon (une copie à la main du README, un ancien dépôt) : un seul crochet reste.
        dropped = true;
        changed = true;
      } else {
        found = true;
        if (!isDeepStrictEqual(handler, wanted)) changed = true;
        handlers.push(wanted);
      }
    }
    if (dropped && handlers.length === 0) continue; // le groupe n'avait que ce doublon
    kept.push({ ...group, hooks: handlers });
  }
  if (!found) kept.push({ hooks: [wanted] });

  hooksRoot[spec.event] = kept;
  root.hooks = hooksRoot;
  const action = !found ? 'ajout' : changed ? 'mise-a-jour' : 'inchange';
  return { event: spec.event, action, command: wanted.command, timeout: spec.timeout };
}

// Les réglages avec les deux crochets de Leon, sans modifier l'objet reçu. Lance SettingsShapeError si la clé
// `hooks` ou les évènements SessionStart et SessionEnd n'ont pas la forme de la doc (les autres évènements, eux,
// ne nous regardent pas).
export function addLeonHooks(
  settings: Json,
  repoDir: string,
): { settings: Json; changes: HookChange[] } {
  const next = structuredClone(settings);
  const changes = HOOKS.map((spec) => applyHook(next, spec, repoDir));
  return { settings: next, changes };
}

export function isYes(answer: string): boolean {
  return /^(?:o|oui|y|yes)$/i.test(answer.trim());
}

type Loaded =
  | { kind: 'absent' }
  | { kind: 'unreadable' }
  | { kind: 'present'; text: string; realPath: string; mode: number };

// Les réglages tels qu'ils sont sur le disque : absents, illisibles (accès refusé, dossier, lien symbolique vers un
// fichier absent…) ou présents.
async function load(path: string): Promise<Loaded> {
  let realPath: string;
  try {
    realPath = await realpath(path); // à travers un lien symbolique : on écrit le fichier lui-même
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') return { kind: 'unreadable' };
    // `realpath` répond « absent » aussi pour un lien qui ne mène nulle part (réglages versionnés dans un dossier non
    // monté) : il serait remplacé par un fichier ordinaire. Si le lien lui-même existe, on n'y touche pas.
    const linkExists = await lstat(path).then(
      () => true,
      () => false,
    );
    return linkExists ? { kind: 'unreadable' } : { kind: 'absent' };
  }
  try {
    const [text, info] = await Promise.all([readFile(realPath, 'utf8'), stat(realPath)]);
    return { kind: 'present', text, realPath, mode: info.mode & 0o777 };
  } catch {
    return { kind: 'unreadable' };
  }
}

const sameLoaded = (a: Loaded, b: Loaded) =>
  a.kind === b.kind && (a.kind !== 'present' || (b.kind === 'present' && a.text === b.text));

// Écrit dans un fichier voisin puis le renomme : un arrêt en cours d'écriture ne laisse jamais des réglages coupés.
async function writeAtomically(path: string, loaded: Loaded, text: string): Promise<void> {
  const target = loaded.kind === 'present' ? loaded.realPath : path;
  const mode = loaded.kind === 'present' ? loaded.mode : 0o600;
  const temp = `${target}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, text, { mode, flag: 'wx' });
    await chmod(temp, mode); // le masque de création (umask) ne doit pas retirer de droits au fichier d'origine
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// `home` : le dossier qui porte `.leon/accord.json` (consent.ts).
export type InstallOptions = {
  repoDir: string;
  configDir: string;
  home: string;
  assumeYes: boolean;
};
export type InstallDeps = {
  out: (text: string) => void;
  err: (text: string) => void;
  // Pose la question et rend la ligne tapée ; une chaîne vide si l'entrée est fermée.
  ask: (question: string) => Promise<string>;
};

const ACTION_LABELS: Record<HookChange['action'], string> = {
  ajout: 'add',
  'mise-a-jour': 'update',
  inchange: 'already in place',
};

// Le README est en français : la section citée garde son titre exact.
const README_HINT = `see the README, section "L'IA à jour chaque matin"`;

// Les réglages du serveur que les deux commandes liront à chaque lancement : le `.env.local` du dépôt (le script
// `leon` de package.json le charge avec `node --env-file-if-exists=.env.local`, depuis le dossier de `pnpm --dir`).
// On lit le fichier avec le même lecteur que node (`parseEnv`) et on le juge comme la CLI (`parseServerEnv`). Les
// messages de `parseServerEnv` sont fixes : aucune valeur du fichier n'est jamais recopiée.
async function serverEnvWarnings(repoDir: string): Promise<string[]> {
  const envPath = join(repoDir, '.env.local');
  let values: NodeJS.Dict<string> = {};
  try {
    values = parseEnv(await readFile(envPath, 'utf8'));
  } catch {
    // Absent ou illisible : traité comme vide.
  }
  try {
    parseServerEnv({ LEON_URL: values.LEON_URL, LEON_TOKEN: values.LEON_TOKEN });
    return [];
  } catch (error) {
    const problem = error instanceof Error ? error.message : 'invalid server settings.';
    return [
      `Warning: ${envPath} does not give the commands what they need to reach the server: ${problem} Without these, both commands do nothing and say so only on stderr, which Claude Code does not show (ignore this if you set both variables in the environment that starts Claude Code).`,
    ];
  }
}

async function warnings(settings: Json, repoDir: string): Promise<string[]> {
  const found: string[] = [];
  if (settings.disableAllHooks === true) {
    found.push(
      'Warning: "disableAllHooks" is true in these settings; as long as it stays that way, Claude Code runs no hooks.',
    );
  }
  if (repoDir.includes('/.claude/worktrees/')) {
    found.push(
      `Warning: ${repoDir} is a temporary Git worktree: if it is deleted, the hooks will stop working. Run the command from the main Leon clone, or pass that clone with --depot <path>.`,
    );
  }
  found.push(...(await serverEnvWarnings(repoDir)));
  return found;
}

type BackupPlan =
  | { kind: 'none' } // pas de fichier : rien à sauvegarder
  | { kind: 'copy'; path: string } // la sauvegarde sera créée
  | { kind: 'keep'; path: string }; // une sauvegarde existe déjà : elle est gardée telle quelle

function backupLine(backup: BackupPlan): string {
  const untouched =
    'Your other settings and hooks are not touched (their values and order stay; the formatting of the file may change)';
  if (backup.kind === 'none') {
    return `The file does not exist yet: it will be created. ${untouched}.`;
  }
  if (backup.kind === 'keep') {
    return `${untouched}. ${backup.path} already exists: that first copy is kept as is, and the current file is not copied over it.`;
  }
  return `${untouched}; the old file is copied to ${backup.path}.`;
}

function preview(path: string, changes: HookChange[], backup: BackupPlan): string[] {
  const lines = [`Leon hooks for ${path}:`, ''];
  for (const change of changes) {
    const spec = HOOKS.find((hook) => hook.event === change.event);
    lines.push(
      `  ${change.event} · timeout ${change.timeout} s · ${ACTION_LABELS[change.action]}`,
      `    ${change.command}`,
      `    ${spec?.role ?? ''}`,
      '',
    );
  }
  lines.push(
    ...CONSENT_LINES,
    'Both commands contact the server at LEON_URL, with LEON_TOKEN, both read from the .env.local file of the repository.',
    'They need `pnpm` (the version pinned in the "packageManager" field of package.json: another version would try to download the right one and exceed the timeout) and `node` 24 or later on the PATH that Claude Code sees, which a Claude Code started from an editor or an app does not always have.',
    backupLine(backup),
  );
  return lines;
}

// La copie d'avant Leon : faite une seule fois. Rend true si ce passage l'a créée.
async function saveBackup(from: string, to: string): Promise<boolean> {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'EEXIST') return false;
    throw error;
  }
}

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

// L'accord s'écrit après les réglages : s'il ne s'écrit pas, les crochets n'envoient que les textes, comme avant lui.
async function recordConsent(home: string, deps: InstallDeps): Promise<boolean> {
  const path = consentPath(home);
  try {
    await writeConsent(home, 'claude_code', FACTS_VERSION);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    deps.err(
      `Leon: could not write ${path}${typeof code === 'string' ? ` (${code})` : ''}: the hooks send only the text of the exchanges, not the actions of each session. Run the command again.`,
    );
    return false;
  }
  deps.out(`Consent recorded in ${path}.`);
  return true;
}

// Rend le code de sortie : 0 si les crochets et l'accord sont en place ou si l'utilisateur a refusé, 1 si les réglages
// n'ont pas pu être lus ou ont changé en route, ou si l'accord n'a pas pu s'écrire.
export async function installHooks(options: InstallOptions, deps: InstallDeps): Promise<number> {
  const path = join(options.configDir, SETTINGS_FILE);
  const backup = join(options.configDir, BACKUP_FILE);
  const refuse = (problem: string): number => {
    deps.err(
      `Leon: ${path} ${problem} Nothing was written. Fix the file and run the command again, or add the hooks by hand (${README_HINT}).`,
    );
    return 1;
  };

  const loaded = await load(path);
  const unreadable = () =>
    refuse(
      'is unreadable: it is not a valid JSON object (Claude Code reads strict JSON, with no comments or trailing commas) or the file is inaccessible (permissions, symbolic link to a missing file).',
    );
  if (loaded.kind === 'unreadable') return unreadable();
  let settings: Json = {};
  if (loaded.kind === 'present' && loaded.text.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(loaded.text);
    } catch {
      return unreadable();
    }
    if (!isRecord(parsed)) return unreadable();
    settings = parsed;
  }

  let plan: ReturnType<typeof addLeonHooks>;
  try {
    plan = addLeonHooks(settings, options.repoDir);
  } catch (error) {
    if (!(error instanceof SettingsShapeError)) throw error;
    return refuse(`does not have the expected shape (${error.message}).`);
  }

  const alerts = await warnings(settings, options.repoDir);
  // Absent ou plus ancien : l'accord est à demander. Un accord plus récent n'est jamais rabaissé.
  const consented = (await factsConsent(options.home, 'claude_code')) !== null;
  const consentFile = consentPath(options.home);
  if (plan.changes.every((change) => change.action === 'inchange')) {
    for (const line of alerts) deps.out(line);
    if (consented) {
      deps.out(`Both Leon hooks are already in place in ${path}: nothing to do.`);
      return 0;
    }
    // Des crochets posés avant l'accord : seul l'accord est demandé, et les réglages ne sont pas touchés.
    deps.out(
      `Both Leon hooks are already in place in ${path}, but your consent is not recorded: for now they send only the text of the exchanges.`,
    );
    for (const line of ['', ...CONSENT_LINES]) deps.out(line);
    if (!options.assumeYes) {
      const answer = await deps.ask(
        `\nRecord this consent in ${consentFile} (${path} is not modified)? [y/N] `,
      );
      if (!isYes(answer)) {
        deps.out('Nothing was written: the hooks keep sending only the text of the exchanges.');
        return 0;
      }
    }
    return (await recordConsent(options.home, deps)) ? 0 : 1;
  }

  const backupPlan: BackupPlan =
    loaded.kind !== 'present'
      ? { kind: 'none' }
      : { kind: (await exists(backup)) ? 'keep' : 'copy', path: backup };
  for (const line of preview(path, plan.changes, backupPlan)) {
    deps.out(line);
  }
  for (const line of alerts) deps.out(`\n${line}`);
  if (!options.assumeYes) {
    const answer = await deps.ask(
      `\nWrite these hooks${consented ? '' : ` and record this consent in ${consentFile}`}? [y/N] `,
    );
    if (!isYes(answer)) {
      deps.out('Nothing was written.');
      return 0;
    }
  }

  // L'utilisateur a peut-être mis longtemps à répondre : si Claude Code ou lui ont réécrit le fichier entre-temps,
  // on ne l'écrase pas.
  if (!sameLoaded(loaded, await load(path))) {
    deps.err(
      `Leon: ${path} changed during the installation. Nothing was written: run the command again.`,
    );
    return 1;
  }

  // Une écriture impossible (droits, disque plein) ne laisse rien derrière elle : pas de réglages coupés (l'écriture
  // est atomique), et la sauvegarde que ce passage vient de créer est retirée.
  let backupCreated = false;
  try {
    await mkdir(options.configDir, { recursive: true, mode: 0o700 });
    if (loaded.kind === 'present') backupCreated = await saveBackup(loaded.realPath, backup);
    await writeAtomically(path, loaded, `${JSON.stringify(plan.settings, null, 2)}\n`);
  } catch (error) {
    if (backupCreated) await unlink(backup).catch(() => {});
    const code = (error as NodeJS.ErrnoException | null)?.code;
    deps.err(
      `Leon: could not write ${path} (permissions or disk space${typeof code === 'string' ? `: ${code}` : ''}). Nothing was modified: add the hooks by hand (${README_HINT}).`,
    );
    return 1;
  }

  deps.out(`\nHooks installed in ${path}.`);
  if (backupCreated) deps.out(`The old file was copied to ${backup}.`);
  deps.out(
    `Claude Code reloads this file by itself; if it does not, the hooks apply from its next start. To remove them, delete these two entries (${README_HINT}).`,
  );
  if (!consented && !(await recordConsent(options.home, deps))) return 1;
  return 0;
}
