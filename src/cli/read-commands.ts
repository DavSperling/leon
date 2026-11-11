// Les commandes de lecture du poste (T44, T54, T55 ; C9, C11, C12, C13, D27, D30, D31 du plan de la mémoire à
// disposition) : `leon threads` (le dossier), `leon thread [id]` (un fil, sans id celui de la branche courante), `leon
// search <requête>` (la recherche bornée au dépôt), `leon versions <id> [--read <n>]` (l'historique d'un fil ou d'une
// leçon) et `leon lessons [id]` (les leçons acceptées du dépôt, ou une seule). Elles appellent les routes de lecture
// et écrivent le texte gardé que rend le serveur sur la sortie standard, rien sur le disque (D31). Aucune n'écrit une
// leçon ni ne restaure une version : le site seul le fait (D33, D37).
// - L'usage `lecture` vaut pour les commandes du poste dès qu'un outil l'a accepté (D30) : la commande envoie les usages
//   de tous les outils, et le serveur refuse sans lui (403).
// - Un 404 (serveur plus ancien que la route) ou un 403 : un message fixe sur la sortie d'erreur, et le code 0 (C11).
//   Un poste sans connexion, un serveur injoignable ou une autre réponse : un message fixe aussi, et 0, comme le bloc
//   de démarrage (briefing.ts). Les messages ne citent ni le projet, ni l'adresse, ni la requête.
// - Le projet et la branche se lisent comme au démarrage : le dossier d'où la commande est lancée (INIT_CWD sous pnpm).
// shortcut: ni `outil` ni `session` ne partent, la commande ne sait pas quel outil la lance : le journal note `cli`, et
// l'état du modèle relie la lecture à sa session par la date (thread-state-worker.ts). Les envoyer le jour où la
// consigne du bloc les donne.
import { parseArgs } from 'node:util';
import {
  API_PATHS,
  FilRequestSchema,
  READ_BODY_MAX_BYTES,
  ReadResponseSchema,
  USAGES,
  type Usage,
} from '../capture/api-contract';
import { CODE_SESSION_KINDS } from '../capture/turn';
import { briefingDirectory, currentBranch } from './briefing';
import { factsConsent } from './consent';
import { resolveServerEnv } from './env';
import { OUTILS } from './hook-commands';
import { type GitRunner, projectKeyFor } from './project-key';

export const READ_COMMANDS = ['threads', 'thread', 'search', 'versions', 'lessons'] as const;
export type ReadCommand = (typeof READ_COMMANDS)[number];

const PATHS = {
  threads: API_PATHS.dossier,
  thread: API_PATHS.fil,
  search: API_PATHS.chercher,
  versions: API_PATHS.versions,
  lessons: API_PATHS.lecons,
} as const;
// La recherche calcule des vecteurs : plus que les 3 s du bloc de démarrage.
const TIMEOUT_MS = 30_000;

// Le refus du serveur quand aucun outil du poste n'a l'usage `lecture` : `leon setup` le propose dans un terminal (T47),
// sauf à un outil qui l'a refusé, jusqu'au retrait de cet outil.
export const READING_NOT_ALLOWED_MESSAGE =
  'Leon: none of your code tools has accepted reading Leon from this computer (the `lecture` consent): nothing was read. To accept it, run `~/.leon/bin/leon setup` in a terminal. A tool where you refused it is not asked again until you remove its hooks with `~/.leon/bin/leon retirer-crochets` (with `--outil <tool>` for Codex, Cursor or Antigravity).';
export const routeMissingMessage = (command: ReadCommand) =>
  `Leon: this Leon server does not have \`leon ${command}\` yet (route missing).`;

export type ReadDeps = {
  env: Record<string, string | undefined>;
  home: string;
  cwd: string;
  git: GitRunner;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
};

// Les usages acceptés par au moins un outil du poste (D30).
async function acceptedUsages(home: string): Promise<Usage[]> {
  const tools = [...new Set([...CODE_SESSION_KINDS, ...OUTILS])];
  const accepted = new Set<Usage>();
  for (const tool of tools) {
    for (const usage of (await factsConsent(home, tool))?.usages ?? []) accepted.add(usage);
  }
  return USAGES.filter((usage) => accepted.has(usage));
}

