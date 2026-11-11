// Installateur des crochets de Claude Code : `pnpm leon installer-crochets [--oui] [--depot <chemin>]` (forme clone) et
// `leon setup` (setup.ts) écrivent, dans les réglages de l'utilisateur, le crochet de démarrage (`leon briefing`) et le
// crochet de fin de session (`leon capter-session`), après confirmation. Les deux commandes appellent le lanceur
// ~/.leon/bin/leon (K9 du plan « CLI sans clone », launcher.ts), jamais pnpm ni le Node de l'ordinateur : c'est lui qui
// sait où est la CLI, installée ou clone.
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
// - ne touche qu'aux deux entrées de Leon (reconnues à la forme de leur commande, `<lanceur> briefing` ou
//   `<lanceur> capter-session`, K9, ou l'ancienne forme `pnpm … leon <sous-commande>`) et garde tout le reste, dans son
//   ordre ;
// - remplace ces entrées sur place (un ancien crochet pnpm devient celui du lanceur) au lieu d'en ajouter une seconde, et
//   n'écrit rien quand tout est déjà en place. Sous la forme installée, il dit alors de quel clone venaient les anciens
//   crochets : le jeton du `.env.local` de ce clone ne sert plus (formerClones) ; il ne lit jamais ce fichier ;
// - copie le fichier dans `settings.json.leon-sauvegarde` avant d'écrire, avec les mêmes droits, mais seulement si
//   cette sauvegarde n'existe pas : la première copie, celle d'avant Leon, n'est jamais remplacée (une mise à jour de
//   ses crochets y mettrait des crochets de Leon) ;
// - écrit dans un fichier voisin puis le renomme, à travers un lien symbolique éventuel, et refuse d'écrire si le
//   fichier a changé pendant que l'utilisateur confirmait ;
// - répond clairement, sans rien modifier, à une écriture impossible (droits, disque plein) ou à un fichier qui est
//   un lien symbolique vers un fichier absent ;
// - prévient quand l'ordinateur n'est pas connecté (`leon login`, ~/.leon/connexion.json) et, sous la forme clone, que le
//   `.env.local` du dépôt ne donne pas non plus LEON_URL et LEON_TOKEN (sans eux, les commandes ne font rien et ne le
//   disent que sur la sortie d'erreur, que Claude Code ne montre pas avec le code de sortie 0) ;
// - montre ce qui part et ce qui est donné au modèle de Claude Code, puis écrit l'accord (consent.ts, version 2)
//   après la confirmation, sans jamais rabaisser un accord plus récent. Des crochets déjà en place sans cet accord
//   (installés avant lui) ne font demander que l'accord : `settings.json` n'est alors pas touché ;
// - une fois l'accord de base en place, propose à part, un à un, les usages `lecture`, `rappel`, `noter` puis `resume` (C7 révisé)
//   qui ne sont ni acceptés ni refusés, avec leur texte, et seulement dans un terminal sans --oui : une réponse lue d'un tube
//   peut venir d'un agent, qui ne donne jamais un usage à la place de l'utilisateur (D30 du plan de la mémoire à
//   disposition). Un refus s'écrit daté (`refus`, A16) : l'usage n'est plus proposé jusqu'au retrait. Les installateurs
//   des autres outils (install-outil.ts, install-codex.ts) font de même par offerUsages, et un usage tranché dans le
//   passage (`leon setup`, la page « Autoriser ») n'est pas redemandé. Un « non » du terminal à `noter` coupe aussi
//   `remember` pour le compte, par la route à jeton du refus (C16, T65) ; un « oui » ne le rouvre pas, et le dit ;
// - pose le crochet de message (UserPromptSubmit, `leon reminder`, T49) seulement une fois l'usage `rappel` donné, par une
//   seconde écriture des réglages après les usages (writeReminderHook), même quand les deux autres sont déjà en place ;
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
import { API_PATHS, type Usage, type UsagesRequest } from '../capture/api-contract';
import { readConnection } from './connection';
import {
  addRefusal,
  addUsage,
  type ConsentTool,
  consentPath,
  consentWithdrawn,
  FACTS_VERSION,
  type FactsConsent,
  factsConsent,
  writeConsent,
} from './consent';
import { resolveServerEnv } from './env';
import { type HookSubcommand, launcherHookCommand } from './hook-commands';

// 7,5 s au pire pour le démarrage (briefing.ts) : 10 s. Pour la fin de session, 30 s sont de la marge sur les 15 s
// de l'envoi (HOOK_DEADLINE_MS) et restent sous le maximum de 60 s de Claude Code.
export const SESSION_START_TIMEOUT_S = 10;
export const SESSION_END_TIMEOUT_S = 30;
// Le crochet de message : au pire 1 s d'entrée, 1,5 s de réseau et le démarrage de Node (reminder.ts).
export const USER_PROMPT_TIMEOUT_S = 5;
export const SETTINGS_FILE = 'settings.json';
export const BACKUP_FILE = 'settings.json.leon-sauvegarde';

type HookEvent = 'SessionStart' | 'SessionEnd' | 'UserPromptSubmit';
type HookSpec = {
  event: HookEvent;
  subcommand: HookSubcommand;
  timeout: number;
  role: string;
};

