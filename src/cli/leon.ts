import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchBriefingText } from './briefing';
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
import { gitInDirectory } from './project-key';

const HELP = `Usage : pnpm leon <commande>

Commandes :
  import-claude-code   Importe les sessions Claude Code (~/.claude/projects, ou CLAUDE_CONFIG_DIR)
      --project <chemin>   ne garde que les sessions lancées sous ce dossier
      --since AAAA-MM-JJ   ne garde que les tours à partir de cette date
      --dry-run            affiche ce qui serait envoyé (une ligne JSON par envoi), sans rien envoyer
  briefing             Affiche le briefing Leon (pour le hook SessionStart de Claude Code)
  capter-session       Envoie la session qui se termine, avec son projet (pour le crochet SessionEnd
                       de Claude Code : le JSON du crochet est lu sur l'entrée standard)
      --delai-ms <n>       raccourcit le délai réseau de l'envoi, 15 000 ms au plus (pour les essais)

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

// Le hook SessionStart ajoute stdout au contexte de la session : seul le briefing y passe,
// et le code de sortie vaut toujours 0 pour ne jamais gêner Claude Code.
async function runBriefing(): Promise<number> {
  try {
    const text = await fetchBriefingText(fetch, parseServerEnv(process.env));
    if (text === null)
      console.error('Leon : briefing indisponible (serveur injoignable ou jeton refusé).');
    else console.log(text);
  } catch (error) {
    console.error(`Leon : ${error instanceof Error ? error.message : 'briefing indisponible.'}`);
  }
  return 0;
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

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'import-claude-code') return await runImport(args);
    if (command === 'briefing') return await runBriefing();
    if (command === 'capter-session') return await runCaptureSession(args);
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
