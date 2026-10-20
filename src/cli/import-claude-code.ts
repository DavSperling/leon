import { readFile } from 'node:fs/promises';
import { basename, sep } from 'node:path';
import { z } from 'zod';
import { API_PATHS } from '../capture/api-contract';
import { type ClaudeCodeSession, parseClaudeCodeSession } from '../capture/claude-code';
import {
  type IngestPayload,
  type IngestResult,
  IngestResultSchema,
  TURNS_PER_BATCH_MAX,
} from '../capture/turn';
import { logError } from '../server/log';
import { BATCH_MAX_BYTES, batchTurns } from './batch-turns';
import type { ServerEnv } from './env';
import { findSessionFiles } from './find-sessions';

// `--since AAAA-MM-JJ` : minuit à l'heure locale de qui lance l'import, pas minuit UTC.
export function parseSince(value: string | undefined): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (!z.iso.date().safeParse(value).success) {
    throw new Error('--since attend une date au format AAAA-MM-JJ.');
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
export type ImportDeps = {
  send: (payload: IngestPayload) => Promise<IngestResult>;
  out: (line: string) => void;
};
export type ImportSummary = {
  sessions: number;
  turnsSent: number;
  inserted: number;
  skipped: number;
  failures: number;
};

export class TokenRefusedError extends Error {
  override name = 'TokenRefusedError';
  constructor() {
    super('Jeton refusé par le serveur Leon.');
  }
}

// Une réponse en erreur du serveur : le code seul compte, ni le corps ni l'adresse n'entrent dans le message.
export class IngestResponseError extends Error {
  override name = 'IngestResponseError';
  constructor(readonly status: number) {
    super(`Réponse ${status} du serveur Leon.`);
  }
}

// `signal` borne la durée d'un envoi (réponse comprise) : le crochet de fin de session en a besoin,
// l'import par lots, non.
export function createIngestSender(
  fetchImpl: typeof fetch,
  env: ServerEnv,
  options: { signal?: AbortSignal } = {},
): ImportDeps['send'] {
  return async (payload) => {
    const response = await fetchImpl(new URL(API_PATHS.ingest, env.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (response.status === 401) throw new TokenRefusedError();
    if (!response.ok) throw new IngestResponseError(response.status);
    return IngestResultSchema.parse(await response.json());
  };
}

// La session filtrée par project et since, ou null s'il ne reste rien à envoyer.
async function loadSession(
  file: string,
  options: ImportOptions,
): Promise<ClaudeCodeSession | null> {
  const session = parseClaudeCodeSession(await readFile(file, 'utf8'));
  if (!session) return null;
  // Le dossier lui-même ou l'un de ses sous-dossiers, jamais un voisin comme /x/acme-bis.
  const { cwd } = session;
  if (options.project && !(cwd === options.project || cwd?.startsWith(options.project + sep))) {
    return null;
  }
  const { since } = options;
  const turns = since ? session.turns.filter((turn) => new Date(turn.ts) >= since) : session.turns;
  return turns.length > 0 ? { ...session, turns } : null;
}

// Envoie une session déjà lue, par lots ; le crochet de fin de session s'en sert aussi.
// `newestFirst` : les lots partent du plus récent au plus ancien (les tours restent dans l'ordre à l'intérieur
// de chaque lot). Le crochet, borné par un délai, s'en sert pour qu'une session reprise, dont l'historique est
// déjà connu, atteigne d'abord ses tours nouveaux ; le serveur lit les tours par date, pas par ordre d'arrivée.
export async function importSession(
  session: ClaudeCodeSession,
  options: Pick<ImportOptions, 'dryRun' | 'projectKey'> & { newestFirst?: boolean },
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
        kind: 'claude_code',
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
  for (const file of await findSessionFiles(options.baseDir)) {
    try {
      const loaded = await loadSession(file, options);
      const turns = loaded?.turns.filter((turn) => !seen.has(turn.external_id)) ?? [];
      if (!loaded || turns.length === 0) continue;
      for (const turn of turns) seen.add(turn.external_id);
      summary.sessions += 1;
      await importSession({ ...loaded, turns }, options, deps, summary);
    } catch (error) {
      if (error instanceof TokenRefusedError) throw error;
      summary.failures += 1;
      logError('import_claude_code_session', error, { file: basename(file) });
    }
  }
  return summary;
}
