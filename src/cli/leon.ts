import { readFile, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { API_PATHS } from '../capture/api-contract';
import { CODE_SESSION_KINDS } from '../capture/turn';
import { runBriefing } from './briefing';
import {
  captureSessionFromHook,
  captureToolHook,
  HOOK_DEADLINE_MS,
  isOtherToolHook,
  parseDeadlineMs,
  readHookStdin,
} from './capture-session';
import { catchUp, catchUpNeeded, readEntryFile } from './catch-up';
import { CONSENT_WITHDRAWN_MESSAGE, consentWithdrawn, factsConsent } from './consent';
import { startDetached } from './detach';
import { claudeConfigDir, resolveServerEnv, type ServerEnv } from './env';
import { OUTILS, type Outil } from './hook-commands';
import {
  countOf,
  createFactsSender,
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importClaudeCode,
  parseSince,
} from './import-claude-code';
import { installAntigravityHooks, uninstallAntigravityHooks } from './install-antigravity';
import { codexHome, installCodexHook, uninstallCodexHook } from './install-codex';
import { installCursorHooks, uninstallCursorHooks } from './install-cursor';
import { installHooks, notesRefusal } from './install-hooks';
import {
  type LoginDeps,
  type LoginResult,
  loginComputer,
  openInBrowser,
  parseLoginArgs,
  RELAUNCH_WAIT_MS,
  readTokenFromInput,
  runLogin,
  runLogout,
} from './login';
import { runNoteCommand } from './note-command';
import { ADAPTATEURS } from './outils';
import { gitInDirectory } from './project-key';
import { runReadCommand } from './read-commands';
import { runReminder } from './reminder';
import {
  NODE_DIST,
  nodePlatform,
  runUpdate,
  scheduleUpdate,
  startBackgroundUpdate,
} from './self-update';
import { ensureLauncher, isLeonRepo, runSetup, type SetupLogin } from './setup';
import {
  connectionWithdrawal,
  tellBeforeConsent,
  type UninstallDeps,
  uninstallHooks,
} from './uninstall-hooks';

// Le dépôt de Leon qui lance la commande (le dossier qui contient src/cli/leon.ts). Cette valeur ne vaut que sous la
// forme clone : dans le fichier construit (vite.cli.config.ts), import.meta.url pointe vers ~/.leon/cli/<version>/,
// et `installer-crochets` refuse alors ce dossier tant que --depot n'en désigne pas un. `leon setup` n'en dépend pas :
// sa forme clone vient de --depot seul.
const CLI_REPO_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)));

// Injectée par la construction (`define`, vite.cli.config.ts) ; absente sous le clone, qui lance le TypeScript.
declare const __LEON_CLI_VERSION__: string | undefined;
const CLI_VERSION = typeof __LEON_CLI_VERSION__ === 'string' ? __LEON_CLI_VERSION__ : 'dev';

// Après `leon retirer-crochets`, Claude Code est en version 0 dans l'accord : plus rien ne part, même d'un crochet
// resté dans les réglages d'un projet (C7). `briefing` le vérifie lui-même (briefing.ts).
const withdrawn = () => consentWithdrawn(homedir(), 'claude_code');

