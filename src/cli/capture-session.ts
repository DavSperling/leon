// Crochet de fin de session de Claude Code : envoie à Leon la session qui se termine, avec son projet.
//
// Doc officielle des crochets : https://code.claude.com/docs/en/hooks (lue le 2026-10-20).
// - L'évènement s'appelle `SessionEnd`. Claude Code écrit sur l'entrée standard du crochet un JSON :
//   `session_id`, `transcript_path` (le fichier .jsonl de la session), `cwd`, `hook_event_name` (« SessionEnd »)
//   et `reason` (`clear`, `resume`, `logout`, `prompt_input_exit` ou `other`). Seuls `transcript_path` et `cwd`
//   servent ici : l'identifiant de la source est celui écrit dans le fichier, comme à l'import.
// - Ce crochet ne peut ni bloquer la fin de session ni répondre à Claude Code (pas de contrôle de décision).
// - Délai : 1,5 s par défaut pour SessionEnd ; un `timeout` plus long dans les réglages (jusqu'à 60 s) relève
//   ce budget. L'installeur de crochets (T14) en pose un de 30 s.
// - `transcript_path` s'écrit en tâche de fond et peut être en retard sur la conversation : les derniers tours
//   manquants arrivent à la capture suivante (les tours déjà connus sont ignorés par le serveur).
//
// Les textes passent par la même préparation que l'import (masquage des secrets, retrait des rappels système,
// coupe des tours trop longs : `parseClaudeCodeSession`), puis le serveur la refait à la réception.
import { z } from 'zod';
import { parseClaudeCodeSession } from '../capture/claude-code';
import type { ServerEnv } from './env';
import {
  createIngestSender,
  type ImportDeps,
  type ImportSummary,
  importSession,
  TokenRefusedError,
} from './import-claude-code';
import { type GitRunner, projectKeyFor } from './project-key';

// Le crochet dure 30 s au plus (T14), démarrage de la commande compris : le réseau a bien moins que cela,
// et une fois ce délai écoulé la requête est interrompue, pour que la commande se termine.
export const HOOK_DEADLINE_MS = 15_000;
const STDIN_MAX_CHARS = 64 * 1024;
const STDIN_TIMEOUT_MS = 5000;

const HookInputSchema = z.object({ transcript_path: z.string().min(1), cwd: z.string().min(1) });

export type CaptureDeps = ImportDeps & {
  git: GitRunner;
  readFile: (path: string) => Promise<string>;
};

// Les messages sont fixes : jamais le texte d'une session, d'une adresse de remote ni d'une erreur
// (celle d'un serveur ou du réseau peut citer une adresse ou un jeton).
function warn(message: string): void {
  console.error(`Leon : ${message}`);
}

function failureMessage(error: unknown): string {
  if (error instanceof TokenRefusedError) return 'jeton refusé par le serveur, session non captée.';
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'serveur trop lent (délai dépassé), session non captée.';
  }
  return 'serveur injoignable ou réponse inattendue, session non captée.';
}

function parseHookInput(stdin: string): z.infer<typeof HookInputSchema> | null {
  try {
    const parsed = HookInputSchema.safeParse(JSON.parse(stdin));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readSession(path: string, deps: CaptureDeps) {
  try {
    return parseClaudeCodeSession(await deps.readFile(path));
  } catch {
    return undefined;
  }
}

async function capture(stdin: string, deps: CaptureDeps): Promise<void> {
  const input = parseHookInput(stdin);
  if (!input) return warn('entrée du crochet illisible, session non captée.');

  const session = await readSession(input.transcript_path, deps);
  if (session === undefined) {
    return warn('fichier de session introuvable ou illisible, session non captée.');
  }
  if (session === null) return warn('aucun échange à envoyer pour cette session.');

  // Le dossier du crochet, comme pour `briefing` : le même projet des deux côtés.
  const projectKey = await projectKeyFor(input.cwd, deps.git);
  const summary: ImportSummary = {
    sessions: 1,
    turnsSent: 0,
    inserted: 0,
    skipped: 0,
    failures: 0,
  };
  try {
    await importSession(session, { dryRun: false, projectKey }, deps, summary);
  } catch (error) {
    return warn(failureMessage(error));
  }
  warn(
    `session captée (${summary.inserted} tour(s) nouveau(x), ${summary.skipped} déjà connu(s)).`,
  );
}

// Le code de sortie vaut toujours 0 : ce crochet ne doit jamais gêner la fin d'une session.
export async function captureSessionFromHook(stdin: string, deps: CaptureDeps): Promise<number> {
  try {
    await capture(stdin, deps);
  } catch {
    warn('capture impossible (erreur inattendue).');
  }
  return 0;
}

// L'envoi du crochet : même requête que l'import, mais interrompue après `deadlineMs`.
export function createHookSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  deadlineMs: number = HOOK_DEADLINE_MS,
): ImportDeps['send'] {
  return createIngestSender(fetchImpl, env, { signal: AbortSignal.timeout(deadlineMs) });
}

type HookInputStream = AsyncIterable<string | Uint8Array> & { isTTY?: boolean };

// L'entrée standard du crochet, ou une chaîne vide si elle est trop grosse, illisible, ne se ferme pas à temps
// ou si c'est un terminal (commande lancée à la main : on ne l'attend pas).
export async function readHookStdin(
  stream: HookInputStream,
  options: { maxChars?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (stream.isTTY) return '';
  const { maxChars = STDIN_MAX_CHARS, timeoutMs = STDIN_TIMEOUT_MS } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(''), timeoutMs);
  });
  const read = (async () => {
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of stream) {
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      if (text.length > maxChars) return '';
    }
    return text + decoder.decode();
  })().catch(() => '');
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
