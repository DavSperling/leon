import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, sep } from 'node:path';
import { z } from 'zod';
import {
  API_PATHS,
  COULISSES_BLOCS_MAX,
  type CoulissesRequest,
  type RetraitRequest,
  type SessionFacts,
  type SessionFactsPayload,
  type Usage,
} from '../capture/api-contract';
import { type ClaudeCodeSession, parseClaudeCodeSession } from '../capture/claude-code';
import { extractBackstage } from '../capture/session-backstage';
import { extractClaudeCodeFacts, type Subagents } from '../capture/session-facts';
import {
  BACKSTAGE_ROLES,
  type CodeSessionKind,
  type IngestPayload,
  type IngestResult,
  IngestResultSchema,
  TURNS_PER_BATCH_MAX,
  type Turn,
} from '../capture/turn';
import { BATCH_MAX_BYTES, batchTurns, COULISSES_BATCH_MAX_BYTES } from './batch-turns';
import { CONSENT_WITHDRAWN_MESSAGE } from './consent';
import type { ServerEnv } from './env';
import { findSessionFiles } from './find-sessions';
import { type GitRunner, projectKeyFor, repoRootFor } from './project-key';
import { loadSubagents } from './subagents';

// `--since AAAA-MM-JJ` : minuit à l'heure locale de qui lance l'import, pas minuit UTC.
export function parseSince(value: string | undefined): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (!z.iso.date().safeParse(value).success) {
    throw new Error('--since expects a date in the format YYYY-MM-DD.');
  }
  return new Date(`${value}T00:00:00`);
}

// `project` filtre les sessions par dossier ; `projectKey` est la clé envoyée dans `source.project` (voir project-key.ts).
export type ImportOptions = {
  baseDir: string;
  project?: string;
  projectKey?: string;
  since?: Date;
  dryRun: boolean;
};
export type FactsSender = (payload: SessionFactsPayload) => Promise<void>;
export type CoulissesSender = (request: CoulissesRequest) => Promise<void>;
export type ImportDeps = {
  send: (payload: IngestPayload) => Promise<IngestResult>;
  out: (line: string) => void;
  // Avec lui, l'import calcule la clé de projet de chaque session sur son dossier de départ, comme le crochet de fin
  // de session : une session rattrapée par l'import entre dans le point du matin de son projet.
  git?: GitRunner;
  // L'accord retiré (consent.ts), relu avant chaque session et avant ses faits (sendSessionFacts) : un `leon
  // retirer-crochets` lancé pendant un long import l'arrête, sans autre envoi. La borne d'une heure du résumé
  // (resume-worker.ts) en dépend. Les crochets de fin et le rattrapage le donnent aussi, pour les faits.
  withdrawn?: () => Promise<boolean>;
  // Le listage d'un dossier, pour lire les sous-agents d'une session Claude Code (subagents.ts, T63). Absent, aucun n'est
  // lu : leurs appels rendent la session externe.
  readdir?: (path: string) => Promise<string[]>;
  // Les faits de chaque session (C2), posés seulement quand l'accord couvre les gestes (consent.ts) : `accord` est la
  // version transmise au serveur, `usages` ceux que l'outil a acceptés (C7 révisé), `accordLe` la date de l'accord
  // (`installe_le`), qui part avec eux (`accord_le`, T43 : le serveur la compare au dernier retrait). `depuis`, la date
  // de l'accord : au rattrapage, seuls les fichiers modifiés ensuite envoient leurs faits (vigilance 4 du plan) ; de
  // même, `usagesDepuis` : un usage ne part qu'avec les fichiers modifiés après sa date (`resume` accepté ce jour ne
  // fait pas résumer les sessions finies avant). Le crochet de fin de session, lui, n'en a pas besoin.
  facts?: {
    accord: number;
    accordLe: Date;
    usages?: Usage[];
    send: FactsSender;
    // Les coulisses (C10 amendé le 12/11, T52), qui ne partent qu'avec l'usage `coulisses` dans `usages`.
    sendCoulisses?: CoulissesSender;
    depuis?: Date;
    usagesDepuis?: Partial<Record<Usage, Date>>;
  };
};
export type ImportSummary = {
  sessions: number;
  turnsSent: number;
  inserted: number;
  skipped: number;
  failures: number;
};

// « 1 turn », « 3 turns » : les messages de la CLI écrivent leurs pluriels.
export const countOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

export class TokenRefusedError extends Error {
  override name = 'TokenRefusedError';
  constructor() {
    super('Token refused by the Leon server.');
  }
}

