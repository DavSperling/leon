import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { fetchBriefingText } from './briefing';
import { claudeConfigDir, parseServerEnv } from './env';
import {
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importClaudeCode,
} from './import-claude-code';

const HELP = `Usage : pnpm leon <commande>

Commandes :
  import-claude-code   Importe les sessions Claude Code (~/.claude/projects, ou CLAUDE_CONFIG_DIR)
      --project <chemin>   ne garde que les sessions lancées sous ce dossier
      --since AAAA-MM-JJ   ne garde que les tours à partir de cette date
      --dry-run            affiche ce qui serait envoyé (une ligne JSON par envoi), sans rien envoyer

L'envoi réel demande LEON_URL et LEON_TOKEN.`;
// `briefing` n'est pas dans l'aide tant que le point du matin n'existe pas côté serveur (T13) : la commande
// reste, pour le hook SessionStart déjà posé, et ne gêne jamais Claude Code (voir `runBriefing`).

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
  if (values.since && !z.iso.date().safeParse(values.since).success) {
    throw new Error('--since attend une date au format AAAA-MM-JJ.');
  }
  const since = values.since ? new Date(`${values.since}T00:00:00Z`) : undefined;
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

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'import-claude-code') return await runImport(args);
    if (command === 'briefing') return await runBriefing();
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
