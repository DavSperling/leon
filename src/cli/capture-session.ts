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
// route, seulement si l'accord local le permet (`deps.facts`, posé par leon.ts d'après consent.ts, avec ses usages) :
// c'est une vraie fin de session. Un serveur qui ne les prend pas ne fait perdre que les faits, jamais les tours.
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { parseClaudeCodeSession } from '../capture/claude-code';
import type { Turn } from '../capture/turn';
import type { Outil } from './hook-commands';
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
import { ADAPTATEURS, sessionFileFrom } from './outils';
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
  // Le serveur valide strictement la source et les tours : un serveur sans la tâche T12 refuse `source.project` par un
  // 400, un serveur d'avant la marque des tours injectés (T43), `injecte`. Le fichier reste sur le poste : le curseur
  // d'un autre outil n'avance pas, Claude Code se rattrape par `leon import-claude-code`. Ordre de déploiement : le
  // serveur d'abord, la CLI ensuite.
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

// --- Les outils hors Claude Code (T19 du plan mémoire des sessions) ------------------------------------------------
//
// Codex n'a pas de fin de session fiable (annexe 03 : SessionEnd ne tourne pas à `/quit` dans le terminal, Stop ne
// tourne pas en `codex exec`) : la session se capte à chaque Stop (`leon crochet codex tour`), à SessionEnd quand il
// tourne (`leon crochet codex fin`), et au rattrapage (catch-up.ts). Chaque fois, seuls les tours nouveaux partent,
// d'après un curseur local par fichier de session ; les faits, eux, se calculent toujours sur tout le fichier.
//
// Le curseur est un marqueur technique (D31) : `~/.leon/curseurs/<outil>/<empreinte du chemin>.json`, en 0600, sans
// aucun texte de la session : le nombre de tours déjà envoyés, l'identifiant du dernier, et la date et la taille du
// fichier lu. Perdu ou illisible, tout repart : le serveur ignore les tours qu'il connaît.

// `dossier` : le dossier de travail que le crochet a donné (Cursor ne l'écrit pas dans son transcript), repris par le
// rattrapage.
export type Curseur = {
  tours: number;
  dernier: string | null;
  mtime: number;
  taille: number;
  dossier?: string | null;
};

const CurseurSchema = z.object({
  tours: z.number().int().nonnegative(),
  dernier: z.string().nullable(),
  mtime: z.number(),
  taille: z.number(),
  dossier: z.string().nullable().optional(),
});

export const cursorPath = (home: string, outil: Outil, file: string): string =>
  join(
    home,
    '.leon',
    'curseurs',
    outil,
    `${createHash('sha256').update(resolve(file)).digest('hex').slice(0, 32)}.json`,
  );

