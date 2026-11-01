import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { condenseSession } from '../capture/handoff-transcript';
import { runBriefing } from './briefing';
import {
  captureSessionFromHook,
  createHookSender,
  parseDeadlineMs,
  readHookStdin,
} from './capture-session';
import { claudeConfigDir, parseServerEnv, type ServerEnv } from './env';
import {
  countOf,
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importClaudeCode,
  parseSince,
} from './import-claude-code';
import { installHooks } from './install-hooks';
import {
  createNoteSender,
  currentBranch,
  fetchLastNoteAt,
  isFallbackRun,
  runClaudeSummary,
  shouldSummarize,
  summarizeAndSend,
} from './passation';
import { gitInDirectory } from './project-key';

// Le dépôt de Leon qui lance la commande (le dossier qui contient src/cli/leon.ts).
const CLI_REPO_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)));

const HELP = `Usage: pnpm leon <command>

Commands:
  import-claude-code   Import Claude Code sessions (~/.claude/projects, or CLAUDE_CONFIG_DIR)
      --project <path>     keep only the sessions started under this folder
      --since YYYY-MM-DD   keep only the turns from this date on
      --dry-run            print what would be sent (one JSON line per request), send nothing
  briefing             Print the morning briefing for the project of the current folder (for Claude Code's
                       SessionStart hook: the hook JSON is read from standard input)
  capter-session       Send the session that is ending, with its project (for Claude Code's SessionEnd
                       hook: the hook JSON is read from standard input)
      --delai-ms <n>       shorten the network timeout of the upload, 15000 ms at most (for testing)
  resumer-passation    Summarize an ended session into a handoff note (started by capter-session)
      --transcript <path>  the session file
      --projet <key>       the project key
      --branche <name>     the git branch
  installer-crochets   Write the SessionStart (briefing) and SessionEnd (capter-session) hooks into Claude Code's
                       settings (~/.claude/settings.json, or CLAUDE_CONFIG_DIR), after confirmation
      --oui                do not ask for confirmation
      --depot <path>       Leon repository named in the hook commands (default: the one running this command)

Real uploads (import-claude-code without --dry-run), briefing and capter-session need LEON_URL and LEON_TOKEN.`;

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
  const deps: ImportDeps = {
    out: console.log,
    git: gitInDirectory,
    send: dryRun
      ? async () => {
          throw new Error('Nothing is sent with --dry-run.');
        }
      : createIngestSender(fetch, parseServerEnv(process.env)),
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

// Le crochet SessionStart ajoute stdout au contexte de la session : seul le point du matin y passe,
// et le code de sortie vaut toujours 0 pour ne jamais gêner Claude Code (voir briefing.ts).
async function runBriefingCommand(): Promise<number> {
  try {
    // Le `claude -p` du résumé de secours charge aussi les crochets : il ne reçoit pas de point.
    if (isFallbackRun(process.env)) return 0;
    return await runBriefing({
      stdin: process.stdin,
      env: process.env,
      cwd: process.cwd(),
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
// standard.
async function runCaptureSession(args: string[]): Promise<number> {
  try {
    // Le `claude -p` du résumé de secours charge aussi les crochets : il ne se capte pas lui-même.
    if (isFallbackRun(process.env)) return 0;
    let env: ServerEnv;
    try {
      env = parseServerEnv(process.env);
    } catch (error) {
      // Les messages de parseServerEnv sont fixes : ils ne recopient jamais la valeur reçue.
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
    const projectDir = process.env.CLAUDE_PROJECT_DIR;
    return await captureSessionFromHook(await readHookStdin(process.stdin), {
      send: createHookSender(fetch, env, parseDeadlineMs(delay)),
      out: () => {},
      git: gitInDirectory,
      readFile: (path) => readFile(path, 'utf8'),
      ...(projectDir ? { projectDir } : {}),
      onCaptured: (captured) => startPassationFallback(env, captured),
    });
  } catch {
    console.error('Leon: capture failed (unexpected error).');
    return 0;
  } finally {
    process.stdin.destroy(); // une entrée restée ouverte garderait la commande en vie
  }
}

// Le résumé de secours de passation, quand la session est assez longue et qu'aucune note ne la couvre déjà. Il part
// détaché, sans shell (aucun argument à citer) : le crochet rend la main tout de suite, le résumé tourne ensuite sur
// l'abonnement du développeur.
async function startPassationFallback(
  env: ServerEnv,
  captured: { transcriptPath: string; directory: string; projectKey: string },
): Promise<void> {
  const session = condenseSession(await readFile(captured.transcriptPath, 'utf8'));
  const branch = await currentBranch(captured.directory, gitInDirectory);
  const lastNoteAt = await fetchLastNoteAt(fetch, env, captured.projectKey, branch);
  if (lastNoteAt === undefined) return;
  if (!shouldSummarize({ exchanges: session.exchanges, startedAt: session.startedAt, lastNoteAt }))
    return;
  const args = [
    ...process.execArgv,
    fileURLToPath(import.meta.url),
    'resumer-passation',
    '--transcript',
    captured.transcriptPath,
    '--projet',
    captured.projectKey,
    ...(branch ? ['--branche', branch] : []),
  ];
  const child = spawn(process.execPath, args, {
    cwd: CLI_REPO_DIR,
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
}

// Le résumé de secours, lancé détaché par `capter-session` : condense la session, la résume avec `claude -p` et
// envoie la note à Leon. Silencieux : personne ne lit sa sortie.
async function runSummarizePassation(args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      args,
      options: {
        transcript: { type: 'string' },
        projet: { type: 'string' },
        branche: { type: 'string' },
      },
      strict: false,
    });
    if (typeof values.transcript !== 'string' || typeof values.projet !== 'string') return 0;
    const env = parseServerEnv(process.env);
    const branch = typeof values.branche === 'string' ? values.branche : null;
    const { text } = condenseSession(await readFile(values.transcript, 'utf8'));
    await summarizeAndSend({
      condensed: text,
      runClaude: runClaudeSummary,
      send: createNoteSender(fetch, env, values.projet, branch),
    });
  } catch {
    // Personne ne lit cette sortie : on s'arrête sans bruit.
  }
  return 0;
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
      { repoDir, configDir, assumeYes: values.oui ?? false },
      { out: console.log, err: console.error, ask: asker.ask },
    );
  } finally {
    asker.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'import-claude-code') return await runImport(args);
    if (command === 'briefing') return await runBriefingCommand();
    if (command === 'capter-session') return await runCaptureSession(args);
    if (command === 'resumer-passation') return await runSummarizePassation(args);
    if (command === 'installer-crochets') return await runInstallHooks(args);
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
