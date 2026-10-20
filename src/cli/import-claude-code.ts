import { readFile } from 'node:fs/promises';
import { basename, sep } from 'node:path';
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

export type ImportOptions = { baseDir: string; project?: string; since?: Date; dryRun: boolean };
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

export function createIngestSender(fetchImpl: typeof fetch, env: ServerEnv): ImportDeps['send'] {
  return async (payload) => {
    const response = await fetchImpl(new URL(API_PATHS.ingest, env.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) throw new TokenRefusedError();
    if (!response.ok) throw new Error(`Réponse ${response.status} du serveur Leon.`);
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

async function importSession(
  session: ClaudeCodeSession,
  options: ImportOptions,
  deps: ImportDeps,
  summary: ImportSummary,
): Promise<void> {
  const batches = batchTurns(session.turns, {
    maxTurns: TURNS_PER_BATCH_MAX,
    maxBytes: BATCH_MAX_BYTES,
  });
  for (const turns of batches) {
    const payload: IngestPayload = {
      source: {
        kind: 'claude_code',
        external_id: session.sessionId,
        title: session.title ?? undefined,
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
