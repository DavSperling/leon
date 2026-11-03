import { access, readFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CODE_SESSION_KINDS } from '../capture/turn';
import { runBriefing } from './briefing';
import {
  captureSessionFromHook,
  isOtherToolHook,
  parseDeadlineMs,
  readHookStdin,
} from './capture-session';
import { CONSENT_WITHDRAWN_MESSAGE, consentWithdrawn, factsConsent } from './consent';
import { claudeConfigDir, resolveServerEnv, type ServerEnv } from './env';
import {
  countOf,
  createFactsSender,
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importClaudeCode,
  parseSince,
} from './import-claude-code';
import { installHooks } from './install-hooks';
import { openInBrowser, readTokenFromInput, runLogin, runLogout } from './login';
import { gitInDirectory } from './project-key';
import { uninstallHooks } from './uninstall-hooks';

// Le dépôt de Leon qui lance la commande (le dossier qui contient src/cli/leon.ts).
const CLI_REPO_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)));

// Après `leon retirer-crochets`, Claude Code est en version 0 dans l'accord : plus rien ne part, même d'un crochet
// resté dans les réglages d'un projet (C7). `briefing` le vérifie lui-même (briefing.ts).
const withdrawn = () => consentWithdrawn(homedir(), 'claude_code');

const HELP = `Usage: pnpm leon <command>

Commands:
  import-claude-code   Import Claude Code sessions (~/.claude/projects, or CLAUDE_CONFIG_DIR)
      --project <path>     keep only the sessions started under this folder
      --since YYYY-MM-DD   keep only the turns from this date on
      --dry-run            print what would be sent (one JSON line per request), send nothing
  briefing             Send the project key (plus the current Git branch and the session id, if ~/.leon/accord.json
                       allows it) and print the block that comes back: your recent sessions on this repository and
                       the project's morning briefing (for Claude Code's SessionStart hook: the hook JSON is read
                       from standard input)
  capter-session       Send the session that is ending: the text of the exchanges, with its project, and the actions
                       of the session if ~/.leon/accord.json allows it (for Claude Code's SessionEnd hook: the hook
                       JSON is read from standard input)
      --delai-ms <n>       shorten the network timeout of the upload, 15000 ms at most (for testing)
  login                Connect this computer to Leon: opens your browser to authorize it, then saves the connection
                       in ~/.leon/connexion.json (the commands below use it; LEON_URL and LEON_TOKEN, when both are
                       set, take precedence)
      --url <address>      the Leon server (default: LEON_URL, then the saved connection)
      --with-token         paste a token created in Settings instead (for a browser on another computer)
  logout               Revoke this computer's token and remove ~/.leon/connexion.json
  installer-crochets   Write the SessionStart (briefing) and SessionEnd (capter-session) hooks into Claude Code's
                       settings (~/.claude/settings.json, or CLAUDE_CONFIG_DIR) and record your consent in
                       ~/.leon/accord.json, after confirmation (only the consent when the hooks are already there)
      --oui                do not ask for confirmation
      --depot <path>       Leon repository named in the hook commands (default: the one running this command)
  retirer-crochets     Remove the Leon hooks from Claude Code's settings and withdraw your consent in
                       ~/.leon/accord.json: from then on, nothing is sent from Claude Code
      --outil <tool>       the tool to remove: claude_code (the only one for now, and the default)

Real uploads (import-claude-code without --dry-run), briefing and capter-session need a connection (leon login), or
LEON_URL and LEON_TOKEN.`;

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
  // fichiers modifiés après lui.
  const accord = await factsConsent(homedir(), 'claude_code');
  const deps: ImportDeps = {
    out: console.log,
    git: gitInDirectory,
    send: env ? createIngestSender(fetch, env) : nothingSent,
    ...(accord === null
      ? {}
      : {
          facts: {
            accord: accord.version,
            depuis: accord.installe_le,
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
async function runBriefingCommand(): Promise<number> {
  try {
    return await runBriefing({
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
    console.error('Leon: briefing unavailable (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

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
      ...(accord === null
        ? {}
        : { facts: { accord: accord.version, send: createFactsSender(fetch, env, { signal }) } }),
      out: () => {},
      git: gitInDirectory,
      readFile: (path) => readFile(path, 'utf8'),
      env: process.env,
      home: homedir(),
      ...(projectDir ? { projectDir } : {}),
    });
  } catch {
    console.error('Leon: capture failed (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// Pose une question sur le terminal et rend la ligne tapée, ou une chaîne vide si l'entrée se ferme sans réponse
// (commande lancée sans terminal : on n'écrit alors rien). L'itérateur est créé tout de suite : une réponse déjà
// arrivée sur l'entrée standard (`echo oui | pnpm leon …`) pendant que les réglages se lisent est gardée, pas perdue.
function createAsker(): { ask: (question: string) => Promise<string>; close: () => void } {
  const lines = createInterface({ input: process.stdin });
  const answers = lines[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      process.stdout.write(question);
      const next = await answers.next();
      return next.done ? '' : next.value;
    },
    close: () => lines.close(),
  };
}

// Les crochets s'écrivent dans les réglages de Claude Code : CLAUDE_CONFIG_DIR si elle est posée, sinon ~/.claude.
async function runInstallHooks(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { oui: { type: 'boolean' }, depot: { type: 'string' } },
  });
  const repoDir = values.depot ? resolve(values.depot) : CLI_REPO_DIR;
  const isLeonRepo = await access(join(repoDir, 'src', 'cli', 'leon.ts')).then(
    () => true,
    () => false,
  );
  if (!isLeonRepo) throw new Error('--depot: this folder is not a Leon repository.');
  // La commande tourne dans le dépôt de Leon (`pnpm --dir`), pas dans le dossier où l'utilisateur a posé la variable.
  const configDir = claudeConfigDir(process.env);
  if (!isAbsolute(configDir)) throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
  const asker = createAsker();
  try {
    return await installHooks(
      { repoDir, configDir, home: homedir(), assumeYes: values.oui ?? false },
      { out: console.log, err: console.error, ask: asker.ask },
    );
  } finally {
    asker.close();
  }
}

// Comme l'installateur, le retrait vise les réglages de CLAUDE_CONFIG_DIR si elle est posée, sinon ~/.claude.
// `--outil` n'accepte que les outils que Leon capte (claude_code au lot 1) : un autre, ou une option inconnue,
// arrête la commande sans rien retirer. Le message ne recopie pas la valeur reçue.
async function runUninstallHooks(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { outil: { type: 'string' } } });
  const tools: readonly string[] = CODE_SESSION_KINDS;
  if (values.outil !== undefined && !tools.includes(values.outil)) {
    throw new Error(`--outil: unknown tool (the only one for now: ${tools.join(', ')}).`);
  }
  const configDir = claudeConfigDir(process.env);
  if (!isAbsolute(configDir)) throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
  return uninstallHooks({ configDir, home: homedir() }, { out: console.log, err: console.error });
}

// `leon login` : Ctrl+C annule l'attente du navigateur sans rien écrire. Sans terminal, --with-token lit une ligne.
async function runLoginCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { url: { type: 'string' }, 'with-token': { type: 'boolean' } },
  });
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  try {
    return await runLogin(
      { url: values.url, withToken: values['with-token'] ?? false },
      {
        home: homedir(),
        env: process.env,
        fetch,
        open: openInBrowser,
        hostname: hostname(),
        out: console.log,
        err: console.error,
        readToken: () => readTokenFromInput(process.stdin, process.stdout),
        signal: abort.signal,
      },
    );
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'import-claude-code') return await runImport(args);
    if (command === 'briefing') return await runBriefingCommand();
    if (command === 'capter-session') return await runCaptureSession(args);
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