export const HOOKS: readonly HookSpec[] = [
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

// Le crochet de message (`leon reminder`, T49) : hors de HOOKS, posé seulement avec l'usage `rappel` (addLeonHooks),
// retiré avec les autres (uninstall-hooks.ts).
export const REMINDER_HOOK: HookSpec = {
  event: 'UserPromptSubmit',
  subcommand: 'reminder',
  timeout: USER_PROMPT_TIMEOUT_S,
  role: 'at each message you send, asks Leon for a line on those of your work threads it touches (usage "rappel"): Claude Code adds it to the context.',
};

// Ce qui est lu, ce qui part et ce qui est donné au modèle de Claude Code : le texte de l'accord en version 2 (C7),
// testé mot pour mot (install-hooks.test.ts). Le changer, c'est changer ce que l'utilisateur a accepté.
const CONSENT_LINES = [
  'What will be sent: these hooks are in your personal settings, so they run in ALL your Claude Code sessions, in ALL your folders (personal ones included). Sessions started by a script (`claude -p`) run them too, except with `--bare`, which loads no hooks.',
  "  - At the end of each session, the Leon server receives the text of the exchanges (your messages and Claude's answers; the messages Claude Code adds in your place, such as a background task's result, the output of a `!` or `/` command, another session's message or a script's prompt, labeled as not typed by you; a `!` command you type is sent whole) and the actions of the session, read from its transcript: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), Git (branch, commits, pull requests), the task list, and a few markers (start and end times, number of messages and tool errors, whether the session used the web, an MCP server, a subagent or a network command).",
  '  - Secrets are masked before sending, and again by the server. Each session stays private to its author.',
  "  - At the start of each session, the server receives the project key, the current Git branch and the session id. It sends back your recent sessions on this repository (their branch, pull requests, commits, files and remaining tasks) and the project's morning briefing: Claude Code adds this block to the session context, so it is given to Claude Code's model.",
];

// Le texte de l'usage `resume` (C7 révisé), testé mot pour mot : ce que le serveur envoie au fournisseur du modèle de
// Leon (le condensé de T22, à partir de 6 échanges, après la clôture de D9), et où va le résumé (T23 : à l'auteur seul,
// indexé ; jamais dans le bloc de démarrage, D25), et la limite du retrait (resume-worker.ts). Puis l'état des fils
// du lot 12 (D23, D30 : l'usage `resume` le couvre aussi ; écrit au futur avant lui, pour ne pas redemander l'accord).
// Les quatre installateurs le montrent tel quel (décision d'Amos du 11/11).
export const RESUME_LINES = [
  'Session summaries (usage "resume", optional, asked separately):',
  "  - A summary of each session is written by Leon's model provider: once a session with at least 6 of your messages has ended, the Leon server sends its actions, the state of its pull requests and the end of its exchanges (40,000 characters at most, secrets already masked) to Leon's model provider, which writes the summary. If the session goes on later, a new summary replaces the old one.",
  "  - The summary stays private to you, like the session. Leon's search finds it; it is never added to the context of a new session. Withdrawing your consent stops new summaries: it tells the Leon server this computer is connected to (only that server and account: one this computer used before is not told). If this computer is offline then, a summary already planned may still be written within an hour, and Leon later tells the server this computer is connected to by then: at the next session start of a tool that keeps its hooks, or when you run the withdrawal again.",
  "  - The same usage also keeps the state of your work threads up to date (a thread gathers the sessions, pull requests and sources about one piece of work): the Leon server sends to Leon's model provider the actions, exchanges and summaries of your sessions that have this usage, the state of their pull requests and the sources linked to the thread that you can see, and the provider writes that state. It stays private to you, like the summary. Withdrawing your consent stops this too, once the Leon server is told.",
];

// Le texte de l'usage `lecture` (C7 révisé, D24, D30 ; décisions d'Amos du 11/11), testé mot pour mot : un seul texte,
// sans nom d'outil, le même dans les quatre installateurs et sur la page « Autoriser » (T64). Ce que le bloc de démarrage
// pousse avec lui (T46 ; les leçons du lot 13, nommées dès maintenant pour ne pas redemander l'accord), ce que la
// requête de démarrage envoie en plus pour cela (les usages de l'outil et la commande, C3), ce que l'agent
// peut lire (les vrais noms des commandes et des outils), et la portée réelle : le jeton est celui de l'ordinateur, et
// les commandes envoient les usages de tous ses outils (read-commands.ts). Il ne promet donc jamais qu'un refus empêche
// un agent de lire.
export const LECTURE_LINES = [
  'Reading Leon (usage "lecture", asked separately):',
  "  - At the start of each session or conversation, Leon places in the agent's context the summary of your work threads on this repository (keys only: their id, branch, tools, dates, pull request numbers and states, number of linked sources), which replaces the list of your recent sessions, the lessons you accepted, and an instruction to read the thread of its task. The model provider of the tool sees them. For this, the start request also sends the Leon server the usages this tool accepted and the Leon command of this computer (such as `~/.leon/bin/leon`), which the instruction cites.",
  '  - The agent can read your work threads on this repository, their summaries and their state, the lessons you accepted, and the memory of this repository that you can see, with the commands `leon threads`, `leon thread`, `leon search`, `leon versions` and `leon lessons`, or with the tools `threads`, `thread`, `versions` and `lessons` if the Leon MCP server is connected to the tool. The model provider of the tool sees what it reads. This usage never lets an agent write anything to Leon.',
  '  - The `leon` commands use the token of this computer: once one of your code tools accepts this usage, they work for every agent on this computer. Refusing it in a tool only removes, in that tool, the summary, the lessons and the instruction placed at the start.',
];

// Le texte de l'usage `rappel` (C7 révisé, D26, C8 ; décisions d'Amos du 11/11 pour le lot 13), testé mot pour mot : un
// seul texte, sans nom d'outil, le même dans les installateurs des quatre outils et sur la page « Autoriser ».
// Ce qui part à chaque message et vers qui (askReminder, reminder.ts : le corps de C8, un seul signal de 1,5 s), ce que
// le serveur en fait et rend (src/server/sessions/reminder.ts : ni stocké ni journalisé, une ligne de clés), et ce qu'il
// garde (rappels_cites, purgé après 24 h par le tic horaire de worker.ts).
export const RAPPEL_LINES = [
  'Reminder at each message (usage "rappel", asked separately):',
  '  - Each time you send a message, the hook sends the first 2,000 characters of your message (secrets masked before sending, and again by the server) only to the Leon server this computer is connected to, with the project key, the current Git branch, the session id, the name of the tool and the usages this tool accepted. The server neither stores nor logs your message: it only looks for those of your work threads on this repository that it touches.',
  "  - When it touches one or two of your threads not yet cited in this session, the server sends back one line of keys (their id, branch, tools, dates, pull request numbers and states, number of linked sources), which the tool adds to the agent's context: the model provider of the tool sees it. Otherwise nothing is added. The hook waits 1.5 seconds at most: without an answer by then, your message goes on without it.",
  '  - To cite a thread only once per session, the server keeps the list of the threads already cited in each session (never the message) for 24 hours, then deletes it within the next hour.',
];

// Le texte de l'usage `noter` (C7 révisé, D30, D38, C14 ; T57 amendée le 11/11, décision 7 d'Amos pour le lot 13), testé
// mot pour mot : un seul texte, sans nom d'outil, le même dans les quatre installateurs et sur la page « Autoriser ».
// Ce qui part avec `leon note` (note-command.ts : le texte masqué puis coupé à 4 000 caractères, le projet, l'outil, la
// session, les usages de cet outil seul), ce qui est gardé (notes.ts : une source privée, versionnée, que la recherche
// trouve, jamais poussée), ce que la requête de démarrage envoie en plus (briefing.ts : usages, commande et outil) et la
// phrase qu'elle place (render-context.ts, `--session` seulement sûre pour un shell), et ce que décocher coupe : la
// phrase et `leon note` pour l'outil, et `remember` pour l'espace par le réglage du compte (C16, T65).
export const NOTER_LINES = [
  'Agent notes (usage "noter", asked separately):',
  "  - The agent can keep private notes in Leon with the command `leon note`. Each note sends the Leon server this computer is connected to the text of the note (4,000 characters at most, secrets masked before sending, and again by the server), with the project key, the name of the tool, the session id and the usages this tool accepted. The note stays private to you, like your sessions, and keeps its versions: Leon's search finds it, and it is never placed as it is in the context of a session.",
  "  - At the start of each session or conversation, the start request also sends the Leon server the usages this tool accepted, the Leon command of this computer (such as `~/.leon/bin/leon`) and the name of the tool, and Leon places in the agent's context one sentence that gives this command to write a note, with the tool and the session id filled in (the session id only when it is safe in a shell). The model provider of the tool sees it.",
  '  - Refusing it in a tool removes that sentence there, and `leon note` then sends nothing for that tool. It also turns off `remember`, the note tool of the Leon MCP server, for all the assistants connected to this Leon workspace, until you turn it back on in the Memory section of the Leon website settings.',
];

export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Un mot de shell : des caractères sans signification pour lui, ou des morceaux entre apostrophes ou guillemets
// (l'apostrophe d'un chemin s'écrit '\'' : hook-commands.ts).
const WORD = String.raw`(?:[^\s'"\\;&|<>()\x60]|'[^']*'|"[^"]*"|\\')+`;
// Les options de pnpm que Leon a écrites un jour dans un crochet (README du premier jet compris). Le dossier de
// `--dir` est capturé : c'est le clone d'où le crochet lançait Leon (formerClones).
const PNPM_OPTION = String.raw`(?: -s| --silent| --config\.[A-Za-z-]+=[A-Za-z0-9-]+| (?:--dir|-C) (${WORD})| --dir=(${WORD}))`;
const legacyPattern = (subcommand: HookSubcommand) =>
  new RegExp(`^pnpm${PNPM_OPTION}* leon ${subcommand}$`);

// Un crochet de Leon : `<lanceur> <sous-commande>` (K9, hook-commands.ts) ou, comme avant, `pnpm <options de pnpm> leon
// <sous-commande>`, et rien d'autre. Le lanceur est ~/.leon/bin/leon sous n'importe quel dossier personnel, entre
// apostrophes ou non. Toute autre commande, même si elle cite `leon briefing`, est à l'utilisateur et n'est pas touchée.
// Le retrait (uninstall-hooks.ts) reconnaît les crochets de la même façon.
const LAUNCHER_SUFFIX = '/.leon/bin/leon';
// Le mot du lanceur sans ses apostrophes ni guillemets (celles de `'\''` comprises), pour en lire la fin.
const unquote = (word: string) =>
  word.replace(
    /'([^']*)'|"([^"]*)"|\\(.)/g,
    (_all, single, double, escaped) => single ?? double ?? escaped,
  );

