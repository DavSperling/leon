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
// - copie l'ancien fichier dans `settings.json.leon-sauvegarde` avant d'écrire, avec les mêmes droits ;
// - écrit dans un fichier voisin puis le renomme, à travers un lien symbolique éventuel, et refuse d'écrire si le
//   fichier a changé pendant que l'utilisateur confirmait ;
// - ne recopie jamais le contenu des réglages dans ses messages.
import { randomBytes } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
    role: "au démarrage d'une session, affiche le point du matin du projet : Claude Code l'ajoute au contexte de la session.",
  },
  {
    event: 'SessionEnd',
    subcommand: 'capter-session',
    timeout: SESSION_END_TIMEOUT_S,
    role: "à la fin d'une session, envoie le texte des échanges à Leon (secrets masqués) ; la conversation reste privée à son auteur.",
  },
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
  if (!isRecord(hooksRoot)) throw new SettingsShapeError('la clé « hooks » doit être un objet');
  const groups = hooksRoot[spec.event] ?? [];
  if (!Array.isArray(groups)) {
    throw new SettingsShapeError(`« hooks.${spec.event} » doit être une liste`);
  }

  let found = false;
  let changed = false;
  const kept: unknown[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      throw new SettingsShapeError(
        `chaque groupe de « hooks.${spec.event} » doit être un objet avec une liste « hooks »`,
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

// Les réglages tels qu'ils sont sur le disque : absents, illisibles (accès refusé, dossier…) ou présents.
async function load(path: string): Promise<Loaded> {
  try {
    const realPath = await realpath(path); // à travers un lien symbolique : on écrit le fichier lui-même
    const [text, info] = await Promise.all([readFile(realPath, 'utf8'), stat(realPath)]);
    return { kind: 'present', text, realPath, mode: info.mode & 0o777 };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === 'ENOENT' ? { kind: 'absent' } : { kind: 'unreadable' };
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

export type InstallOptions = { repoDir: string; configDir: string; assumeYes: boolean };
export type InstallDeps = {
  out: (text: string) => void;
  err: (text: string) => void;
  // Pose la question et rend la ligne tapée ; une chaîne vide si l'entrée est fermée.
  ask: (question: string) => Promise<string>;
};

const ACTION_LABELS: Record<HookChange['action'], string> = {
  ajout: 'ajout',
  'mise-a-jour': 'mise à jour',
  inchange: 'déjà en place',
};

const README_HINT = "voir le README, section « L'IA à jour chaque matin »";

function warnings(settings: Json, repoDir: string): string[] {
  const found: string[] = [];
  if (settings.disableAllHooks === true) {
    found.push(
      "Attention : « disableAllHooks » vaut true dans ces réglages ; tant qu'il y reste, Claude Code n'exécute aucun crochet.",
    );
  }
  if (repoDir.includes('/.claude/worktrees/')) {
    found.push(
      `Attention : ${repoDir} est un dossier de travail temporaire (un worktree) : s'il est supprimé, les crochets cesseront de marcher. Lancez la commande depuis le clone principal de Leon, ou donnez-le avec --depot <chemin>.`,
    );
  }
  return found;
}

function preview(path: string, changes: HookChange[], backup: string | null): string[] {
  const lines = [`Crochets de Leon pour ${path} :`, ''];
  for (const change of changes) {
    const spec = HOOKS.find((hook) => hook.event === change.event);
    lines.push(
      `  ${change.event} · délai ${change.timeout} s · ${ACTION_LABELS[change.action]}`,
      `    ${change.command}`,
      `    ${spec?.role ?? ''}`,
      '',
    );
  }
  lines.push(
    'Les deux commandes parlent au serveur de LEON_URL, avec LEON_TOKEN, lus dans le fichier .env.local du dépôt.',
    backup === null
      ? "Le fichier n'existe pas encore : il sera créé. Vos autres réglages et crochets ne sont pas touchés."
      : `Vos autres réglages et crochets ne sont pas touchés ; l'ancien fichier est copié dans ${backup}.`,
  );
  return lines;
}

// Rend le code de sortie : 0 si les crochets sont en place ou si l'utilisateur a refusé, 1 si les réglages n'ont pas
// pu être lus ou ont changé en route.
export async function installHooks(options: InstallOptions, deps: InstallDeps): Promise<number> {
  const path = join(options.configDir, SETTINGS_FILE);
  const backup = join(options.configDir, BACKUP_FILE);
  const refuse = (problem: string): number => {
    deps.err(
      `Leon : ${path} ${problem} Rien n'a été écrit. Corrigez le fichier puis relancez la commande, ou ajoutez les crochets à la main (${README_HINT}).`,
    );
    return 1;
  };

  const loaded = await load(path);
  const unreadable = () =>
    refuse(
      "est illisible : ce n'est pas un objet JSON valide (Claude Code lit du JSON strict, sans commentaire ni virgule finale) ou le fichier est inaccessible.",
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
    return refuse(`n'a pas la forme attendue (${error.message}).`);
  }

  const alerts = warnings(settings, options.repoDir);
  if (plan.changes.every((change) => change.action === 'inchange')) {
    for (const line of alerts) deps.out(line);
    deps.out(`Les deux crochets de Leon sont déjà en place dans ${path} : rien à faire.`);
    return 0;
  }

  for (const line of preview(path, plan.changes, loaded.kind === 'present' ? backup : null)) {
    deps.out(line);
  }
  for (const line of alerts) deps.out(`\n${line}`);
  if (!options.assumeYes) {
    const answer = await deps.ask('\nÉcrire ces crochets ? [o/N] ');
    if (!isYes(answer)) {
      deps.out("Rien n'a été écrit.");
      return 0;
    }
  }

  // L'utilisateur a peut-être mis longtemps à répondre : si Claude Code ou lui ont réécrit le fichier entre-temps,
  // on ne l'écrase pas.
  if (!sameLoaded(loaded, await load(path))) {
    deps.err(
      `Leon : ${path} a changé pendant l'installation. Rien n'a été écrit : relancez la commande.`,
    );
    return 1;
  }

  await mkdir(options.configDir, { recursive: true, mode: 0o700 });
  if (loaded.kind === 'present') await copyFile(loaded.realPath, backup);
  await writeAtomically(path, loaded, `${JSON.stringify(plan.settings, null, 2)}\n`);

  deps.out(`\nCrochets installés dans ${path}.`);
  if (loaded.kind === 'present') deps.out(`L'ancien fichier est copié dans ${backup}.`);
  deps.out(
    `Claude Code relit ce fichier tout seul ; sinon, ils servent dès le prochain démarrage. Pour les retirer, supprimez ces deux entrées (${README_HINT}).`,
  );
  return 0;
}