const HELP = `Usage: leon <command>
       (~/.leon/bin/leon <command> once Leon is installed; pnpm leon <command> from a clone)

Commands:
  setup                Set up this computer in one go: write the launcher ~/.leon/bin/leon, connect the computer (leon
                       login) if it is not yet, then put the hooks in the code tools found here (Claude Code, Codex,
                       Cursor, Antigravity), after showing what is sent and asking. In a terminal, it then offers
                       the usages (\`lecture\`, \`rappel\`, \`noter\`, \`resume\`) once for all these tools; when it opens
                       the browser, the authorization page shows \`lecture\`, \`rappel\` and \`noter\` as boxes, yours to
                       tick or untick.
                       Older hooks that ran pnpm in a clone are replaced in place; your other hooks and your consent
                       in ~/.leon/accord.json are kept. Run it again at any time: what is in place is left alone
      --url <address>      the Leon server for leon login (default: LEON_URL, then the saved connection)
      --depot <path>       run Leon from this clone (pnpm) instead of the installed copy: the launcher is written in
                           its clone form
      --yes                do not ask for confirmation (a launcher that points to a clone is still asked about); it
                           gives no usage by itself: on a computer already connected, it opens the authorization
                           page again (about 100 seconds) when a usage of the tools found here is not chosen yet
  import-claude-code   Import Claude Code sessions (~/.claude/projects, or CLAUDE_CONFIG_DIR)
      --project <path>     keep only the sessions started under this folder
      --since YYYY-MM-DD   keep only the turns from this date on
      --dry-run            print what would be sent (one JSON line per request), send nothing
  briefing             Send the project key (plus the current Git branch and the session id, if ~/.leon/accord.json
                       allows it) and print the block that comes back: your recent sessions on this repository and
                       the project's morning briefing (for Claude Code's SessionStart hook: the hook JSON is read
                       from standard input). With the reading consent (\`lecture\`) of the tool, it also sends that
                       consent and the Leon command of this computer, and your threads of this repository come back
                       instead of your sessions, with how to read one
  capter-session       Send the session that is ending: the text of the exchanges, with its project, and the actions
                       of the session if ~/.leon/accord.json allows it (for Claude Code's SessionEnd hook: the hook
                       JSON is read from standard input)
      --delai-ms <n>       shorten the network timeout of the upload, 15000 ms at most (for testing)
  reminder             Print a one-line reminder of your threads that touch the message you are sending, or nothing
                       (for Claude Code's UserPromptSubmit hook: the hook JSON is read from standard input). Only with
                       the \`rappel\` consent of Claude Code in ~/.leon/accord.json: then the first 2,000 characters of
                       the message, with secrets masked, and the project, the branch, the session and the consents of
                       the tool, go to your Leon server, which neither stores nor logs the message. A slow, missing or
                       older server prints nothing, within 2 seconds
  crochet <tool> <event>
                       The hook of a code tool other than Claude Code (what its hooks run, the hook JSON on standard
                       input), for codex, cursor or antigravity: \`demarrage\` (start of a session) and \`prompt\` (first
                       message of a conversation, once: Cursor, Antigravity) print the same block as briefing, in the
                       format of the tool; \`prompt\` also prints the reminder of \`leon reminder\` at each message
                       of Cursor, Codex and Antigravity, if their \`rappel\` consent is recorded (for Codex it prints only
                       that; for Antigravity, at the first model call of each message, in a version whose hook
                       receives the message, tried with the app 2.0.6); never without a working folder in the hook JSON;
                       \`tour\` (after each turn) and \`fin\` (end of a session) send the new exchanges of the session,
                       and its actions, if ~/.leon/accord.json allows the capture of this tool, and print only what the
                       tool expects (Cursor, Antigravity: \`{}\`). Any other tool or event prints nothing
      --entree <file>      (fin) read the hook JSON from this file of ~/.leon/entrees instead, then delete it (what
                           the launcher ~/.leon/bin/leon passes once it has handed control back to Codex)
  rattraper            Catch up the sessions of the code tools whose capture you accepted (Codex, Cursor, Antigravity):
                       send what their hooks missed since the last capture (a session left with /quit, a failed
                       upload). Only the files changed since that consent are read. Started in the background by
                       Leon's start hook: at the start of a Claude Code or Codex session, or at the first message of a
                       Cursor or Antigravity conversation
  threads              Print the threads of this repository (the work of your sessions, grouped by branch), the
                       current branch first
  thread [id]          Print a thread: its state, its sessions, PRs and linked sources (no id: the thread of the
                       current branch)
  search <query>       Search Leon, within this repository only
  versions <id>        List the readable versions of a thread's state, or of a lesson
      --read <n>           print version n instead (nothing is restored from your computer)
  lessons [id]         Print the lessons you accepted for this repository, and those that apply to all your
                       repositories (with an id: that lesson only). Lessons are written on the website only
                       These five print to standard output and write nothing on disk. They need a connection and
                       the reading consent (\`lecture\`) of one of your code tools, which leon setup offers in a terminal
  note <text>          Save a private note of the agent to Leon, or the next version of one. Only with the \`noter\`
                       consent of that tool in ~/.leon/accord.json: then the text, with secrets masked (4,000
                       characters at most), the project, the tool, the session and the consents of that tool go to
                       your Leon server. The note stays private to you; Leon's search finds it, and it is never put as
                       is in the context of a session. Prints the id and the version number, writes nothing on disk.
                       The start block of a session gives this command with --tool and --session filled in
      --tool <tool>        the code tool that writes it: claude_code, codex, cursor or antigravity (required)
      --session <id>       the session it is written in
      --note <id>          with --version: write the next version of this note (only from the tool that wrote it)
      --version <n>        the number of the last version of that note you read
  login                Connect this computer to Leon: opens your browser to authorize it, then saves the connection
                       in ~/.leon/connexion.json (the commands below use it; LEON_URL and LEON_TOKEN, when both are
                       set, take precedence)
      --url <address>      the Leon server (default: LEON_URL, then the saved connection)
      --with-token         paste a token created in Settings instead (for a browser on another computer)
  logout               Revoke this computer's token and remove ~/.leon/connexion.json
  update               Install the latest version of Leon if the server of leon login has one: its command line and, when it changed,
                       Node. The old version is kept for leon update --previous. Leon also does it on its own, in
                       the background, at most once a day (when a session starts, after briefing has answered).
                       It touches neither your consent, your connection, the launcher nor the hooks. Not from a
                       clone: a clone is updated with git
      --previous           go back to the previous version of the command line (no network)
      --background         write nothing on the terminal (what briefing runs)
  installer-crochets   For a clone: write the clone form of the launcher ~/.leon/bin/leon, then the SessionStart
                       (briefing) and SessionEnd (capter-session) hooks into Claude Code's settings
                       (~/.claude/settings.json, or CLAUDE_CONFIG_DIR) and record your consent in ~/.leon/accord.json,
                       after confirmation (only the consent when the hooks are already there); in a terminal, then
                       the usages (\`lecture\`, \`rappel\`, \`noter\`, \`resume\`) that are neither accepted nor refused
      --oui                do not ask for confirmation (a launcher that points to a clone is still asked about)
      --depot <path>       Leon repository the launcher runs (default: the one running this command)
      --outil <tool>       codex: its hooks in \${CODEX_HOME:-~/.codex}/hooks.json; cursor: in ~/.cursor/hooks.json;
                           antigravity: the entry "leon" of ~/.gemini/config/hooks.json
  retirer-crochets     Remove the Leon hooks from Claude Code's settings and withdraw your consent in
                       ~/.leon/accord.json: from then on, nothing is sent from Claude Code, and the Leon
                       server of the connection is told. The launcher
                       ~/.leon/bin/leon goes too, once no tool is left that uses it
                       and the server was told
      --outil <tool>       the tool to remove: claude_code (the default), codex, cursor or antigravity
  --version            Print the version of this CLI ("dev" when run from a clone)

Real uploads (import-claude-code without --dry-run), briefing, capter-session and the reading commands need a
connection (leon login), or LEON_URL and LEON_TOKEN.`;