// Une réponse en erreur du serveur : le code seul compte, ni le corps ni l'adresse n'entrent dans le message.
export class IngestResponseError extends Error {
  override name = 'IngestResponseError';
  constructor(readonly status: number) {
    super(`Response ${status} from the Leon server.`);
  }
}

// Le message d'un serveur qui ne prend pas les faits : 404, il est plus ancien que leur route ; 400, il ne
// reconnaît pas l'envoi. Les tours, eux, sont reçus.
export const FACTS_REFUSED_MESSAGE =
  'the server does not accept session facts (it may be older than the CLI), only the turns were sent.';

// De même pour les coulisses : les tours et les faits, eux, sont reçus.
export const COULISSES_REFUSED_MESSAGE =
  'the server does not accept the full capture of sessions (it may be older than the CLI), the rest of the session was sent.';

type Sending = { signal?: AbortSignal };

// `signal` borne la durée d'un envoi (réponse comprise) : le crochet de fin de session en a besoin,
// l'import par lots, non.
async function post(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  path: string,
  payload: unknown,
  { signal }: Sending,
): Promise<Response> {
  const response = await fetchImpl(new URL(path, env.url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
  if (response.status === 401) throw new TokenRefusedError();
  if (!response.ok) throw new IngestResponseError(response.status);
  return response;
}

export function createIngestSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  options: Sending = {},
): ImportDeps['send'] {
  return async (payload) => {
    const response = await post(fetchImpl, env, API_PATHS.ingest, payload, options);
    return IngestResultSchema.parse(await response.json());
  };
}

// Le serveur répond 202, sans corps.
export function createFactsSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  options: Sending = {},
): FactsSender {
  return async (payload) => {
    await post(fetchImpl, env, API_PATHS.faits, payload, options);
  };
}

// Le serveur répond 202, sans corps.
export function createCoulissesSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  options: Sending = {},
): CoulissesSender {
  return async (request) => {
    await post(fetchImpl, env, API_PATHS.coulisses, request, options);
  };
}

// Le retrait de l'accord d'un outil (T43), daté (`retire_le`) : le serveur vide les usages de ses sessions, garde la
// date pour ce jeton, et répond 204, sans corps.
export function createWithdrawalSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  options: Sending = {},
): (outil: CodeSessionKind, retireLe: string) => Promise<void> {
  return async (outil, retireLe) => {
    const request: RetraitRequest = { outil, retire_le: retireLe };
    await post(fetchImpl, env, API_PATHS.retrait, request, options);
  };
}

// La session filtrée par project et since, avec le contenu du fichier (ses faits), ou null s'il ne reste rien
// à envoyer.
async function loadSession(
  file: string,
  options: ImportOptions,
): Promise<{ session: ClaudeCodeSession; content: string } | null> {
  const content = await readFile(file, 'utf8');
  const session = parseClaudeCodeSession(content);
  if (!session) return null;
  // Le dossier lui-même ou l'un de ses sous-dossiers, jamais un voisin comme /x/acme-bis.
  const { cwd } = session;
  if (options.project && !(cwd === options.project || cwd?.startsWith(options.project + sep))) {
    return null;
  }
  const { since } = options;
  const turns = since ? session.turns.filter((turn) => new Date(turn.ts) >= since) : session.turns;
  return turns.length > 0 ? { session: { ...session, turns }, content } : null;
}

// Ce que l'envoi lit d'une session de code, quel que soit l'outil (claude-code.ts, codex.ts).
export type CodeSession = Pick<ClaudeCodeSession, 'sessionId' | 'title'> & { turns: Turn[] };

// Envoie une session déjà lue, par lots ; le crochet de fin de session s'en sert aussi. `kind` : l'outil de la session
// (Claude Code par défaut).
// `newestFirst` : les lots partent du plus récent au plus ancien (les tours restent dans l'ordre à l'intérieur
// de chaque lot). Le crochet, borné par un délai, s'en sert pour qu'une session reprise, dont l'historique est
// déjà connu, atteigne d'abord ses tours nouveaux ; le serveur lit les tours par date, pas par ordre d'arrivée.
export async function importSession(
  session: CodeSession,
  options: Pick<ImportOptions, 'dryRun' | 'projectKey'> & {
    newestFirst?: boolean;
    kind?: CodeSessionKind;
  },
  deps: ImportDeps,
  summary: ImportSummary,
): Promise<void> {
  const batches = batchTurns(session.turns, {
    maxTurns: TURNS_PER_BATCH_MAX,
    maxBytes: BATCH_MAX_BYTES,
  });
  if (options.newestFirst) batches.reverse();
  for (const turns of batches) {
    const payload: IngestPayload = {
      source: {
        kind: options.kind ?? 'claude_code',
        external_id: session.sessionId,
        title: session.title ?? undefined,
        ...(options.projectKey === undefined ? {} : { project: options.projectKey }),
      },
      turns,
    };
    if (options.dryRun) {
      deps.out(JSON.stringify(payload));
    } else {
      const result = await deps.send(payload);
      summary.inserted += result.inserted;
      summary.skipped += result.skipped;
    }
    summary.turnsSent += turns.length;
  }
}

