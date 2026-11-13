// Crochet de démarrage de Claude Code : affiche le bloc de démarrage du projet de la session (C3 et C4 du plan
// mémoire des sessions) : mes dernières sessions sur ce dépôt, puis le point du matin, assemblés par le serveur
// (`/contexte`). Un serveur plus ancien que cette route répond 404 : la commande retombe sur le point du matin seul
// (`/briefing`), comme avant. Le bloc envoie la branche et la session, et donne mes sessions au modèle : il attend
// l'accord local en version 2 (C7, consent.ts). Sans lui (crochets installés avant ce chantier), le point seul.
// Avec l'usage `lecture` de l'outil du crochet (T46 du plan de la mémoire à disposition), le bloc envoie aussi les
// usages de cet outil, jamais ceux d'un autre, et la commande Leon posée sur le poste (leonCommand) : le serveur rend
// alors le sommaire des fils et la consigne de lecture. Avec l'usage `noter` (T57), les mêmes, et l'outil du crochet :
// le serveur rend alors la phrase de `leon note`. Un serveur plus ancien que ces champs répond 400 : le point du matin
// seul, comme pour un 404.
//
// Doc officielle des crochets : https://code.claude.com/docs/en/hooks (lue le 2026-10-20).
// - L'évènement s'appelle `SessionStart` (`source` : startup, resume, clear, compact ou fork). Claude Code écrit sur
//   l'entrée standard du crochet un JSON qui porte les champs communs, dont `session_id` et `cwd` (« Current working
//   directory when the hook is invoked »). Seuls ces deux-là sont lus ici, plus `transcript_path` et
//   `cursor_version` pour reconnaître un autre outil (isOtherToolHook, capture-session.ts).
// - Pour SessionStart, Claude Code ajoute la sortie standard au contexte de la session : seul le bloc y passe ; les
//   messages vont sur la sortie d'erreur, que Claude ne voit pas quand le code de sortie vaut 0.
// - Le crochet lance le lanceur (`launcherHookCommand(<dossier personnel>, 'briefing')`, hook-commands.ts : `~/.leon/bin/leon
//   briefing`, K9). Sous la forme installée, il lance le Node et la CLI posés par Leon ; sous la forme clone, `pnpm -s
//   --config.verify-deps-before-run=false --dir <dépôt> leon briefing` : le dossier du processus est alors le dépôt de
//   Leon, pas le projet. Le projet se calcule donc sur le `cwd` du JSON, sinon sur INIT_CWD (que pnpm pose au dossier
//   d'où il a été lancé, `--dir` ou non), sinon sur le dossier du processus (voir briefingDirectory).
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
import { access } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  BriefingResponseSchema,
  CommandeSchema,
  type ContextRequest,
  ContextRequestSchema,
  ContextResponseSchema,
} from '../capture/api-contract';
import { isOtherToolHook, readHookStdin } from './capture-session';
import { CONSENT_WITHDRAWN_MESSAGE, consentWithdrawn, factsConsent } from './consent';
import { resolveServerEnv, type ServerEnv } from './env';
import { launcherPath, type Outil } from './hook-commands';
import { ADAPTATEURS } from './outils';
import { type GitRunner, projectKeyFor } from './project-key';
import { askReminder } from './reminder';
import { startOutput } from './start-output';
import { hasTemoin, writeTemoin } from './temoins';

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
// couvre la demande et, sur un 404 (serveur plus ancien que la route) ou un 400 (plus ancien que `usages` et
// `commande`), le repli sur le point du matin seul.
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
    if (response.status === 404 || response.status === 400)
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
export async function currentBranch(directory: string, git: GitRunner): Promise<string | null> {
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

// La commande Leon posée sur le poste, que cite la consigne du bloc (C3 `commande`, D24) : le lanceur, écrit avec le
// tilde (le chemin du dossier personnel porte le nom de la personne, et part au fournisseur du modèle) ; sans lui,
// depuis un clone, pnpm dans ce clone ; sinon, ou quand elle sortirait de la borne de C3, `leon`. Un chemin à espaces
// passe entre apostrophes, le tilde hors d'elles pour que le shell le développe encore (`~/'code/Leon Project'`) ;
// un chemin qui porte lui-même une apostrophe donne `leon`.
export async function leonCommand(home: string, depot: string | undefined): Promise<string> {
  try {
    await access(launcherPath(home));
    return '~/.leon/bin/leon';
  } catch {
    // Pas de lanceur : la forme du clone, s'il y en a un.
  }
  if (depot === undefined) return 'leon';
  const inHome = depot.startsWith(`${home}/`);
  const path = inHome ? depot.slice(home.length + 1) : depot;
  if (!/^[A-Za-z0-9 ._/-]+$/.test(path)) return 'leon';
  const quoted = path.includes(' ') ? `'${path}'` : path;
  const command = `pnpm --dir ${inHome ? `~/${quoted}` : quoted} leon`;
  return CommandeSchema.safeParse(command).success ? command : 'leon';
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
  // La mise à jour automatique (scheduleUpdate, self-update.ts) : elle décide si elle est due et lance le processus
  // détaché. Absente, rien n'est lancé.
  scheduleUpdate?: () => Promise<unknown>;
  // Le rattrapage des outils dont la capture est acceptée (T19 : `leon rattraper`, lancé détaché). Absent, rien.
  scheduleCatchUp?: () => Promise<unknown>;
  // Le crochet de démarrage d'un autre outil (`leon crochet <outil> demarrage`, C6) ; absent : Claude Code.
  outil?: Outil;
  // L'évènement de cet outil : le démarrage, ou le premier message (`prompt` : Cursor, Antigravity, une fois par
  // conversation). Absent : le démarrage.
  evenement?: 'demarrage' | 'prompt';
  // Le dépôt de Leon quand la CLI tourne depuis un clone : sans lanceur, la consigne cite pnpm dans ce clone.
  depot?: string;
};

// Le JSON de l'entrée, ou null s'il est vide ou illisible.
function parseInput(stdin: string): unknown {
  try {
    return JSON.parse(stdin);
  } catch {
    return null;
  }
}

// La commande `leon briefing`. Seul le bloc passe sur la sortie standard ; les messages ne citent ni le projet ni
// l'adresse du serveur. Le code de sortie vaut toujours 0, pour ne jamais gêner Claude Code. Lancée par un autre
// outil (Cursor, Codex : isOtherToolHook), elle n'écrit rien, pas même un message de configuration ou de retrait.
// L'accord retiré (version 0, consent.ts), elle ne demande rien et ne lance pas git.
//
// Sous un autre outil (`leon crochet <outil> demarrage|prompt`) : l'entrée se lit par son adaptateur (outils.ts), et le
// bloc s'enveloppe dans sa forme. Quand l'outil attend une réponse même sans bloc (Cursor : `{"continue":true}`), elle
// s'écrit dans tous les cas. Pour un outil qui reçoit le bloc au premier message, un témoin le garde d'arriver deux fois
// dans la même conversation (temoins.ts) : déjà reçu, la commande ne demande rien au serveur.
export async function runBriefing(deps: BriefingCommandDeps): Promise<0> {
  const outil = deps.outil;
  const evenement = deps.evenement ?? 'demarrage';
  const adapter = outil === undefined ? undefined : ADAPTATEURS[outil];
  let answered = false;
  const answer = (text: string) => {
    answered = true;
    deps.out(text);
  };
  try {
    const stdin = await readHookStdin(deps.stdin, { timeoutMs: BRIEFING_STDIN_TIMEOUT_MS });
    const entree = adapter && outil ? adapter.entree(parseInput(stdin), deps.home, deps.env) : null;
    if (outil === undefined) {
      if (isOtherToolHook(stdin, deps.env, deps.home)) return 0;
      // Après la garde : sous un autre outil, même ce message ne s'écrit pas.
      if (await consentWithdrawn(deps.home, 'claude_code')) {
        deps.err(CONSENT_WITHDRAWN_MESSAGE);
        return 0;
      }
    }
    // L'accord de l'outil du crochet, le seul dont les usages partent (T46).
    const consent = await factsConsent(deps.home, outil ?? 'claude_code');
    // Le rappel (T49) : à chaque message d'un outil qui le donne à son crochet, avec l'usage `rappel` de cet outil.
    const message = adapter && evenement === 'prompt' ? adapter.message(parseInput(stdin)) : null;
    // Sans dossier de travail dans l'entrée, pas de rappel : le crochet de Cursor et celui d'Antigravity ne tournent pas
    // depuis lui, et il n'y aurait aucun projet où chercher.
    const reminder = consent?.usages.includes('rappel') && entree?.dossier ? message : null;
    // Codex reçoit son bloc au démarrage : à ses messages, le rappel seul, sans un mot d'erreur quand il manque.
    if (adapter && evenement === 'prompt' && !adapter.uneFois && reminder === null) return 0;
    if (outil !== undefined && consent === null) {
      // Un autre outil n'a pas d'« avant ce chantier » : sans son accord (retiré, ou jamais donné), rien ne part.
      deps.err(`Leon: no consent recorded for ${ADAPTATEURS[outil].label}: nothing is sent.`);
      return 0;
    }
    const conversation = entree?.session ?? null;
    // Le bloc : jamais aux messages de Codex ; pour un outil qui le reçoit au premier message, une seule fois (témoin).
    const seen =
      outil !== undefined &&
      adapter?.uneFois === true &&
      conversation !== null &&
      (await hasTemoin(deps.home, outil, conversation));
    const needsBlock = !seen && !(evenement === 'prompt' && adapter?.uneFois === false);
    if (!needsBlock && reminder === null) return 0;
    const server = await resolveServerEnv(deps.env, deps.home);
    const directory = entree?.dossier ?? briefingDirectory(stdin, deps.env, deps.cwd);
    let text: string | null = null;
    let line = '';
    if (consent === null) {
      // Sans l'accord du bloc : ni branche ni session ne partent, le point du matin seul, comme avant.
      text = await fetchBriefingText(deps.fetch, server, await projectKeyFor(directory, deps.git));
    } else {
      // En même temps : git ne retient le démarrage qu'une fois son délai, pas deux.
      const [projet, branche] = await Promise.all([
        projectKeyFor(directory, deps.git),
        currentBranch(directory, deps.git),
      ]);
      const session = conversation ?? startingSession(stdin);
      // Le bloc et le rappel se demandent ensemble : le premier message d'une conversation n'attend pas deux fois.
      [text, line] = await Promise.all([
        needsBlock
          ? fetchStartText(deps.fetch, server, {
              projet,
              branche,
              session,
              // Seulement avec `lecture` ou `noter` : le texte de l'accord de base ne dit que le projet, la branche et
              // la session. `outil` seulement avec `noter` (T57) : un serveur plus ancien le refuserait (400).
              ...(consent.usages.includes('lecture') || consent.usages.includes('noter')
                ? { usages: consent.usages, commande: await leonCommand(deps.home, deps.depot) }
                : {}),
              ...(consent.usages.includes('noter')
                ? { outil: adapter?.kind ?? 'claude_code' }
                : {}),
            })
          : null,
        adapter && reminder !== null
          ? askReminder({
              fetch: deps.fetch,
              server,
              consent,
              outil: adapter.kind,
              projet,
              branche,
              session,
              message: reminder,
            })
          : '',
      ]);
    }
    if (needsBlock && text === null) {
      deps.err('Leon: briefing unavailable (server unreachable or token refused).');
    }
    if (text !== null || line !== '') {
      const injected = [text ?? '', line].filter((part) => part !== '').join('\n');
      answer(
        adapter ? adapter.injection(injected, evenement) : startOutput('claude_code', injected),
      );
    }
    if (text !== null && outil && adapter?.uneFois && conversation !== null) {
      await writeTemoin(deps.home, outil, conversation);
    }
    // Une fois la sortie écrite, le rattrapage (T19) et la mise à jour automatique (S12) : détachés, ils ne sont jamais
    // attendus, et ni leur échec ni leur lenteur ne changent la sortie du crochet. Pas à chaque message : seulement avec
    // le bloc.
    for (const schedule of needsBlock ? [deps.scheduleCatchUp, deps.scheduleUpdate] : []) {
      try {
        await schedule?.();
      } catch {
        // Rien à dire : le crochet a rendu ce qu'on lui demandait.
      }
    }
  } catch (error) {
    // Messages fixes (resolveServerEnv, route absente) : ils ne recopient ni le jeton ni une adresse.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'briefing unavailable.'}`);
  } finally {
    const empty = adapter?.vide(evenement) ?? null;
    if (!answered && empty !== null) deps.out(empty);
  }
  return 0;
}