function summaryLine(summary: ImportSummary, dryRun: boolean): string {
  const sent = dryRun ? 'to send' : 'sent';
  return `${countOf(summary.sessions, 'session')}, ${countOf(summary.turnsSent, 'turn')} ${sent}: ${summary.inserted} new, ${summary.skipped} already known, ${countOf(summary.failures, 'failure')}.`;
}

async function runImport(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: 'string' },
      since: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const since = parseSince(values.since);
  const dryRun = values['dry-run'] ?? false;
  if (await withdrawn()) throw new Error(CONSENT_WITHDRAWN_MESSAGE);
  const nothingSent = async (): Promise<never> => {
    throw new Error('Nothing is sent with --dry-run.');
  };
  const env = dryRun ? null : await resolveServerEnv(process.env, homedir());
  // Les faits de chaque session ne partent que si l'accord local le permet (consent.ts), et seulement ceux des
  // fichiers modifiés après lui ; chaque usage, seulement avec les fichiers modifiés après sa propre date.
  const accord = await factsConsent(homedir(), 'claude_code');
  const deps: ImportDeps = {
    out: console.log,
    git: gitInDirectory,
    withdrawn,
    send: env ? createIngestSender(fetch, env) : nothingSent,
    ...(accord === null
      ? {}
      : {
          facts: {
            accord: accord.version,
            accordLe: accord.installe_le,
            usages: accord.usages,
            depuis: accord.installe_le,
            usagesDepuis: accord.usages_le,
            send: env ? createFactsSender(fetch, env) : nothingSent,
          },
        }),
  };

  const summary = await importClaudeCode(
    {
      baseDir: claudeConfigDir(process.env),
      project: values.project ? resolve(values.project) : undefined,
      since,
      dryRun,
    },
    deps,
  );
  console.error(summaryLine(summary, dryRun));
  return summary.failures > 0 ? 1 : 0;
}

