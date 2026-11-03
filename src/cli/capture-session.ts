// Crochet de fin de session de Claude Code : envoie à Leon la session qui se termine, avec son projet.
//
// Doc officielle des crochets : https://code.claude.com/docs/en/hooks (lue le 2026-10-20).
// - L'évènement s'appelle `SessionEnd`. Claude Code écrit sur l'entrée standard du crochet un JSON :
//   les champs communs (`session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`,
//   `effort`, `hook_event_name`) et `reason` (`clear`, `resume`, `logout`, `prompt_input_exit` ou `other`).
//   Seuls `transcript_path` et `cwd` sont lus ici (et `cursor_version`, pour reconnaître Cursor : isOtherToolHook),
//   les autres champs sont ignorés : l'identifiant de la source est celui écrit dans le fichier de session, comme à
//   l'import.
// - Ce crochet ne peut ni bloquer la fin de session ni répondre à Claude Code (pas de contrôle de décision).
// - Délai : 1,5 s par défaut pour SessionEnd ; un `timeout` plus long dans les réglages (jusqu'à 60 s) relève
//   ce budget. L'installeur de crochets (T14) en pose un de 30 s.
// - Le `cwd` du JSON SUIT Claude : il devient la racine d'un worktree dès que Claude y entre, et le nouveau dossier
//   après un `cd`. Le projet est donc celui du dossier où la session a démarré (voir `startingDirectory`), le même
//   que voit `briefing` au démarrage ; sans cela, une session qui change de dossier serait rangée sous un autre
//   projet que celui de son point du matin.
// - `transcript_path` s'écrit en tâche de fond et peut être en retard sur la conversation : les derniers tours
//   manquants ne sont envoyés qu'à la prochaine capture de la même session (une session reprise, ou
//   `leon import-claude-code` relancé). Le serveur ignore les tours déjà connus.
// - SessionEnd se déclenche à la sortie de Claude Code, à `/clear` et au `/resume` interactif. Les sessions lancées
//   par `claude -p` (scripts, automatisations, agents) le déclenchent aussi : sans `--bare`, `claude -p` charge les
//   crochets de `~/.claude` comme une session interactive (https://code.claude.com/docs/en/headless), et sur SIGTERM
//   il exécute les crochets SessionEnd avant de sortir ; seul `--bare` ne charge aucun crochet. La doc ne dit rien
//   d'un terminal fermé de force ni d'un plantage : ces sessions peuvent ne pas être captées. `leon
//   import-claude-code` reste le rattrapage de celles-là.
//
// Les textes passent par la même préparation que l'import (masquage des secrets, retrait des rappels système,
// coupe des tours trop longs : `parseClaudeCodeSession`), puis le serveur la refait à la réception.
//
// Après les tours, les faits de la session (ses gestes, C1 du plan mémoire des sessions) partent par leur propre
// route, seulement si l'accord local le permet (`deps.facts`, posé par leon.ts d'après consent.ts) : c'est une
// vraie fin de session. Un serveur qui ne les prend pas ne fait perdre que les faits, jamais les tours.
import { isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { parseClaudeCodeSession } from '../capture/claude-code';
import {
  countOf,
  FACTS_REFUSED_MESSAGE,
  type ImportDeps,
  type ImportSummary,
  IngestResponseError,
  importSession,
  sendSessionFacts,
  TokenRefusedError,
} from './import-claude-code';
import { type GitRunner, projectKeyFor, repoRootFor } from './project-key';

// Le crochet dure 30 s au plus (T14), démarrage de la commande compris : le réseau a bien moins que cela,
// et une fois ce délai écoulé la requête est interrompue, pour que la commande se termine. Il court une seule
// fois pour les tours et les faits, une fois l'entrée lue (5 s au plus, STDIN_TIMEOUT_MS), lecture du fichier et
// de git comprises (leon.ts) : c'est lui qui borne la durée de la commande, d'où l'envoi des lots les plus récents
// d'abord.
export const HOOK_DEADLINE_MS = 15_000;
const STDIN_MAX_CHARS = 64 * 1024;
const STDIN_TIMEOUT_MS = 5000;

// Un dossier relatif serait résolu contre celui du processus, qui est le dépôt de Leon (`pnpm --dir <dépôt> leon …`)
// et non le projet : Claude Code envoie un chemin absolu, tout le reste est une entrée illisible.
const HookInputSchema = z.object({
  transcript_path: z.string().min(1),
  cwd: z.string().min(1).refine(isAbsolute),
});

export type CaptureDeps = ImportDeps & {
  git: GitRunner;
  readFile: (path: string) => Promise<string>;
  // $CLAUDE_PROJECT_DIR, « the project root where the session started » (doc des crochets) : repli quand le
  // fichier de session n'écrit aucun dossier.
  projectDir?: string;
  // Pour reconnaître un autre outil (isOtherToolHook) : jamais ceux du processus par défaut, qu'un test lancé dans
  // le terminal de Cursor (CURSOR_VERSION) lirait sans le savoir.
  env: Record<string, string | undefined>;
  home: string;
};

// Les crochets de Claude Code que Leon pose servent parfois à un autre outil (T06 du plan mémoire des sessions) :
// - Cursor reprend les crochets de Claude Code : son entrée porte `cursor_version`, ou son environnement
//   CURSOR_VERSION ;
// - la migration de Codex recopie les crochets de Leon : son fichier de session est sous
//   `${CODEX_HOME:-~/.codex}/sessions/`.
// Les commandes au format Claude Code (`briefing`, `capter-session`, puis `contexte-prompt` au lot 10) sortent alors
// avec le code 0 sans rien écrire : l'outil reçoit le bloc par son propre crochet, et son fichier de session n'est
// pas celui de Claude Code. Jamais `leon crochet <outil> …`, qui est fait pour eux.
export function isOtherToolHook(
  stdin: string,
  env: Record<string, string | undefined>,
  home: string,
): boolean {
  let input: unknown = null;
  try {
    input = JSON.parse(stdin);
  } catch {
    // Entrée vide (lancée à la main) ou illisible : l'environnement seul décide.
  }
  const fields = typeof input === 'object' && input !== null ? input : {};
  if (env.CURSOR_VERSION || Object.hasOwn(fields, 'cursor_version')) return true;
  const path = 'transcript_path' in fields ? fields.transcript_path : null;
  if (typeof path !== 'string' || !isAbsolute(path)) return false;
  const sessions = resolve(env.CODEX_HOME || join(home, '.codex'), 'sessions');
  return resolve(path).startsWith(sessions + sep);
}

// Le délai demandé à la commande (`--delai-ms`, réservé aux essais) : il ne fait que raccourcir celui du crochet.
// Une valeur absente, illisible ou nulle laisse le délai du crochet.
export function parseDeadlineMs(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]{0,8}$/.test(value)) return HOOK_DEADLINE_MS;
  return Math.min(Number(value), HOOK_DEADLINE_MS);
}

