// Le rappel à chaque message (T49 du plan de la mémoire à disposition ; C8, D26) : à chaque message de la personne, le
// crochet demande au serveur la ligne de clés des fils qui touchent ce message (la route `rappel`, C8), et l'imprime,
// ou n'imprime rien.
// - `askReminder` est le cœur commun : Claude Code (la commande `leon reminder` ci-dessous) comme Cursor, Codex et
//   Antigravity (`leon crochet <outil> prompt`, briefing.ts) l'appellent. Sans l'usage `rappel` dans l'accord de l'outil, rien ne part.
// - Le message part masqué (maskSecrets), puis coupé à 2 000 caractères ; le serveur le masque de nouveau et ne le
//   stocke ni ne le journalise. Un seul signal de 1,5 s couvre la demande : un serveur lent, absent ou ancien (404,
//   400) donne un texte vide, jamais une erreur, et le message de la personne passe toujours.
// - Claude Code : le crochet UserPromptSubmit (5 s) écrit sur l'entrée standard un JSON qui porte `prompt`, `session_id`
//   et `cwd` (doc officielle des crochets, https://code.claude.com/docs/en/hooks), et sa sortie standard va au contexte
//   du modèle : seule la ligne y passe, les messages vont sur la sortie d'erreur. Le code de sortie vaut toujours 0.
//   Au pire, 1 s d'entrée + 3 s de git (projectKeyFor, currentBranch) + 1,5 s de réseau + le démarrage de Node.
// shortcut: un git qui met 3 s à répondre (disque réseau) fait dépasser les 5 s du crochet, et Claude Code envoie le
// message sans rappel après 5 s d'attente ; un délai global pour toute la commande, si le cas se présente.
// shortcut: une entrée de plus de 64 Kio (un message collé énorme) est lue vide (readHookStdin) : pas de rappel pour ce
// message-là, à lever si le cas se présente.
import { z } from 'zod';
import {
  API_PATHS,
  ContextRequestSchema,
  RAPPEL_MESSAGE_MAX,
  type RappelRequest,
  RappelResponseSchema,
} from '../capture/api-contract';
import { maskSecrets } from '../capture/mask-secrets';
import type { CodeSessionKind } from '../capture/turn';
import { BRIEFING_STDIN_TIMEOUT_MS, briefingDirectory, currentBranch } from './briefing';
import { isOtherToolHook, readHookStdin } from './capture-session';
import { type FactsConsent, factsConsent } from './consent';
import { resolveServerEnv, type ServerEnv } from './env';
import { type GitRunner, projectKeyFor } from './project-key';

export const REMINDER_TIMEOUT_MS = 1500;

export type ReminderArgs = {
  fetch: typeof fetch;
  server: ServerEnv;
  // L'accord de l'outil : sans `rappel` dans ses usages, rien ne part.
  consent: FactsConsent | null;
  outil: CodeSessionKind;
  projet: string;
  branche: string | null;
  session: string;
  message: string;
};

// La ligne de rappel de ce message, ou une chaîne vide : sans l'usage, sans message, ou quoi qu'il arrive à la demande.
export async function askReminder(args: ReminderArgs): Promise<string> {
  const { consent, message } = args;
  if (!consent?.usages.includes('rappel') || message === '') return '';
  const body: RappelRequest = {
    projet: args.projet,
    branche: args.branche,
    session: args.session,
    // Masqué en entier, puis coupé : coupé d'abord, un secret à cheval sur la borne serait trop court pour son motif
    // et partirait en morceau. Le serveur refuse (400) un message de plus de 2 000 caractères.
    message: maskSecrets(message).slice(0, RAPPEL_MESSAGE_MAX),
    outil: args.outil,
    usages: consent.usages,
  };
  try {
    const response = await args.fetch(new URL(API_PATHS.rappel, args.server.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.server.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REMINDER_TIMEOUT_MS),
    });
    if (!response.ok) return '';
    const parsed = RappelResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.texte : '';
  } catch {
    return '';
  }
}

const HookPromptSchema = z.object({
  prompt: z.string().min(1),
  session_id: ContextRequestSchema.shape.session,
});

export type ReminderCommandDeps = {
  stdin: Parameters<typeof readHookStdin>[0];
  env: Record<string, string | undefined>;
  cwd: string;
  home: string;
  git: GitRunner;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
};

// La commande `leon reminder`, pour le crochet UserPromptSubmit de Claude Code. Lancée par un autre outil (Cursor, Codex :
// isOtherToolHook), elle n'écrit rien. L'accord retiré ou sans `rappel`, elle ne lit ni git ni le réseau.
export async function runReminder(deps: ReminderCommandDeps): Promise<0> {
  try {
    const stdin = await readHookStdin(deps.stdin, { timeoutMs: BRIEFING_STDIN_TIMEOUT_MS });
    if (isOtherToolHook(stdin, deps.env, deps.home)) return 0;
    // L'accord retiré (version 0) donne null, comme un accord absent.
    const consent = await factsConsent(deps.home, 'claude_code');
    if (!consent?.usages.includes('rappel')) return 0;
    let json: unknown = null;
    try {
      json = JSON.parse(stdin);
    } catch {
      // Entrée vide (lancée à la main) ou illisible : pas de message.
    }
    const input = HookPromptSchema.safeParse(json);
    if (!input.success) return 0;
    const server = await resolveServerEnv(deps.env, deps.home);
    const directory = briefingDirectory(stdin, deps.env, deps.cwd);
    const [projet, branche] = await Promise.all([
      projectKeyFor(directory, deps.git),
      currentBranch(directory, deps.git),
    ]);
    const line = await askReminder({
      fetch: deps.fetch,
      server,
      consent,
      outil: 'claude_code',
      projet,
      branche,
      session: input.data.session_id,
      message: input.data.prompt,
    });
    if (line !== '') deps.out(line);
  } catch (error) {
    // Messages fixes (resolveServerEnv) : ils ne recopient ni le jeton, ni une adresse, ni le message.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'reminder unavailable.'}`);
  }
  return 0;
}
