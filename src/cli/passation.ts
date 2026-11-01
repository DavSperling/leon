import { spawn } from 'node:child_process';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  PASSATION_BRANCH_PARAM,
  PassationLastSchema,
  PassationStateSchema,
} from '../capture/api-contract';
import { NOTE_MAX_CHARS, parseNote } from '../capture/passation-format';
import type { ServerEnv } from './env';
import type { GitRunner } from './project-key';

// Le côté CLI de la passation (spec du 01/11/2026) : la branche courante, l'état collé au démarrage, et le résumé de
// secours de fin de session, fait sur la machine du développeur avec son propre abonnement (`claude -p`). Rien ici ne
// bloque une session : toute défaillance donne null ou false.

const TIMEOUT_MS = 3000;
const SUMMARY_TIMEOUT_MS = 120_000;
// La sortie standard d'un crochet SessionStart est plafonnée à 10 000 caractères par Claude Code.
export const START_OUTPUT_MAX_CHARS = 9500;
export const MIN_EXCHANGES = 6;
// Posée sur le `claude -p` du secours : ses propres crochets ne font rien (sinon il se capterait et se résumerait).
export const FALLBACK_ENV = 'LEON_PASSATION';

export const SUMMARY_PROMPT = `You are given a condensed Claude Code session on stdin. Write a handoff note for the next developer or agent who will continue this work, in the language of the session. Output only the note, in exactly this format:
## Où j'en suis
<one short paragraph>

- [décision] <each decision taken>
- [essai-raté] <each thing tried that failed, and why>
- [en-cours] <work started, not finished>
- [prochaine-étape] <the next concrete steps>
- [question] <open questions>
Only facts present in the session. No secrets, nothing personal or sensitive. Omit empty categories.`;
// Options vérifiées sur `claude --help` (Claude Code 2.1.280, le 01/11/2026) : `--max-turns` n'y figure pas ; sans
// outil (`--tools ""`), le modèle répond en un seul tour. `--no-session-persistence` : le résumé ne laisse pas de
// fichier de session, qu'un import ultérieur capterait. `--bare` couperait les crochets mais ne lit pas l'abonnement.
function summaryArgs(prompt: string): string[] {
  return ['-p', prompt, '--model', 'haiku', '--tools', '', '--no-session-persistence'];
}

export function isFallbackRun(env: Record<string, string | undefined>): boolean {
  return env[FALLBACK_ENV] === '1';
}

export async function currentBranch(dir: string, git: GitRunner): Promise<string | null> {
  const branch = (await git(['branch', '--show-current'], dir))?.trim();
  return branch ? branch : null;
}

function passationUrl(path: string, env: ServerEnv, project: string, branch: string | null): URL {
  const url = new URL(path, env.url);
  url.searchParams.set(BRIEFING_PROJECT_PARAM, project);
  if (branch !== null) url.searchParams.set(PASSATION_BRANCH_PARAM, branch);
  return url;
}

async function getJson(fetchImpl: typeof fetch, url: URL, env: ServerEnv): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function fetchPassationState(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  project: string,
  branch: string | null,
): Promise<string | null> {
  const parsed = PassationStateSchema.safeParse(
    await getJson(fetchImpl, passationUrl(API_PATHS.passation, env, project, branch), env),
  );
  return parsed.success ? parsed.data.markdown : null;
}

// undefined : on ne sait pas (serveur injoignable, jeton refusé) ; le secours ne part pas.
export async function fetchLastNoteAt(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  project: string,
  branch: string | null,
): Promise<Date | null | undefined> {
  const parsed = PassationLastSchema.safeParse(
    await getJson(fetchImpl, passationUrl(API_PATHS.passationLast, env, project, branch), env),
  );
  if (!parsed.success) return undefined;
  return parsed.data.at === null ? null : new Date(parsed.data.at);
}

// L'état de la branche d'abord (court, borné par le serveur), puis le point du matin coupé à la dernière ligne
// entière qui tient.
export function joinStartOutput(
  state: string | null,
  briefing: string | null,
  max = START_OUTPUT_MAX_CHARS,
): string {
  if (state === null) return (briefing ?? '').slice(0, max);
  if (briefing === null) return state.slice(0, max);
  const room = max - state.length - 2;
  if (room <= 0) return state.slice(0, max);
  if (briefing.length <= room) return `${state}\n\n${briefing}`;
  const lineEnd = briefing.lastIndexOf('\n', room);
  return `${state}\n\n${briefing.slice(0, lineEnd > 0 ? lineEnd : room)}`;
}

export function shouldSummarize(input: {
  exchanges: number;
  startedAt: Date | null;
  lastNoteAt: Date | null;
}): boolean {
  if (input.exchanges < MIN_EXCHANGES) return false;
  if (
    input.lastNoteAt !== null &&
    input.startedAt !== null &&
    input.lastNoteAt >= input.startedAt
  ) {
    return false;
  }
  return true;
}

// `claude -p` sur la session condensée, envoyée par l'entrée standard. Null si claude manque, échoue ou dépasse.
export function runClaudeSummary(prompt: string, input: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('claude', summaryArgs(prompt), {
      env: { ...process.env, [FALLBACK_ENV]: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: SUMMARY_TIMEOUT_MS,
    });
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      out += chunk;
    });
    child.stdin.on('error', () => {});
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 && out.trim() !== '' ? out.trim() : null));
    child.stdin.end(input);
  });
}

export async function summarizeAndSend(deps: {
  condensed: string;
  runClaude: (prompt: string, input: string) => Promise<string | null>;
  send: (note: string) => Promise<boolean>;
}): Promise<boolean> {
  const note = await deps.runClaude(SUMMARY_PROMPT, deps.condensed);
  if (note === null || parseNote(note).items.length === 0) return false;
  return deps.send(note);
}

export function createNoteSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  project: string,
  branch: string | null,
): (note: string) => Promise<boolean> {
  return async (note) => {
    try {
      const response = await fetchImpl(new URL(API_PATHS.passation, env.url), {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texte: note.slice(0, NOTE_MAX_CHARS),
          projet: project,
          branche: branch,
          outil: 'claude_code',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS * 3),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}