// Le crochet SessionStart ajoute stdout au contexte de la session : seul le bloc de démarrage y passe,
// et le code de sortie vaut toujours 0 pour ne jamais gêner Claude Code (voir briefing.ts).
async function runBriefingCommand(
  outil?: Outil,
  evenement: 'demarrage' | 'prompt' = 'demarrage',
): Promise<number> {
  try {
    return await runBriefing({
      ...(outil ? { outil, evenement } : {}),
      // Depuis un clone, la consigne du bloc cite pnpm dans ce clone quand le lanceur manque.
      ...(CLI_VERSION === 'dev' ? { depot: CLI_REPO_DIR } : {}),
      stdin: process.stdin,
      env: process.env,
      cwd: process.cwd(),
      home: homedir(),
      git: gitInDirectory,
      fetch,
      out: console.log,
      err: console.error,
      // Le rattrapage des outils dont la capture est acceptée (T19), et des retraits que le serveur n'a pas appris
      // (T43), détaché lui aussi.
      scheduleCatchUp: async () => {
        if (await catchUpNeeded(homedir())) startDetached(['rattraper']);
      },
      // La mise à jour automatique (S12) : décidée et lancée détachée, une fois le bloc écrit.
      scheduleUpdate: () =>
        scheduleUpdate({
          home: homedir(),
          cliVersion: CLI_VERSION,
          now: () => new Date(),
          start: () =>
            startBackgroundUpdate({
              node: process.execPath,
              script: process.argv[1],
              home: homedir(),
            }),
        }),
    });
  } catch {
    console.error('Leon: briefing unavailable (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// Le crochet UserPromptSubmit de Claude Code : sa sortie standard va au contexte du modèle, seule la ligne de rappel
// y passe, et le code de sortie vaut toujours 0 (reminder.ts).
async function runReminderCommand(): Promise<number> {
  try {
    return await runReminder({
      stdin: process.stdin,
      env: process.env,
      cwd: process.cwd(),
      home: homedir(),
      git: gitInDirectory,
      fetch,
      out: console.log,
      err: console.error,
    });
  } catch {
    console.error('Leon: reminder unavailable (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// Le serveur MCP de la connexion : le serveur `leon` de la configuration d'un outil n'est reconnu que s'il y mène
// (leon-mcp.ts, T44).
const mcpUrlOf = (env: ServerEnv) => new URL(API_PATHS.mcp, env.url).href;

// Le crochet SessionEnd ne doit jamais gêner Claude Code : le code de sortie vaut toujours 0 et les messages
// ne citent ni la session ni l'adresse du serveur (voir capture-session.ts). Rien n'est écrit sur la sortie
// standard, et rien du tout quand un autre outil la lance (isOtherToolHook) : la garde passe avant l'accord et la
// configuration.
async function runCaptureSession(args: string[]): Promise<number> {
  try {
    const stdin = await readHookStdin(process.stdin);
    if (isOtherToolHook(stdin, process.env, homedir())) return 0;
    if (await withdrawn()) {
      console.error(CONSENT_WITHDRAWN_MESSAGE);
      return 0;
    }
    let env: ServerEnv;
    try {
      env = await resolveServerEnv(process.env, homedir());
    } catch (error) {
      // Les messages de resolveServerEnv sont fixes : ils ne recopient jamais la valeur reçue.
      console.error(`Leon: ${error instanceof Error ? error.message : 'invalid configuration.'}`);
      return 0;
    }
    // Une option inconnue ou invalide ne doit pas empêcher la capture : on l'ignore (strict: false).
    const { values } = parseArgs({
      args,
      options: { 'delai-ms': { type: 'string' } },
      strict: false,
    });
    const delay = typeof values['delai-ms'] === 'string' ? values['delai-ms'] : undefined;
    const deadlineMs = parseDeadlineMs(delay);
    const projectDir = process.env.CLAUDE_PROJECT_DIR;
    // Les faits ne partent que si l'accord local le permet (consent.ts). Un seul délai, lancé une fois l'entrée lue,
    // borne les tours et les faits ensemble (HOOK_DEADLINE_MS).
    const accord = await factsConsent(homedir(), 'claude_code');
    const signal = AbortSignal.timeout(deadlineMs);
    return await captureSessionFromHook(stdin, {
      send: createIngestSender(fetch, env, { signal }),
      // Relu avant les faits (sendSessionFacts) : un retrait écrit pendant l'envoi des tours les arrête.
      withdrawn,
      ...(accord === null
        ? {}
        : {
            facts: {
              accord: accord.version,
              accordLe: accord.installe_le,
              usages: accord.usages,
              send: createFactsSender(fetch, env, { signal }),
            },
          }),
      out: () => {},
      git: gitInDirectory,
      readFile: (path) => readFile(path, 'utf8'),
      env: process.env,
      home: homedir(),
      mcpUrl: mcpUrlOf(env),
      ...(projectDir ? { projectDir } : {}),
    });
  } catch {
    console.error('Leon: capture failed (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// Un délai par requête, pour le rattrapage, qu'aucun crochet ne borne.
const REQUEST_TIMEOUT_MS = 30_000;
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

// Les crochets d'un tour et de la fin d'un outil hors Claude Code (T19) : rien sur la sortie standard, le code de sortie
// vaut toujours 0. L'entrée vient du fichier que le lanceur a copié (`--entree`, lu puis effacé avant tout le reste), sinon
// de l'entrée standard. Rien ne part sans l'accord de capture de l'outil (`capture_le`, consent.ts).
async function runToolCapture(
  outil: Outil,
  evenement: 'tour' | 'fin',
  args: string[],
): Promise<number> {
  try {
    return await toolCapture(outil, evenement, args);
  } finally {
    // Ce que l'outil attend sur la sortie standard (Cursor, Antigravity : `{}`), quoi qu'il soit arrivé.
    const empty = ADAPTATEURS[outil].vide(evenement);
    if (empty !== null) console.log(empty);
  }
}

async function toolCapture(outil: Outil, evenement: 'tour' | 'fin', args: string[]) {
  try {
    const { values } = parseArgs({ args, options: { entree: { type: 'string' } }, strict: false });
    const input =
      typeof values.entree === 'string'
        ? await readEntryFile(homedir(), values.entree)
        : await readHookStdin(process.stdin);
    const consent = await factsConsent(homedir(), outil);
    if (!consent?.capture_le) {
      console.error(
        `Leon: no consent recorded for the capture of ${ADAPTATEURS[outil].label}: nothing is sent.`,
      );
      return 0;
    }
    let env: ServerEnv;
    try {
      env = await resolveServerEnv(process.env, homedir());
    } catch (error) {
      console.error(`Leon: ${error instanceof Error ? error.message : 'invalid configuration.'}`);
      return 0;
    }
    const signal = AbortSignal.timeout(HOOK_DEADLINE_MS);
    return await captureToolHook(outil, evenement, input, {
      send: createIngestSender(fetch, env, { signal }),
      withdrawn: () => consentWithdrawn(homedir(), outil),
      facts: {
        accord: consent.version,
        accordLe: consent.installe_le,
        usages: consent.usages,
        send: createFactsSender(fetch, env, { signal }),
      },
      out: () => {},
      git: gitInDirectory,
      readFile: (path) => readFile(path, 'utf8'),
      stat: (path) => stat(path),
      home: homedir(),
      env: process.env,
      mcpUrl: mcpUrlOf(env),
    });
  } catch {
    console.error('Leon: capture failed (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// `leon rattraper` (T19), lancé détaché au démarrage d'une session : sans outil dont la capture est acceptée ni retrait
// que le serveur n'a pas appris (T43), rien. catchUp dit les retraits d'abord, sous son verrou.
async function runCatchUp(): Promise<number> {
  if (!(await catchUpNeeded(homedir()))) return 0;
  const env = await resolveServerEnv(process.env, homedir());
  const summary = await catchUp({
    send: createIngestSender(timedFetch, env),
    sendFacts: createFactsSender(timedFetch, env),
    // Les deux connexions, comme la commande de retrait : un LEON_TOKEN refusé ne bloque pas connexion.json.
    withdraw: connectionWithdrawal(timedFetch, process.env, homedir()),
    out: () => {},
    git: gitInDirectory,
    readFile: (path) => readFile(path, 'utf8'),
    stat: (path) => stat(path),
    home: homedir(),
    env: process.env,
    mcpUrl: mcpUrlOf(env),
    now: () => new Date(),
  });
  console.error(
    `Leon: ${countOf(summary.sessions, 'session')} caught up, ${countOf(summary.failures, 'failure')}.`,
  );
  return summary.failures > 0 ? 1 : 0;
}

// Pose une question sur le terminal et rend la ligne tapée, ou null si l'entrée se ferme sans réponse (Ctrl+D, ou
// commande lancée sans terminal) : ce n'est pas une réponse, on n'écrit alors rien (D30). L'itérateur est créé tout de
// suite : une réponse déjà arrivée sur l'entrée standard (`echo oui | pnpm leon …`) pendant que les réglages se lisent
// est gardée, pas perdue.
function createAsker(): { ask: (question: string) => Promise<string | null>; close: () => void } {
  const lines = createInterface({ input: process.stdin });
  const answers = lines[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      process.stdout.write(question);
      const next = await answers.next();
      return next.done ? null : next.value;
    },
    close: () => lines.close(),
  };
}

// Les crochets s'écrivent dans les réglages de Claude Code : CLAUDE_CONFIG_DIR si elle est posée, sinon ~/.claude.
async function runInstallHooks(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { oui: { type: 'boolean' }, depot: { type: 'string' }, outil: { type: 'string' } },
  });
  const tools: readonly string[] = ['claude_code', ...OUTILS];
  if (values.outil !== undefined && !tools.includes(values.outil)) {
    throw new Error(`--outil: unknown tool (one of: ${tools.join(', ')}).`);
  }
  const repoDir = values.depot ? resolve(values.depot) : CLI_REPO_DIR;
  if (!(await isLeonRepo(repoDir))) {
    throw new Error(
      values.depot
        ? '--depot: this folder is not a Leon repository.'
        : 'This Leon does not run from a clone: pass --depot <path> to name your Leon repository.',
    );
  }
  // La commande tourne dans le dépôt de Leon (`pnpm --dir`), pas dans le dossier où l'utilisateur a posé la variable.
  const configDir = claudeConfigDir(process.env);
  if (!isAbsolute(configDir)) throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
  const asker = createAsker();
  try {
    // Les crochets appellent le lanceur (K9) : sous la forme clone, il lance pnpm dans ce dépôt (setup.ts).
    const io = {
      home: homedir(),
      out: console.log,
      err: console.error,
      ask: asker.ask,
      refuseNotes: notesRefusal(fetch, homedir()), // un « non » à `noter` coupe aussi `remember` (T65)
    };
    const assumeYes = values.oui ?? false;
    // Seul un terminal fait demander un usage (D30) : une réponse lue d'un tube peut venir d'un agent.
    const usages = { home: io.home, assumeYes, interactive: process.stdin.isTTY === true };
    if (!(await ensureLauncher({ kind: 'clone', repoDir }, { ...io, yes: assumeYes }))) return 1;
    // Un retrait que le serveur n'a pas appris se dit avant le nouvel accord, qui effacerait son attente (T43).
    await tellBeforeConsent(io.home, uninstallDeps());
    if (values.outil === 'cursor') return await installCursorHooks(usages, io);
    if (values.outil === 'antigravity') return await installAntigravityHooks(usages, io);
    if (values.outil === 'codex') {
      return await installCodexHook({ codexDir: codexHome(io.home, process.env), ...usages }, io);
    }
    return await installHooks({ repoDir, configDir, ...usages }, io);
  } finally {
    asker.close();
  }
}

// Le retrait prévient le serveur de la connexion du moment (T43). Sans connexion, l'appel échoue comme un serveur
// injoignable : la commande le dit en une ligne, sans changer son code de sortie.
const uninstallDeps = (): UninstallDeps => ({
  out: console.log,
  err: console.error,
  withdraw: connectionWithdrawal(fetch, process.env, homedir()),
});

// Comme l'installateur, le retrait vise les réglages de CLAUDE_CONFIG_DIR si elle est posée, sinon ~/.claude.
// `--outil` n'accepte que les outils que Leon capte (claude_code au lot 1) : un autre, ou une option inconnue,
// arrête la commande sans rien retirer. Le message ne recopie pas la valeur reçue.
async function runUninstallHooks(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { outil: { type: 'string' } } });
  const tools: readonly string[] = [...new Set([...CODE_SESSION_KINDS, ...OUTILS])];
  if (values.outil !== undefined && !tools.includes(values.outil)) {
    throw new Error(`--outil: unknown tool (one of: ${tools.join(', ')}).`);
  }
  if (values.outil === 'cursor') return uninstallCursorHooks({ home: homedir() }, uninstallDeps());
  if (values.outil === 'antigravity') {
    return uninstallAntigravityHooks({ home: homedir() }, uninstallDeps());
  }
  if (values.outil === 'codex') {
    return uninstallCodexHook(
      { codexDir: codexHome(homedir(), process.env), home: homedir() },
      uninstallDeps(),
    );
  }
  const configDir = claudeConfigDir(process.env);
  if (!isAbsolute(configDir)) throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
  return uninstallHooks({ configDir, home: homedir() }, uninstallDeps());
}

const loginDeps = (signal: AbortSignal): LoginDeps => ({
  home: homedir(),
  env: process.env,
  fetch,
  open: openInBrowser,
  hostname: hostname(),
  out: console.log,
  err: console.error,
  readToken: () => readTokenFromInput(process.stdin, process.stdout),
  signal,
});

// `leon login` : Ctrl+C annule l'attente du navigateur sans rien écrire. Sans terminal, --with-token lit une ligne.
async function runLoginCommand(args: string[]): Promise<number> {
  const options = parseLoginArgs(args);
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  try {
    return await runLogin(options, loginDeps(abort.signal));
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// `leon setup` : la même connexion par le navigateur, mais l'entrée standard reste ouverte pour les questions qui
// suivent (l'accord de chaque outil) : elle n'est fermée que par la commande, à la fin. Elle demande les cases de la
// page (T64) ; la relance d'un ordinateur déjà connecté attend moins longtemps.
async function loginForSetup({ url, usages, relance, attendu }: SetupLogin): Promise<LoginResult> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  try {
    return await loginComputer(
      { url, withToken: false, usages, attendu },
      { ...loginDeps(abort.signal), ...(relance ? { timeoutMs: RELAUNCH_WAIT_MS } : {}) },
    );
  } finally {
    process.off('SIGINT', cancel);
  }
}

async function runSetupCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { url: { type: 'string' }, depot: { type: 'string' }, yes: { type: 'boolean' } },
  });
  const asker = createAsker();
  try {
    return await runSetup(
      { url: values.url, depot: values.depot, yes: values.yes ?? false },
      {
        home: homedir(),
        env: process.env,
        out: console.log,
        err: console.error,
        ask: asker.ask,
        interactive: process.stdin.isTTY === true,
        login: loginForSetup,
        fetch,
      },
    );
  } finally {
    asker.close();
  }
}

// `leon update` : `--background` (lancé par `leon briefing`) n'écrit rien sur le terminal.
async function runUpdateCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { background: { type: 'boolean' }, previous: { type: 'boolean' } },
  });
  const quiet = values.background ?? false;
  const code = await runUpdate(
    { previous: values.previous ?? false, background: quiet },
    {
      home: homedir(),
      cliVersion: CLI_VERSION,
      fetch,
      platform: nodePlatform(process.platform, process.arch),
      nodeDist: NODE_DIST,
      now: () => new Date(),
      out: quiet ? () => {} : console.log,
      err: quiet ? () => {} : console.error,
    },
  );
  return quiet ? 0 : code; // personne n'attend le code d'une mise à jour de fond
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === '--version') {
    console.log(CLI_VERSION);
    return 0;
  }
  try {
    if (command === 'import-claude-code') return await runImport(args);
    if (command === 'briefing') return await runBriefingCommand();
    if (command === 'reminder') return await runReminderCommand();
    if (command === 'capter-session') return await runCaptureSession(args);
    // Les crochets des autres outils (C6) : le démarrage et le premier message (le bloc), le tour et la fin (la capture).
    // Un outil ou un évènement inconnu ne fait rien et sort avec 0, pour qu'un crochet d'une version plus récente ne
    // gêne jamais l'outil.
    if (command === 'crochet') {
      const [outil, evenement, ...rest] = args;
      if (!(OUTILS as readonly string[]).includes(outil ?? '')) return 0;
      const tool = outil as Outil;
      if (evenement === 'demarrage' || evenement === 'prompt') {
        return await runBriefingCommand(tool, evenement);
      }
      if (evenement === 'tour' || evenement === 'fin')
        return await runToolCapture(tool, evenement, rest);
      return 0;
    }
    if (command === 'rattraper') return await runCatchUp();
    if (
      command === 'threads' ||
      command === 'thread' ||
      command === 'search' ||
      command === 'versions' ||
      command === 'lessons'
    ) {
      return await runReadCommand(command, args, {
        env: process.env,
        home: homedir(),
        cwd: process.cwd(),
        git: gitInDirectory,
        fetch,
        out: console.log,
        err: console.error,
      });
    }
    if (command === 'note') {
      return await runNoteCommand(args, {
        env: process.env,
        home: homedir(),
        cwd: process.cwd(),
        git: gitInDirectory,
        fetch,
        out: console.log,
        err: console.error,
      });
    }
    if (command === 'setup') return await runSetupCommand(args);
    if (command === 'update') return await runUpdateCommand(args);
    if (command === 'login') return await runLoginCommand(args);
    if (command === 'logout') {
      return await runLogout({
        home: homedir(),
        env: process.env,
        fetch,
        out: console.log,
        err: console.error,
      });
    }
    if (command === 'installer-crochets') return await runInstallHooks(args);
    if (command === 'retirer-crochets') return await runUninstallHooks(args);
  } catch (error) {
    // Jeton refusé, configuration, option inconnue : ces messages ne citent aucune conversation.
    console.error(error instanceof Error ? error.message : 'Unknown error.');
    return 1;
  }
  const asked = command === undefined || command === 'help' || command === '--help';
  (asked ? console.log : console.error)(HELP);
  return asked ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