export function isLeonHandler(
  handler: unknown,
  subcommand: HookSubcommand,
): handler is Json & { command: string } {
  if (!isRecord(handler) || typeof handler.command !== 'string') return false;
  const command = handler.command.trim();
  if (legacyPattern(subcommand).test(command)) return true;
  const launcher = new RegExp(`^(${WORD}) ${subcommand}$`).exec(command)?.[1];
  return launcher !== undefined && unquote(launcher).endsWith(LAUNCHER_SUFFIX);
}

// Les clones d'où les crochets `pnpm … leon …` d'avant le lanceur lançaient Leon (leur `--dir`, sans les guillemets), une
// fois chacun, dans l'ordre des réglages ; `null` quand aucun crochet n'a cette forme. Un tableau vide : des crochets
// sans `--dir`, dont le clone n'est pas connu. Ne lit que les réglages reçus : jamais le `.env.local` de ces clones.
export function formerClones(settings: Json): string[] | null {
  const hooks = isRecord(settings.hooks) ? settings.hooks : {};
  let legacy = false;
  const clones = new Set<string>();
  for (const { event, subcommand } of HOOKS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
    for (const group of groups) {
      for (const handler of isRecord(group) && Array.isArray(group.hooks) ? group.hooks : []) {
        if (!isLeonHandler(handler, subcommand)) continue;
        const command = handler.command.trim();
        if (!legacyPattern(subcommand).test(command)) continue;
        legacy = true;
        for (const [, spaced, equals] of command.matchAll(new RegExp(PNPM_OPTION, 'g'))) {
          const clone = spaced ?? equals;
          if (clone) clones.add(unquote(clone));
        }
      }
    }
  }
  return legacy ? [...clones] : null;
}