const ID_HINT = 'the id of a thread (a uuid, as `leon threads` prints it)';
const LESSON_ID_HINT = 'the id of a lesson (a uuid, as `leon lessons` prints it)';

// Le corps de la route, sans projet ni usages, d'après les arguments ; une erreur d'usage lève (code 1).
async function bodyOf(
  command: ReadCommand,
  args: string[],
  branch: () => Promise<string | null>,
): Promise<Record<string, unknown>> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { read: { type: 'string' } },
  });
  if (command !== 'versions' && values.read !== undefined) {
    throw new Error(`leon ${command} has no --read option.`);
  }
  if (command === 'threads') {
    if (positionals.length > 0) throw new Error('leon threads takes no argument.');
    return { branche: await branch() };
  }
  if (command === 'search') {
    const requete = positionals.join(' ').trim();
    if (requete === '') throw new Error('leon search needs a query: leon search "<query>".');
    return { requete };
  }
  const [id, ...rest] = positionals;
  if (rest.length > 0) throw new Error(`leon ${command} takes one id.`);
  if (id !== undefined && !FilRequestSchema.shape.id.safeParse(id).success) {
    throw new Error(
      `leon ${command}: the id must be ${command === 'lessons' ? LESSON_ID_HINT : ID_HINT}.`,
    );
  }
  if (command === 'lessons') return id === undefined ? {} : { id };
  if (command === 'thread') return id === undefined ? { branche: await branch() } : { id };
  if (id === undefined) throw new Error(`leon versions needs ${ID_HINT}.`);
  const { read } = values;
  if (read !== undefined && !/^[1-9]\d{0,8}$/.test(read)) {
    throw new Error('leon versions --read takes a version number (1, 2, 3…).');
  }
  return read === undefined ? { id } : { id, n: Number(read) };
}

// `leon threads|thread|search|versions|lessons` : le texte du serveur sur la sortie standard, sinon un message fixe sur la
// sortie d'erreur. Le code vaut 0, sauf pour une erreur d'usage, qui lève.
export async function runReadCommand(
  command: ReadCommand,
  args: string[],
  deps: ReadDeps,
): Promise<number> {
  const directory = briefingDirectory('', deps.env, deps.cwd);
  const body = await bodyOf(command, args, () => currentBranch(directory, deps.git));
  let server: Awaited<ReturnType<typeof resolveServerEnv>>;
  try {
    server = await resolveServerEnv(deps.env, deps.home);
  } catch (error) {
    // Messages fixes : ils ne recopient ni le jeton ni une adresse.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'invalid configuration.'}`);
    return 0;
  }
  const request = {
    ...body,
    projet: await projectKeyFor(directory, deps.git),
    usages: await acceptedUsages(deps.home),
  };
  // Une requête trop longue pour la route : refusée ici, sans rien envoyer.
  const json = JSON.stringify(request);
  if (Buffer.byteLength(json) > READ_BODY_MAX_BYTES) {
    throw new Error(`leon ${command}: this request is too long.`);
  }
  let response: Response;
  try {
    response = await deps.fetch(new URL(PATHS[command], server.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' },
      body: json,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    deps.err(`Leon: leon ${command} unavailable (server unreachable or too slow).`);
    return 0;
  }
  if (response.status === 403) deps.err(READING_NOT_ALLOWED_MESSAGE);
  else if (response.status === 404) deps.err(routeMissingMessage(command));
  else if (response.status === 401) deps.err('Leon: token refused by the Leon server.');
  else if (!response.ok) {
    deps.err(`Leon: leon ${command} unavailable (response ${response.status} from the server).`);
  } else {
    const parsed = ReadResponseSchema.safeParse(await response.json().catch(() => null));
    // Sans caractères de contrôle (sauf \n et \t) : un texte capté, écrit par un tiers, ne doit pas pouvoir piloter
    // le terminal (séquences ESC, OSC 8, OSC 52).
    if (parsed.success) deps.out(parsed.data.texte.replace(/(?![\n\t])\p{Cc}/gu, ''));
    else deps.err(`Leon: leon ${command} unavailable (unexpected response from the server).`);
  }
  return 0;
}
