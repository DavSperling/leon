// Crochet de démarrage de Claude Code : affiche le point du matin du projet de la session.
//
// Doc officielle des crochets : https://code.claude.com/docs/en/hooks (lue le 2026-10-20).
// - L'évènement s'appelle `SessionStart` (`source` : startup, resume, clear, compact ou fork). Claude Code écrit sur
//   l'entrée standard du crochet un JSON qui porte les champs communs, dont `cwd` (« Current working directory when
//   the hook is invoked »). Seul `cwd` est lu ici.
// - Pour SessionStart, Claude Code ajoute la sortie standard au contexte de la session : seul le point y passe ; les
//   messages vont sur la sortie d'erreur, que Claude ne voit pas quand le code de sortie vaut 0.
// - Le crochet lance `hookCommand(<dépôt de Leon>, 'briefing')` (hook-commands.ts : `pnpm -s
//   --config.verify-deps-before-run=false --dir <dépôt> leon briefing`) : le dossier du processus est alors le dépôt
//   de Leon, pas le projet. Le projet se calcule donc sur le `cwd` du JSON, sinon sur INIT_CWD (que pnpm pose au
//   dossier d'où il a été lancé, `--dir` ou non), sinon sur le dossier du processus (voir briefingDirectory).
// - La sortie standard d'un crochet est plafonnée à 10 000 caractères par Claude Code : le serveur rend un point qui
//   tient en dessous (BRIEFING_RENDER_MAX_CHARS).
//
// La commande ne bloque jamais une session : entrée standard lue avec un délai court (jamais un terminal), git borné
// (project-key.ts), serveur 3 secondes au plus, et le code de sortie vaut toujours 0. Au pire, ces trois délais se
// suivent : 1 s + 3 s + 3 s, plus le démarrage (une demi-seconde), soit 7,5 s environ, sous le délai de 10 s que
// l'installateur des crochets (T14) doit poser. En pratique, Claude Code ferme l'entrée tout de suite et git répond
// en quelques millisecondes : la commande dure le temps de la requête.
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { API_PATHS, BRIEFING_PROJECT_PARAM, BriefingResponseSchema } from '../capture/api-contract';
import { readHookStdin } from './capture-session';
import { parseServerEnv, type ServerEnv } from './env';
import { type GitRunner, projectKeyFor } from './project-key';

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
// que la commande doit pouvoir dire (elle sort quand même avec le code 0).
export async function fetchBriefingText(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  project: string,
): Promise<string | null> {
  try {
    const url = new URL(API_PATHS.briefing, env.url);
    url.searchParams.set(BRIEFING_PROJECT_PARAM, project);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

const HookCwdSchema = z.object({ cwd: z.string().min(1).refine(isAbsolute) });

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
  git: GitRunner;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
};

// La commande `leon briefing`. Seul le point passe sur la sortie standard ; les messages ne citent ni le projet ni
// l'adresse du serveur. Le code de sortie vaut toujours 0, pour ne jamais gêner Claude Code.
export async function runBriefing(deps: BriefingCommandDeps): Promise<0> {
  try {
    const server = parseServerEnv(deps.env);
    const stdin = await readHookStdin(deps.stdin, { timeoutMs: BRIEFING_STDIN_TIMEOUT_MS });
    const project = await projectKeyFor(briefingDirectory(stdin, deps.env, deps.cwd), deps.git);
    const text = await fetchBriefingText(deps.fetch, server, project);
    if (text === null) {
      deps.err('Leon: briefing unavailable (server unreachable or token refused).');
    } else {
      deps.out(text);
    }
  } catch (error) {
    // Messages fixes (parseServerEnv, route absente) : ils ne recopient ni le jeton ni une adresse.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'briefing unavailable.'}`);
  }
  return 0;
}