// Ce que `leon setup` dit une fois les crochets passés au lanceur : le jeton du `.env.local` de l'ancien clone ne sert
// plus (la connexion de `leon login` le remplace) et se révoque dans Réglages, sous « Personal tokens » : il a été créé à
// la main, ce n'est pas un ordinateur connecté. Seule la forme installée le dit : sous la forme clone, le lanceur lance
// toujours pnpm dans un clone, dont le `.env.local` sert encore.
function migrationNotice(clones: string[]): string {
  if (clones.length === 0) {
    return 'Your hooks used to run Leon through pnpm; they now run ~/.leon/bin/leon.';
  }
  const and = (items: string[]) =>
    items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');
  const many = clones.length > 1;
  return `Your hooks used to run Leon from ${and(clones)}; they now run ~/.leon/bin/leon. The ${many ? 'tokens' : 'token'} in ${and(clones.map((clone) => join(clone, '.env.local')))} ${many ? 'are' : 'is'} no longer needed: revoke ${many ? 'them' : 'it'} in Settings › Personal tokens.`;
}

export type HookChange = {
  event: HookEvent;
  action: 'ajout' | 'mise-a-jour' | 'inchange';
  command: string;
  timeout: number;
};

// Réglages dont la forme n'est pas celle de la doc : on n'y écrit rien. Le message est fixe, sans contenu du fichier.
export class SettingsShapeError extends Error {}

