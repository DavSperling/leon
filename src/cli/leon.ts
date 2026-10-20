import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runBriefing } from './briefing';
import {
  captureSessionFromHook,
  createHookSender,
  parseDeadlineMs,
  readHookStdin,
} from './capture-session';
import { claudeConfigDir, parseServerEnv, type ServerEnv } from './env';
import {
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importClaudeCode,
  parseSince,
} from './import-claude-code';
import { installHooks } from './install-hooks';
import { gitInDirectory } from './project-key';

// Le dépôt de Leon qui lance la commande (le dossier qui contient src/cli/leon.ts).
const CLI_REPO_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)));

const HELP = `Usage : pnpm leon <commande>

Commandes :
  import-claude-code   Importe les sessions Claude Code (~/.claude/projects, ou CLAUDE_CONFIG_DIR)
      --project <chemin>   ne garde que les sessions lancées sous ce dossier
      --since AAAA-MM-JJ   ne garde que les tours à partir de cette date
      --dry-run            affiche ce qui serait envoyé (une ligne JSON par envoi), sans rien envoyer
  briefing             Affiche le point du matin du projet du dossier courant (pour le crochet
                       SessionStart de Claude Code : le JSON du crochet est lu sur l'entrée standard)
  capter-session       Envoie la session qui se termine, avec son projet (pour le crochet SessionEnd
                       de Claude Code : le JSON du crochet est lu sur l'entrée standard)
      --delai-ms <n>       raccourcit le délai réseau de l'envoi, 15 000 ms au plus (pour les essais)
  installer-crochets   Écrit les crochets SessionStart (briefing) et SessionEnd (capter-session) dans les
                       réglages de Claude Code (~/.claude/settings.json, ou CLAUDE_CONFIG_DIR), après confirmation
      --oui                n'attend aucune confirmation
      --depot <chemin>     dépôt de Leon cité dans les commandes (par défaut : celui qui lance celle-ci)

L'envoi réel, le briefing et la capture de session demandent LEON_URL et LEON_TOKEN.`;

function summaryLine(summary: ImportSummary, dryRun: boolean): string {
  const sent = dryRun ? 'à envoyer' : 'envoyés';
  return `${summary.sessions} session(s), ${summary.turnsSent} tour(s) ${sent} : ${summary.inserted} nouveau(x), ${summary.skipped} déjà connu(s), ${summary.failures} échec(s).`;
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
    send: dryRun
      ? async () => {
          throw new Error('Aucun envoi en --dry-run.');
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
    console.error('Leon : briefing indisponible (erreur inattendue).');
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
    let env: ServerEnv;
    try {
      env = parseServerEnv(process.env);
    } catch (error) {
      // Les messages de parseServerEnv sont fixes : ils ne recopient jamais la valeur reçue.
      console.error(`Leon : ${error instanceof Error ? error.message : 'configuration invalide.'}`);
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
    });
  } catch {
    console.error('Leon : capture impossible (erreur inattendue).');
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
  if (!isLeonRepo) throw new Error("--depot : ce dossier n'est pas un dépôt de Leon.");
  // La commande tourne dans le dépôt de Leon (`pnpm --dir`), pas dans le dossier où l'utilisateur a posé la variable.
  const configDir = claudeConfigDir(process.env);
  if (!isAbsolute(configDir)) throw new Error('CLAUDE_CONFIG_DIR doit être un chemin absolu.');
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
    if (command === 'installer-crochets') return await runInstallHooks(args);
  } catch (error) {
    // Jeton refusé, configuration, option inconnue : ces messages ne citent aucune conversation.
    console.error(error instanceof Error ? error.message : 'Erreur inconnue.');
    return 1;
  }
  const asked = command === undefined || command === 'help' || command === '--help';
  (asked ? console.log : console.error)(HELP);
  return asked ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