// Les faits d'une session (C2), après ses tours, quand l'accord le permet (`deps.facts`). `root` est la racine du
// dépôt du dossier de départ (repoRootFor) : les fichiers écrits ailleurs sont retirés, et tous hors de tout dépôt
// (null), comme le promet le texte de l'accord (« paths in the repository »). Rend false quand le serveur ne les
// prend pas (FACTS_REFUSED_MESSAGE) ; toute autre erreur remonte. Sans `faits`, ceux d'une session Claude Code, lus
// dans `content` ; un autre outil donne les siens (`kind`, `faits`), relevés par son lecteur.
// shortcut: un worktree hors du clone (../leon-wt) perd ses fichiers, seuls ceux de `.claude/worktrees/` du clone
// sont gardés (extractClaudeCodeFacts) ; prendre la racine du dépôt de chaque fichier le jour où ça manque.
// shortcut: l'import ne lit pas la configuration MCP (leon-mcp.ts) : un outil du serveur de Leon y rend la session
// externe (échec fermé), le crochet de fin la relit. La lire ici si l'import doit rattraper ces sessions.
export async function sendSessionFacts(
  session: Pick<CodeSession, 'sessionId'>,
  source: {
    content: string;
    root: string | null;
    fin: boolean;
    faits?: SessionFacts;
    subagents?: Subagents;
  },
  options: Pick<ImportOptions, 'dryRun' | 'projectKey'> & { kind?: CodeSessionKind },
  deps: ImportDeps,
): Promise<boolean> {
  if (!deps.facts) return true;
  const payload: SessionFactsPayload = {
    kind: options.kind ?? 'claude_code',
    external_id: session.sessionId,
    ...(options.projectKey === undefined ? {} : { project: options.projectKey }),
    accord: deps.facts.accord,
    // Sans usage, ni l'un ni l'autre : le corps reste celui qu'un serveur d'avant C7 révisé accepte (`.strict()`).
    ...(deps.facts.usages?.length
      ? { usages: deps.facts.usages, accord_le: deps.facts.accordLe.toISOString() }
      : {}),
    faits:
      source.faits ?? extractClaudeCodeFacts(source.content, source.root, false, source.subagents),
    fin: source.fin,
  };
  if (options.dryRun) {
    deps.out(JSON.stringify(payload));
    return true;
  }
  // L'accord relu juste avant : rien ne part une fois le retrait écrit sur le poste. Des faits déjà partis, qui
  // arrivent au serveur après la route du retrait (T43), n'y remettent aucun usage : leur `accord_le` ne suit pas la
  // date du retrait que le serveur garde pour ce jeton (record-facts.ts).
  if (await deps.withdrawn?.()) return true;
  try {
    await deps.facts.send(payload);
    return true;
  } catch (error) {
    if (error instanceof IngestResponseError && [400, 404].includes(error.status)) return false;
    throw error;
  }
}