function applyHook(root: Json, spec: HookSpec, home: string): HookChange {
  const wanted = {
    type: 'command',
    command: launcherHookCommand(home, spec.subcommand),
    timeout: spec.timeout,
  };
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
      if (!isLeonHandler(handler, spec.subcommand)) {
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

// Les réglages avec les deux crochets de Leon, et celui de message avec `reminder` (l'usage `rappel`), sans modifier
// l'objet reçu. Les commandes sont celles du lanceur du dossier personnel `home` (K9). Lance SettingsShapeError si la
// clé `hooks` ou les évènements de ces crochets n'ont pas la forme de la doc (les autres, eux, ne nous regardent pas).
export function addLeonHooks(
  settings: Json,
  home: string,
  reminder = false,
): { settings: Json; changes: HookChange[] } {
  const next = structuredClone(settings);
  const specs = reminder ? [...HOOKS, REMINDER_HOOK] : HOOKS;
  const changes = specs.map((spec) => applyHook(next, spec, home));
  return { settings: next, changes };
}

export function isYes(answer: string | null): boolean {
  return answer !== null && /^(?:o|oui|y|yes)$/i.test(answer.trim());
}

export type Loaded =
  | { kind: 'absent' }
  | { kind: 'unreadable' }
  | { kind: 'present'; text: string; realPath: string; mode: number };

// Les réglages tels qu'ils sont sur le disque : absents, illisibles (accès refusé, dossier, lien symbolique vers un
// fichier absent…) ou présents.
export async function load(path: string): Promise<Loaded> {
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

// Les réglages lus : {} pour un fichier absent ou vide, null pour un fichier illisible ou qui n'est pas un objet JSON
// (Claude Code lit du JSON strict). Le retrait (uninstall-hooks.ts) les lit de la même façon.
export function parseSettings(loaded: Loaded): Json | null {
  if (loaded.kind === 'unreadable') return null;
  if (loaded.kind === 'absent' || loaded.text.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(loaded.text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Le code d'une erreur du système (EACCES, ENOSPC…), seul cité dans les messages.
export const errorCode = (error: unknown): string | undefined => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' ? code : undefined;
};

const sameLoaded = (a: Loaded, b: Loaded) =>
  a.kind === b.kind && (a.kind !== 'present' || (b.kind === 'present' && a.text === b.text));

// Écrit dans un fichier voisin puis le renomme : un arrêt en cours d'écriture ne laisse jamais des réglages coupés.
export async function writeAtomically(path: string, loaded: Loaded, text: string): Promise<void> {
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

// Les usages tranchés dans ce passage, pour tous ses outils (`leon setup`, puis la page « Autoriser » au T64) : true
// accepté, false refusé, null demandé sans réponse (rien n'est écrit, ni redemandé avant le passage suivant). Chaque
// installateur les écrit après son accord de base, là où l'usage manque sans refus, et y range les réponses du terminal.
export type UsageDecisions = Map<Usage, boolean | null>;
// `interactive` : l'entrée standard est un terminal (`process.stdin.isTTY`). Sans lui, aucun usage n'est demandé.
export type UsageOptions = { interactive?: boolean; decisions?: UsageDecisions };

// `home` : le dossier qui porte `.leon` : l'accord (consent.ts) et le lanceur que les crochets appellent.
// `repoDir` : le clone de Leon sous la forme clone ; absent sous la forme installée, où ni pnpm ni `.env.local` ne sont
// en jeu et où il n'y a pas de clone dont avertir.
export type InstallOptions = {
  repoDir?: string;
  configDir: string;
  home: string;
  assumeYes: boolean;
} & UsageOptions;
export type InstallDeps = {
  out: (text: string) => void;
  err: (text: string) => void;
  // Pose la question et rend la ligne tapée ; null si l'entrée est fermée (Ctrl+D), qui n'est pas une réponse (D30).
  ask: (question: string) => Promise<string | null>;
  // Le refus de `noter` pour le compte (C16, T65 ; notesRefusal) : vrai si le serveur l'a pris. Absent, il n'a pas pu
  // partir, comme sans connexion.
  refuseNotes?: () => Promise<boolean>;
};

// Un « non » à `noter` dans le terminal (T65, C16) : la route du refus (API_PATHS.usages, `{ noter: false }`), avec la
// connexion de l'ordinateur (~/.leon/connexion.json), sous un délai court. Vrai sur 204 ; faux sans connexion, sur
// toute autre réponse (un serveur ancien répond 404) ou si le serveur est absent ou lent : l'installation continue.
const NOTES_REFUSAL_TIMEOUT_MS = 3_000;
export const notesRefusal =
  (fetchImpl: typeof fetch, home: string): (() => Promise<boolean>) =>
  async () => {
    const connection = await readConnection(home);
    if (!connection) return false;
    try {
      const response = await fetchImpl(new URL(API_PATHS.usages, connection.url), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.jeton}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noter: false } satisfies UsagesRequest),
        signal: AbortSignal.timeout(NOTES_REFUSAL_TIMEOUT_MS),
      });
      return response.status === 204;
    } catch {
      return false;
    }
  };
// Messages fixes : ni l'adresse du serveur ni le jeton.
export const NOTES_REOPEN_LINE =
  'Notes turned off for your Leon account (`remember`, for the assistants connected to this workspace) turn back on in the Memory section of the Leon website settings.';
export const NOTES_REFUSAL_FAILED =
  'Leon: the Leon server could not be told of this refusal (no connection, server unreachable or too slow, or older than this CLI): `remember` stays on for the assistants connected to this workspace. Turn it off in the Memory section of the Leon website settings.';

const ACTION_LABELS: Record<HookChange['action'], string> = {
  ajout: 'add',
  'mise-a-jour': 'update',
  inchange: 'already in place',
};

// Le README est en français : la section citée garde son titre exact.
const README_HINT = `see the README, section "L'IA à jour chaque matin"`;

// Les réglages du serveur que les deux commandes liront à chaque lancement : LEON_URL et LEON_TOKEN du `.env.local` du
// dépôt (le script `leon` de package.json le charge avec `node --env-file-if-exists=.env.local`, depuis le dossier de
// `pnpm --dir`), sinon la connexion de `leon login`. On lit le fichier avec le même lecteur que node (`parseEnv`) et
// on le juge comme la CLI (`resolveServerEnv`). Ses messages sont fixes : aucune valeur du fichier ni de la connexion
// n'est jamais recopiée.
async function serverEnvWarnings(repoDir: string | undefined, home: string): Promise<string[]> {
  const envPath = repoDir && join(repoDir, '.env.local');
  let values: NodeJS.Dict<string> = {};
  try {
    if (envPath) values = parseEnv(await readFile(envPath, 'utf8'));
  } catch {
    // Absent ou illisible : traité comme vide.
  }
  try {
    await resolveServerEnv({ LEON_URL: values.LEON_URL, LEON_TOKEN: values.LEON_TOKEN }, home);
    return [];
  } catch (error) {
    const problem = error instanceof Error ? error.message : 'invalid server settings.';
    const source = envPath
      ? `${envPath} does not give the commands what they need to reach the server`
      : 'the commands cannot reach the server';
    return [
      `Warning: ${source}: ${problem} Without a connection, both commands do nothing and say so only on stderr, which Claude Code does not show (ignore this if you set both variables in the environment that starts Claude Code).`,
    ];
  }
}

async function warnings(
  settings: Json,
  repoDir: string | undefined,
  home: string,
): Promise<string[]> {
  const found: string[] = [];
  if (settings.disableAllHooks === true) {
    found.push(
      'Warning: "disableAllHooks" is true in these settings; as long as it stays that way, Claude Code runs no hooks.',
    );
  }
  if (repoDir?.includes('/.claude/worktrees/')) {
    found.push(
      `Warning: ${repoDir} is a temporary Git worktree: if it is deleted, the hooks will stop working. Run the command from the main Leon clone, or pass that clone with --depot <path>.`,
    );
  }
  found.push(...(await serverEnvWarnings(repoDir, home)));
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

function preview(
  path: string,
  changes: HookChange[],
  backup: BackupPlan,
  cloneForm: boolean,
): string[] {
  const lines = [`Leon hooks for ${path}:`, ''];
  for (const change of changes) {
    const spec = [...HOOKS, REMINDER_HOOK].find((hook) => hook.event === change.event);
    lines.push(
      `  ${change.event} · timeout ${change.timeout} s · ${ACTION_LABELS[change.action]}`,
      `    ${change.command}`,
      `    ${spec?.role ?? ''}`,
      '',
    );
  }
  lines.push(
    ...CONSENT_LINES,
    `Both commands contact the server of the connection made by \`leon login\` (saved in ~/.leon/connexion.json), unless LEON_URL and LEON_TOKEN are both set: those come first${cloneForm ? ' (a repository clone reads them from its .env.local file)' : ''}.`,
    // Sous la forme installée, le lanceur lance son propre Node : rien à demander au PATH de Claude Code.
    ...(cloneForm
      ? [
          'They need `pnpm` (the version pinned in the "packageManager" field of package.json: another version would try to download the right one and exceed the timeout) and `node` 24 or later on the PATH that Claude Code sees, which a Claude Code started from an editor or an app does not always have.',
        ]
      : []),
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

// L'accord s'écrit après les réglages : s'il ne s'écrit pas, les crochets n'envoient que ce qu'ils envoyaient avant
// lui (le point du matin, les textes), ou rien si l'accord était retiré (consent.ts).
async function recordConsent(home: string, deps: InstallDeps): Promise<boolean> {
  const path = consentPath(home);
  const withdrawn = await consentWithdrawn(home, 'claude_code');
  try {
    await writeConsent(home, 'claude_code', FACTS_VERSION);
  } catch (error) {
    const code = errorCode(error);
    const meanwhile = withdrawn
      ? 'your consent stays withdrawn, the hooks send nothing'
      : 'at the end of each session, the hooks send only the text of the exchanges, not its actions';
    deps.err(
      `Leon: could not write ${path}${code ? ` (${code})` : ''}: ${meanwhile}. Run the command again.`,
    );
    return false;
  }
  deps.out(`Consent recorded in ${path}.`);
  return true;
}

// La commande `leon` de cette forme : rien de Leon n'est dans le PATH, la forme installée passe par son lanceur.
const leonCommand = (options: InstallOptions): string =>
  options.repoDir === undefined ? '~/.leon/bin/leon' : 'pnpm leon';

// Après un refus, comment revenir dessus (choix du plan) : le retrait de l'outil efface usages et refus. Celui de Claude
// Code dit lui-même comment redonner l'accord (CONSENT_AGAIN_HINT, le lanceur ayant pu partir avec lui) ; ceux des autres
// outils passent par le lanceur, qui reste tant qu'un outil l'utilise.
const refusedLine = (tool: ConsentTool, leon: string): string =>
  tool === 'claude_code'
    ? `This answer is kept: you will not be asked again. To change it, run \`${leon} retirer-crochets\` (it also removes the hooks and withdraws your consent), then give your consent again as that command explains.`
    : `This answer is kept: you will not be asked again. To change it, run \`~/.leon/bin/leon retirer-crochets --outil ${tool}\` (it also removes the hooks of this tool and withdraws its consent), then \`~/.leon/bin/leon setup\` again.`;

// Les usages proposés à l'installation, dans cet ordre (C7 révisé, A16 ; décisions d'Amos du 11/11 pour le lot 13).
// `lecture`, `rappel` et `noter` sont cochés par défaut, en [Y/n] : Entrée, y, yes, o et oui les acceptent ; n, no et non les
// refusent ; une autre réponse ou une entrée fermée ne tranchent rien (décision d'Amos du 11/11 : une faute de frappe ne
// vaut pas un refus gardé jusqu'au retrait). `resume` ne l'est pas, en [y/N] : seul un oui l'accepte, et seule une entrée
// fermée ne tranche rien (D30).
const checkedByDefault = (text: string | null): boolean | null => {
  if (text === null) return null;
  if (text.trim() === '' || isYes(text)) return true;
  return /^(?:n|no|non)$/i.test(text.trim()) ? false : null;
};
type Offer = {
  lines: readonly string[];
  question: (path: string) => string;
  answer: (text: string | null) => boolean | null;
  recorded: string;
  without: string; // ce qui manque sans l'usage
};
const OFFERED = ['lecture', 'rappel', 'noter', 'resume'] as const;
const OFFERS: Record<(typeof OFFERED)[number], Offer> = {
  lecture: {
    lines: LECTURE_LINES,
    question: (path) =>
      `\nLet the agents of the code tools set up now read Leon this way (recorded in ${path})? [Y/n] `,
    answer: checkedByDefault,
    recorded: 'Reading Leon recorded',
    without: 'Leon places no summary of your threads at the start of a session',
  },
  rappel: {
    lines: RAPPEL_LINES,
    question: (path) =>
      `\nAt each message, let Leon remind the agent of your work threads it touches (recorded in ${path})? [Y/n] `,
    answer: checkedByDefault,
    recorded: 'Reminder recorded',
    without: 'Leon reminds the agent of no thread at each message',
  },
  noter: {
    lines: NOTER_LINES,
    question: (path) =>
      `\nLet the agents of the code tools set up now keep private notes in Leon (recorded in ${path})? [Y/n] `,
    answer: checkedByDefault,
    recorded: 'Agent notes recorded',
    without: 'the agent writes no note to Leon',
  },
  resume: {
    lines: RESUME_LINES,
    question: (path) =>
      `\nAlso let Leon's model provider write a summary of each session and keep the state of your work threads up to date (recorded in ${path})? [y/N] `,
    answer: (text) => (text === null ? null : isYes(text)),
    recorded: 'Session summaries recorded',
    without: 'no session is summarized',
  },
};

// Les usages qui restent pour un outil sur son accord de base : manquants et jamais refusés (A16), puis tranchés dans
// ce passage, ou à demander dans un terminal sans --oui (D30). Vide : l'installateur n'a plus rien à faire pour eux.
// Les mêmes pour les quatre outils : `rappel` compris, depuis l'essai d'Antigravity 2.0.6 du 11/11 (annexe 05).
export function usagesToOffer(
  consent: FactsConsent | null,
  options: UsageOptions & { assumeYes: boolean },
): (typeof OFFERED)[number][] {
  if (consent === null) return [];
  return OFFERED.filter((usage) => {
    if (consent.usages.includes(usage) || consent.refus.includes(usage)) return false;
    const decided = options.decisions?.get(usage);
    return decided === undefined
      ? options.interactive === true && !options.assumeYes
      : decided !== null;
  });
}

// Propose un à un, après l'accord de base, les usages qui restent pour cet outil, avec leur texte ; une décision du
// passage n'est pas redemandée, et une réponse du terminal y est rangée pour les outils suivants. Un refus ne change
// pas ce qui part ; il s'écrit daté, pour ne plus être redemandé. Rend false si un usage accepté n'a pas pu s'écrire
// (les suivants ne sont pas demandés) ; un refus qui ne s'écrit pas n'est qu'une question qui reviendra.
// `leon` : la commande de la forme de Leon, pour la ligne qui suit un refus de Claude Code.
export async function offerUsages(
  tool: ConsentTool,
  options: UsageOptions & { home: string; assumeYes: boolean; leon?: string },
  deps: InstallDeps,
): Promise<boolean> {
  const path = consentPath(options.home);
  const decisions: UsageDecisions = options.decisions ?? new Map();
  const pending = usagesToOffer(await factsConsent(options.home, tool), {
    ...options,
    decisions,
  });
  for (const usage of pending) {
    const offer = OFFERS[usage];
    let accepted = decisions.get(usage);
    if (accepted === undefined) {
      for (const line of ['', ...offer.lines]) deps.out(line);
      accepted = offer.answer(await deps.ask(offer.question(path)));
      decisions.set(usage, accepted);
      // La réponse du terminal à `noter` vaut aussi pour `remember` (T65) ; une case de la page passe par l'échange du code.
      if (usage === 'noter' && accepted === true) deps.out(NOTES_REOPEN_LINE);
      if (usage === 'noter' && accepted === false && !(await deps.refuseNotes?.())) {
        deps.err(NOTES_REFUSAL_FAILED);
      }
    }
    if (accepted === true) {
      try {
        await addUsage(options.home, tool, usage);
      } catch (error) {
        const code = errorCode(error);
        deps.err(
          `Leon: could not write ${path}${code ? ` (${code})` : ''}: ${offer.without}. Run the command again.`,
        );
        return false;
      }
      deps.out(`${offer.recorded} in ${path}.`);
      continue;
    }
    deps.out(`Nothing was added: ${offer.without}.`);
    // Pas de réponse (entrée fermée, ou ni oui ni non) : rien n'est gardé, la question reviendra (D30).
    if (accepted === null) continue;
    try {
      await addRefusal(options.home, tool, usage);
    } catch (error) {
      const code = errorCode(error);
      deps.err(
        `Leon: could not write ${path}${code ? ` (${code})` : ''}: your answer is not kept, the question will come back.`,
      );
      continue;
    }
    deps.out(refusedLine(tool, options.leon ?? '~/.leon/bin/leon'));
  }
  return true;
}

// Le crochet de message, une fois `rappel` donné après les crochets de base (dans le terminal ou par la page, T49) : une
// seconde écriture des réglages, relus à l'instant. `plan` rend les réglages avec lui (les mêmes s'il y est déjà), null
// pour une forme inconnue. `backup` : la copie d'avant Leon, faite si elle n'existe pas encore (Claude Code). Rend
// 'inchange', 'ecrit', ou 'echec' (dit sur la sortie d'erreur ; l'usage reste écrit, le passage suivant repose le crochet).
export async function writeReminderHook(
  path: string,
  plan: (settings: Json) => Json | null,
  deps: Pick<InstallDeps, 'err'>,
  backup?: string,
): Promise<'inchange' | 'ecrit' | 'echec'> {
  const loaded = await load(path);
  const settings = parseSettings(loaded);
  const next = settings && plan(settings);
  if (settings === null || next === null) {
    deps.err(
      `Leon: ${path} is unreadable or does not have the expected shape: the reminder hook was not added. Fix the file and run the command again.`,
    );
    return 'echec';
  }
  if (isDeepStrictEqual(next, settings)) return 'inchange';
  let backupCreated = false;
  try {
    if (backup && loaded.kind === 'present')
      backupCreated = await saveBackup(loaded.realPath, backup);
    await writeAtomically(path, loaded, `${JSON.stringify(next, null, 2)}\n`);
  } catch (error) {
    if (backupCreated && backup) await unlink(backup).catch(() => {});
    const code = errorCode(error);
    deps.err(
      `Leon: could not write ${path}${code ? ` (${code})` : ''}: the reminder hook was not added. Run the command again.`,
    );
    return 'echec';
  }
  return 'ecrit';
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
  const settings = parseSettings(loaded);
  if (settings === null) {
    return refuse(
      'is unreadable: it is not a valid JSON object (Claude Code reads strict JSON, with no comments or trailing commas) or the file is inaccessible (permissions, symbolic link to a missing file).',
    );
  }

  // Absent ou plus ancien : l'accord est à demander. Un accord plus récent n'est jamais rabaissé.
  const consent = await factsConsent(options.home, 'claude_code');
  const consented = consent !== null;
  let plan: ReturnType<typeof addLeonHooks>;
  try {
    plan = addLeonHooks(settings, options.home, consent?.usages.includes('rappel'));
  } catch (error) {
    if (!(error instanceof SettingsShapeError)) throw error;
    return refuse(`does not have the expected shape (${error.message}).`);
  }

  const former = formerClones(settings);
  const alerts = await warnings(settings, options.repoDir, options.home);
  const consentFile = consentPath(options.home);
  if (plan.changes.every((change) => change.action === 'inchange')) {
    for (const line of alerts) deps.out(line);
    if (consented) {
      if (usagesToOffer(consent, options).length === 0) {
        deps.out(`The Leon hooks are already in place in ${path}: nothing to do.`);
        return 0;
      }
      deps.out(`The Leon hooks are already in place in ${path}.`);
      return (await offerClaudeCodeUsages(options, deps)) ? 0 : 1;
    }
    // Des crochets posés avant l'accord, ou restés après son retrait (retrait des réglages raté, crochets remis à la
    // main) : seul l'accord est demandé, et les réglages ne sont pas touchés.
    const withdrawn = await consentWithdrawn(options.home, 'claude_code');
    deps.out(
      withdrawn
        ? `The Leon hooks are already in place in ${path}, but your consent was withdrawn: for now, they send nothing.`
        : `The Leon hooks are already in place in ${path}, but your consent is not recorded: for now, at the end of each session, they send only the text of the exchanges, not its actions.`,
    );
    for (const line of ['', ...CONSENT_LINES]) deps.out(line);
    if (!options.assumeYes) {
      const answer = await deps.ask(
        `\nRecord this consent in ${consentFile} (${path} is not modified)? [y/N] `,
      );
      if (!isYes(answer)) {
        deps.out(
          withdrawn
            ? 'Nothing was written: the hooks keep sending nothing.'
            : 'Nothing was written: at the end of each session, the hooks keep sending only the text of the exchanges, not its actions.',
        );
        return 0;
      }
    }
    return (await recordConsent(options.home, deps)) && (await offerClaudeCodeUsages(options, deps))
      ? 0
      : 1;
  }

  const backupPlan: BackupPlan =
    loaded.kind !== 'present'
      ? { kind: 'none' }
      : { kind: (await exists(backup)) ? 'keep' : 'copy', path: backup };
  for (const line of preview(path, plan.changes, backupPlan, options.repoDir !== undefined)) {
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
    const code = errorCode(error);
    deps.err(
      `Leon: could not write ${path} (permissions or disk space${code ? `: ${code}` : ''}). Nothing was modified: add the hooks by hand (${README_HINT}).`,
    );
    return 1;
  }

  deps.out(`\nHooks installed in ${path}.`);
  if (backupCreated) deps.out(`The old file was copied to ${backup}.`);
  if (former !== null && options.repoDir === undefined) deps.out(migrationNotice(former));
  deps.out(
    `Claude Code reloads this file by itself; if it does not, the hooks apply from its next start. To remove them, run \`${leonCommand(options)} retirer-crochets\` (it also withdraws your consent).`,
  );
  if (!consented && !(await recordConsent(options.home, deps))) return 1;
  return (await offerClaudeCodeUsages(options, deps)) ? 0 : 1;
}

// Les usages, puis le crochet de message si `rappel` est donné (T49).
async function offerClaudeCodeUsages(options: InstallOptions, deps: InstallDeps): Promise<boolean> {
  if (!(await offerUsages('claude_code', { ...options, leon: leonCommand(options) }, deps))) {
    return false;
  }
  if (!(await factsConsent(options.home, 'claude_code'))?.usages.includes('rappel')) return true;
  const path = join(options.configDir, SETTINGS_FILE);
  const outcome = await writeReminderHook(
    path,
    (settings) => {
      try {
        return addLeonHooks(settings, options.home, true).settings;
      } catch (error) {
        if (error instanceof SettingsShapeError) return null;
        throw error;
      }
    },
    deps,
    join(options.configDir, BACKUP_FILE),
  );
  if (outcome === 'ecrit') {
    deps.out(
      `Reminder hook installed in ${path}: UserPromptSubmit · timeout ${USER_PROMPT_TIMEOUT_S} s · ${launcherHookCommand(options.home, 'reminder')}`,
    );
  }
  return outcome !== 'echec';
}