// Le dossier où la session a démarré : le premier dossier écrit dans le fichier de session, à défaut
// $CLAUDE_PROJECT_DIR, à défaut le dossier du crochet. Seuls les chemins absolus comptent. Le projet se calcule
// sur lui, jamais sur le `cwd` du crochet qui suit Claude dans un worktree ou après un `cd`.
function startingDirectory(
  sessionCwd: string | null,
  projectDir: string | undefined,
  hookCwd: string,
): string {
  const candidates = [sessionCwd, projectDir];
  return (
    candidates.find((dir): dir is string => typeof dir === 'string' && isAbsolute(dir)) ?? hookCwd
  );
}

// Les messages sont fixes : jamais le texte d'une session, d'une adresse de remote ni d'une erreur
// (celle d'un serveur ou du réseau peut citer une adresse ou un jeton).
function warn(message: string): void {
  console.error(`Leon: ${message}`);
}

function failureMessage(error: unknown): string {
  if (error instanceof TokenRefusedError)
    return 'token refused by the server, session not captured.';
  // Le serveur valide strictement la source : un serveur sans la tâche T12 refuse `source.project` par un 400.
  // Ordre de déploiement : le serveur d'abord, la CLI ensuite.
  if (error instanceof IngestResponseError && error.status === 400) {
    return 'the server does not recognize this upload (it may be older than the CLI), session not captured.';
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'server too slow (timeout exceeded), session not captured.';
  }
  return 'server unreachable or unexpected response, session not captured.';
}

function parseHookInput(stdin: string): z.infer<typeof HookInputSchema> | null {
  try {
    const parsed = HookInputSchema.safeParse(JSON.parse(stdin));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Le contenu du fichier sert aussi aux faits.
async function readSession(path: string, deps: CaptureDeps) {
  try {
    const content = await deps.readFile(path);
    return { content, session: parseClaudeCodeSession(content) };
  } catch {
    return undefined;
  }
}

async function capture(stdin: string, deps: CaptureDeps): Promise<void> {
  const input = parseHookInput(stdin);
  if (!input) return warn('could not read the hook input, session not captured.');

  const read = await readSession(input.transcript_path, deps);
  if (read === undefined) {
    return warn('session file not found or unreadable, session not captured.');
  }
  const { content, session } = read;
  if (session === null) return warn('nothing to send for this session.');

  // Le dossier de départ de la session, comme `briefing` : le même projet des deux côtés.
  const start = startingDirectory(session.cwd, deps.projectDir, input.cwd);
  const projectKey = await projectKeyFor(start, deps.git);
  const summary: ImportSummary = {
    sessions: 1,
    turnsSent: 0,
    inserted: 0,
    skipped: 0,
    failures: 0,
  };
  try {
    await importSession(session, { dryRun: false, projectKey, newestFirst: true }, deps, summary);
  } catch (error) {
    return warn(failureMessage(error));
  }
  warn(
    `session captured (${countOf(summary.inserted, 'new turn')}, ${summary.skipped} already known).`,
  );
  if (!deps.facts) return; // sans accord, pas même git pour la racine du dépôt
  try {
    // Les fichiers relevés sont relatifs à la racine du dépôt du dossier de départ (aucun hors de tout dépôt).
    const source = { content, root: await repoRootFor(start, deps.git), fin: true };
    if (!(await sendSessionFacts(session, source, { dryRun: false, projectKey }, deps))) {
      warn(FACTS_REFUSED_MESSAGE);
    }
  } catch {
    warn('session facts not sent (server unreachable, too slow or unexpected response).');
  }
}

// Le code de sortie vaut toujours 0 : ce crochet ne doit jamais gêner la fin d'une session.
export async function captureSessionFromHook(stdin: string, deps: CaptureDeps): Promise<number> {
  try {
    if (isOtherToolHook(stdin, deps.env, deps.home)) return 0;
    await capture(stdin, deps);
  } catch {
    warn('capture failed (unexpected error).');
  }
  return 0;
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
