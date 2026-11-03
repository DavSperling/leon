// Crochet de démarrage de Claude Code : affiche le bloc de démarrage du projet de la session (C3 et C4 du plan
// mémoire des sessions) : mes dernières sessions sur ce dépôt, puis le point du matin, assemblés par le serveur
// (`/contexte`). Un serveur plus ancien que cette route répond 404 : la commande retombe sur le point du matin seul
// (`/briefing`), comme avant. Le bloc envoie la branche et la session, et donne mes sessions au modèle : il attend
// l'accord local en version 2 (C7, consent.ts). Sans lui (crochets installés avant ce chantier), le point seul.
//
// Doc officielle des crochets : https://code.claude.com/docs/en/hooks (lue le 2026-10-20).
// - L'évènement s'appelle `SessionStart` (`source` : startup, resume, clear, compact ou fork). Claude Code écrit sur
//   l'entrée standard du crochet un JSON qui porte les champs communs, dont `session_id` et `cwd` (« Current working
//   directory when the hook is invoked »). Seuls ces deux-là sont lus ici, plus `transcript_path` et
//   `cursor_version` pour reconnaître un autre outil (isOtherToolHook, capture-session.ts).
// - Pour SessionStart, Claude Code ajoute la sortie standard au contexte de la session : seul le bloc y passe ; les
//   messages vont sur la sortie d'erreur, que Claude ne voit pas quand le code de sortie vaut 0.
// - Le crochet lance `hookCommand(<dépôt de Leon>, 'briefing')` (hook-commands.ts : `pnpm -s
//   --config.verify-deps-before-run=false --dir <dépôt> leon briefing`) : le dossier du processus est alors le dépôt
//   de Leon, pas le projet. Le projet se calcule donc sur le `cwd` du JSON, sinon sur INIT_CWD (que pnpm pose au
//   dossier d'où il a été lancé, `--dir` ou non), sinon sur le dossier du processus (voir briefingDirectory).
// - La sortie standard d'un crochet est plafonnée à 10 000 caractères par Claude Code : le serveur rend un bloc de
//   8 000 octets au plus (CONTEXT_MAX_BYTES), et un point qui tient en dessous (BRIEFING_RENDER_MAX_CHARS).
//
// La commande ne bloque jamais une session : entrée standard lue avec un délai court (jamais un terminal), git borné
// (project-key.ts, la clé du projet et la branche lues en même temps), serveur 3 secondes au plus pour les deux
// requêtes ensemble (le bloc, puis le repli), et le code de sortie vaut toujours 0. Au pire, ces trois délais se
// suivent : 1 s + 3 s + 3 s, plus le démarrage (une demi-seconde), soit 7,5 s environ, sous le délai de 10 s que
// l'installateur des crochets (T14) doit poser. En pratique, Claude Code ferme l'entrée tout de suite et git répond
// en quelques millisecondes : la commande dure le temps de la requête.
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  BriefingResponseSchema,
  type ContextRequest,
  ContextRequestSchema,
  ContextResponseSchema,
} from '../capture/api-contract';
import { isOtherToolHook, readHookStdin } from './capture-session';
import { CONSENT_WITHDRAWN_MESSAGE, consentWithdrawn, factsConsent } from './consent';
import { resolveServerEnv, type ServerEnv } from './env';
import { type GitRunner, projectKeyFor } from './project-key';
import { startOutput } from './start-output';

const TIMEOUT_MS = 3000;
// Claude Code écrit son JSON puis ferme l'entrée : une seconde suffit largement. Au-delà (une entrée laissée
// ouverte par un autre programme), on fait sans.
export const BRIEFING_STDIN_TIMEOUT_MS = 1000;

// Un 404 n'est ni un jeton refusé ni un serveur injoignable : ce serveur n'a pas la route du point du matin.
export class BriefingRouteMissingError extends Error {
  constructor() {
    super('this server does not prepare a morning briefing yet (route missing).');
  }
}

// Le hook SessionStart ne doit jamais bloquer une session : toute défaillance donne null, sauf la route absente,
// que la commande doit pouvoir dire (elle sort quand même avec le code 0). `signal` : celui du bloc, quand ce point
// en est le repli.
export async function fetchBriefingText(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  project: string,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT_MS),
): Promise<string | null> {
  try {
    const url = new URL(API_PATHS.briefing, env.url);
    url.searchParams.set(BRIEFING_PROJECT_PARAM, project);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal,
    });
    if (response.status === 404) throw new BriefingRouteMissingError();
    if (!response.ok) return null;
    const parsed = BriefingResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.markdown : null;
  } catch (error) {
    if (error instanceof BriefingRouteMissingError) throw error;
    return null;
  }
}