export async function readCursor(
  home: string,
  outil: Outil,
  file: string,
): Promise<Curseur | null> {
  try {
    const parsed = CurseurSchema.safeParse(
      JSON.parse(await readFile(cursorPath(home, outil, file), 'utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Écrit dans un fichier voisin en 0600 puis le renomme, comme l'accord (consent.ts).
export async function writeCursor(
  home: string,
  outil: Outil,
  file: string,
  cursor: Curseur,
): Promise<void> {
  const path = cursorPath(home, outil, file);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, `${JSON.stringify(cursor)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(temp, 0o600);
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// Les tours d'après le curseur. Un fichier qui ne commence plus par les tours déjà envoyés (réécrit, ou un autre
// fichier au même chemin) repart de zéro.
export function turnsAfter(turns: Turn[], cursor: Curseur | null): Turn[] {
  if (cursor === null || cursor.tours === 0 || cursor.tours > turns.length) return turns;
  return turns[cursor.tours - 1]?.external_id === cursor.dernier
    ? turns.slice(cursor.tours)
    : turns;
}

export type ToolCaptureDeps = ImportDeps & {
  git: GitRunner;
  readFile: (path: string) => Promise<string>;
  stat: (path: string) => Promise<{ mtimeMs: number; size: number }>;
  home: string;
};

export type ToolCapture = 'capte' | 'rien';

// La branche courante du dossier, lue par git à la capture : pour un fichier de session qui n'en porte pas.
async function branchAtCapture(directory: string, git: GitRunner): Promise<string | null> {
  const branch = await git(['branch', '--show-current'], directory).catch(() => null);
  return branch ? branch : null;
}

// Capte un fichier de session d'un outil hors Claude Code : ses tours nouveaux, puis, si l'accord le permet
// (`deps.facts`), ses faits sur tout le fichier. `fin` : une vraie fin de session, ou un fichier resté immobile.
// `dossier` : le dossier de travail que donne le crochet, pris quand le fichier n'en dit rien (Cursor) ; sinon celui du
// curseur, puis celui que l'adaptateur retrouve. Le curseur n'avance qu'une fois les tours reçus. Les erreurs d'envoi
// remontent (TokenRefusedError, IngestResponseError).
export async function captureToolFile(
  outil: Outil,
  file: string,
  options: { fin: boolean; dossier?: string | null },
  deps: ToolCaptureDeps,
): Promise<ToolCapture> {
  const adapter = ADAPTATEURS[outil];
  const { mtimeMs, size } = await deps.stat(file);
  const content = await deps.readFile(file);
  const fichier = { path: file, mtime: new Date(mtimeMs) };
  const lue = adapter.lire(content, fichier);
  if (lue === null) return 'rien';
  // L'accord de ces outils promet que ce qu'ils écrivent eux-mêmes en `user` ne part pas (CONSENT_LINES) : les tours
  // marqués `injecte` restent sur le poste, curseur compris, comme avant la marque.
  // shortcut: à envoyer marqués (T43) une fois les trois textes d'accord changés et tranché, par Amos, ce que couvrent
  // les accords déjà donnés.
  const session = { ...lue, turns: lue.turns.filter((turn) => turn.injecte !== true) };
  const cursor = await readCursor(deps.home, outil, file);
  const turns = turnsAfter(session.turns, cursor);
  const candidates = [session.cwd, options.dossier ?? null, cursor?.dossier ?? null];
  let start = candidates.find((dir): dir is string => dir !== null && isAbsolute(dir)) ?? null;
  if (start === null && adapter.dossierDe) start = await adapter.dossierDe(file);
  const projectKey = start === null ? undefined : await projectKeyFor(start, deps.git);
  const summary: ImportSummary = {
    sessions: 1,
    turnsSent: 0,
    inserted: 0,
    skipped: 0,
    failures: 0,
  };
  const sending = { dryRun: false, projectKey, kind: adapter.kind };
  if (turns.length > 0) {
    await importSession({ ...session, turns }, { ...sending, newestFirst: true }, deps, summary);
  }
  await writeCursor(deps.home, outil, file, {
    tours: session.turns.length,
    dernier: session.turns.at(-1)?.external_id ?? null,
    mtime: mtimeMs,
    taille: size,
    dossier: start,
  });
  if (!deps.facts) return 'capte';
  // Les fichiers relevés sont relatifs à la racine du dépôt du dossier de départ (aucun hors de tout dépôt).
  const root = start === null ? null : await repoRootFor(start, deps.git);
  const branch =
    session.branche === null && start !== null ? await branchAtCapture(start, deps.git) : null;
  const faits = adapter.faits(content, fichier, root, branch);
  const source = { content, root, fin: options.fin, faits };
  if (!(await sendSessionFacts(session, source, sending, deps))) warn(FACTS_REFUSED_MESSAGE);
  return 'capte';
}

// Le crochet d'un tour ou de la fin d'un outil hors Claude Code (`leon crochet <outil> tour|fin`). Le code de sortie vaut
// toujours 0, pour ne jamais gêner l'outil. Les messages sont fixes. Ce que l'outil attend sur la sortie standard
// (Cursor, Antigravity : `{}`) est écrit par leon.ts, quoi qu'il arrive ici.
export async function captureToolHook(
  outil: Outil,
  evenement: 'tour' | 'fin',
  input: string,
  deps: ToolCaptureDeps & { env: Record<string, string | undefined> },
): Promise<0> {
  try {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(input);
    } catch {
      // illisible : aucun fichier possible
    }
    const entree = ADAPTATEURS[outil].entree(parsed, deps.home, deps.env);
    // L'outil travaille encore (Antigravity, `fullyIdle` faux) : le tour suivant captera.
    if (!entree.inactif) return 0;
    const file = await sessionFileFrom(entree);
    if (file === null) {
      warn('could not read the hook input, session not captured.');
      return 0;
    }
    await captureToolFile(outil, file, { fin: evenement === 'fin', dossier: entree.dossier }, deps);
  } catch (error) {
    warn(failureMessage(error));
  }
  return 0;
}