// Les coulisses d'une session Claude Code (T52), après ses faits, seulement avec l'usage `coulisses` dans
// `deps.facts.usages` (à l'import, déjà filtrés par `usagesDepuis`). Par lots sous la taille de la route et sous
// COULISSES_BLOCS_MAX blocs, les plus récents d'abord : une coupe du délai du crochet laisse les plus anciens à l'import,
// qui les renvoie sans doublon (identifiants stables). En dryRun, seulement le nombre de blocs par rôle, jamais un
// texte. Rend false quand le serveur ne les prend pas (404, 400 : COULISSES_REFUSED_MESSAGE) ; un 403 (usage retiré
// entre-temps) arrête l'envoi sans bruit ; toute autre erreur remonte.
export async function sendSessionBackstage(
  session: Pick<CodeSession, 'sessionId'>,
  source: { content: string; root: string | null; subagents: Subagents },
  options: Pick<ImportOptions, 'dryRun'>,
  deps: ImportDeps,
): Promise<boolean> {
  const facts = deps.facts;
  if (!facts?.sendCoulisses || !facts.usages?.includes('coulisses')) return true;
  const blocs = extractBackstage(source.content, source.root, source.subagents);
  if (blocs.length === 0) return true;
  const envelope = { kind: 'claude_code' as const, external_id: session.sessionId };
  if (options.dryRun) {
    const counts = BACKSTAGE_ROLES.map((role) => [
      role,
      blocs.filter((bloc) => bloc.role === role).length,
    ]);
    deps.out(JSON.stringify({ ...envelope, coulisses: Object.fromEntries(counts) }));
    return true;
  }
  const batches = batchTurns(blocs, {
    maxTurns: COULISSES_BLOCS_MAX,
    maxBytes: COULISSES_BATCH_MAX_BYTES,
  }).reverse();
  for (const lot of batches) {
    // L'accord relu juste avant chaque lot, comme pour les faits.
    if (await deps.withdrawn?.()) return true;
    const request: CoulissesRequest = {
      ...envelope,
      usages: facts.usages,
      accord_le: facts.accordLe.toISOString(),
      blocs: lot,
    };
    try {
      await facts.sendCoulisses(request);
    } catch (error) {
      if (!(error instanceof IngestResponseError)) throw error;
      if (error.status === 403) return true;
      if ([400, 404].includes(error.status)) return false;
      throw error;
    }
  }
  return true;
}

// Au rattrapage, une session est finie si son fichier n'a pas bougé depuis 30 min (le rattrapage des autres outils
// aussi, catch-up.ts).
export const IDLE_MS = 30 * 60_000;

export async function importClaudeCode(
  options: ImportOptions,
  deps: ImportDeps,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    sessions: 0,
    turnsSent: 0,
    inserted: 0,
    skipped: 0,
    failures: 0,
  };
  // Une session reprise recopie l'historique (mêmes uuid, autre sessionId) : chaque tour n'est envoyé qu'une fois.
  const seen = new Set<string>();
  // Un serveur qui refuse les faits les refusera pour toutes les sessions : un seul message, plus aucun envoi. De même
  // pour les coulisses.
  let factsRefused = false;
  let coulissesRefused = false;
  for (const file of await findSessionFiles(options.baseDir)) {
    if (await deps.withdrawn?.()) throw new Error(CONSENT_WITHDRAWN_MESSAGE);
    try {
      const loaded = await loadSession(file, options);
      const turns = loaded?.session.turns.filter((turn) => !seen.has(turn.external_id)) ?? [];
      if (!loaded || turns.length === 0) continue;
      const { session, content } = loaded;
      for (const turn of turns) seen.add(turn.external_id);
      summary.sessions += 1;
      const start = session.cwd !== null && isAbsolute(session.cwd) ? session.cwd : null;
      const projectKey =
        deps.git && start !== null ? await projectKeyFor(start, deps.git) : options.projectKey;
      await importSession({ ...session, turns }, { ...options, projectKey }, deps, summary);
      if (!deps.facts || factsRefused || start === null) continue;
      const { mtimeMs } = await stat(file);
      const { depuis, usagesDepuis } = deps.facts;
      if (depuis && mtimeMs < depuis.getTime()) continue;
      const usages = deps.facts.usages?.filter(
        (usage) => mtimeMs >= (usagesDepuis?.[usage]?.getTime() ?? 0),
      );
      const fin = Date.now() - mtimeMs >= IDLE_MS;
      // Sans git (essais), la racine reste le dossier de départ.
      const root = deps.git ? await repoRootFor(start, deps.git) : start;
      const subagents = await loadSubagents(file, {
        readFile: (path) => readFile(path, 'utf8'),
        readdir: deps.readdir,
      });
      const source = { content, root, fin, subagents };
      const factsDeps = { ...deps, facts: { ...deps.facts, usages } };
      factsRefused = !(await sendSessionFacts(
        session,
        source,
        { ...options, projectKey },
        factsDeps,
      ));
      if (factsRefused) {
        console.error(FACTS_REFUSED_MESSAGE);
        continue;
      }
      if (coulissesRefused) continue;
      coulissesRefused = !(await sendSessionBackstage(session, source, options, factsDeps));
      if (coulissesRefused) console.error(COULISSES_REFUSED_MESSAGE);
    } catch (error) {
      if (error instanceof TokenRefusedError) throw error;
      summary.failures += 1;
      // Message fixe : l'erreur peut citer du texte de conversation, et la CLI construite en un seul fichier
      // (S06) n'embarque rien de src/server, `logError` compris.
      console.error('Leon: a session could not be imported (unexpected error).');
    }
  }
  return summary;
}