// Le bloc de démarrage (C3), en POST pour que la branche n'aille pas dans les journaux d'URL. Un seul délai de 3 s
// couvre la demande et, sur un 404 (serveur plus ancien que la route), le repli sur le point du matin seul.
export async function fetchStartText(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  request: ContextRequest,
): Promise<string | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(API_PATHS.contexte, env.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (response.status === 404)
      return await fetchBriefingText(fetchImpl, env, request.projet, signal);
    if (!response.ok) return null;
    const parsed = ContextResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.texte : null;
  } catch (error) {
    if (error instanceof BriefingRouteMissingError) throw error;
    return null;
  }
}

const HookCwdSchema = z.object({ cwd: z.string().min(1).refine(isAbsolute) });
const HookSessionSchema = z.object({ session_id: ContextRequestSchema.shape.session });

// La session qui démarre, exclue du bloc : le `session_id` du JSON du crochet. Lancée à la main, aucune session ne
// démarre : un identifiant neuf n'en exclut aucune.
function startingSession(stdin: string): string {
  try {
    const parsed = HookSessionSchema.safeParse(JSON.parse(stdin));
    if (parsed.success) return parsed.data.session_id;
  } catch {
    // Entrée vide (lancée à la main) ou illisible.
  }
  return randomUUID();
}

// La branche courante du projet ; null en tête détachée, hors d'un dépôt, si git échoue, ou si la route ne
// l'accepterait pas (trop longue).
async function currentBranch(directory: string, git: GitRunner): Promise<string | null> {
  const branch = await git(['branch', '--show-current'], directory).catch(() => null);
  return ContextRequestSchema.shape.branche.safeParse(branch).success ? branch : null;
}

// Le dossier du projet de la session : le `cwd` du JSON du crochet, sinon INIT_CWD, sinon le dossier du processus.
// Seuls les chemins absolus comptent : un chemin relatif se lirait contre le dépôt de Leon.
export function briefingDirectory(
  stdin: string,
  env: Record<string, string | undefined>,
  cwd: string,
): string {
  try {
    const parsed = HookCwdSchema.safeParse(JSON.parse(stdin));
    if (parsed.success) return parsed.data.cwd;
  } catch {
    // Entrée vide (lancée à la main) ou illisible : on passe à la suite.
  }
  const initCwd = env.INIT_CWD;
  if (initCwd !== undefined && initCwd !== '' && isAbsolute(initCwd)) return initCwd;
  return cwd;
}

export type BriefingCommandDeps = {
  stdin: Parameters<typeof readHookStdin>[0];
  env: Record<string, string | undefined>;
  cwd: string;
  home: string;
  git: GitRunner;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
};

// La commande `leon briefing`. Seul le bloc passe sur la sortie standard ; les messages ne citent ni le projet ni
// l'adresse du serveur. Le code de sortie vaut toujours 0, pour ne jamais gêner Claude Code. Lancée par un autre
// outil (Cursor, Codex : isOtherToolHook), elle n'écrit rien, pas même un message de configuration ou de retrait.
// L'accord retiré (version 0, consent.ts), elle ne demande rien et ne lance pas git.
export async function runBriefing(deps: BriefingCommandDeps): Promise<0> {
  try {
    const stdin = await readHookStdin(deps.stdin, { timeoutMs: BRIEFING_STDIN_TIMEOUT_MS });
    if (isOtherToolHook(stdin, deps.env, deps.home)) return 0;
    // Après la garde : sous un autre outil, même ce message ne s'écrit pas.
    if (await consentWithdrawn(deps.home, 'claude_code')) {
      deps.err(CONSENT_WITHDRAWN_MESSAGE);
      return 0;
    }
    const server = await resolveServerEnv(deps.env, deps.home);
    const directory = briefingDirectory(stdin, deps.env, deps.cwd);
    let text: string | null;
    if ((await factsConsent(deps.home, 'claude_code')) === null) {
      // Sans l'accord du bloc : ni branche ni session ne partent, le point du matin seul, comme avant.
      text = await fetchBriefingText(deps.fetch, server, await projectKeyFor(directory, deps.git));
    } else {
      // En même temps : git ne retient le démarrage qu'une fois son délai, pas deux.
      const [projet, branche] = await Promise.all([
        projectKeyFor(directory, deps.git),
        currentBranch(directory, deps.git),
      ]);
      text = await fetchStartText(deps.fetch, server, {
        projet,
        branche,
        session: startingSession(stdin),
      });
    }
    if (text === null) {
      deps.err('Leon: briefing unavailable (server unreachable or token refused).');
    } else {
      deps.out(startOutput('claude_code', text));
    }
  } catch (error) {
    // Messages fixes (resolveServerEnv, route absente) : ils ne recopient ni le jeton ni une adresse.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'briefing unavailable.'}`);
  }
  return 0;
}
