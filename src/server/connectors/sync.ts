import { sql } from 'drizzle-orm';
import type { ProviderId } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { logError, safeErrorSummary } from '@/server/log';
import { getBoss } from '@/server/pipeline/queue';
import {
  claimConnection,
  finishSync,
  type LoadedConnection,
  saveSyncProgress,
  UnreadableSecretError,
} from './connections';
import { ConnectorAuthError, ConnectorHttpError, createConnectorHttp } from './http';
import { ingestConnectorItems } from './ingest-items';
import { normalizeItem } from './normalize';
import { ensureFreshTokens, OAuthRefusedError } from './oauth';
import { CONNECTOR_QUEUES, type ConnectorSyncJob } from './queue';
import type { AnyConnector } from './types';

// Un passage lit au plus 200 éléments : le premier passage d'un gros dépôt se fait en plusieurs fois.
export const SYNC_ITEMS_MAX = 200;

export type SyncDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch; // tests
  sleep?: (ms: number) => Promise<void>; // tests
};
export type SyncResult = 'skipped' | 'ok' | 'auth_error' | 'error';

const UNREADABLE_KEY = 'Clé illisible : remplacez-la.';

// `claimConnection` pose la réservation avant de déchiffrer : seule cette erreur-là laisse une
// réservation à libérer. Toute autre (la base indisponible) n'a rien réservé et remonte.
async function claim(
  ctx: TenantContext,
  id: string,
): Promise<LoadedConnection | { unreadable: string } | null> {
  try {
    return await claimConnection(ctx, id);
  } catch (error) {
    if (!(error instanceof UnreadableSecretError)) throw error;
    logError('connector.sync_failed', error, { connectionId: id });
    return { unreadable: error.lockedAt };
  }
}

type Ready = { connector: AnyConnector; config: Record<string, unknown> };

// Le connecteur et sa configuration validée, ou la raison pour laquelle on ne peut pas synchroniser.
function prepare(connection: LoadedConnection, deps: SyncDeps): Ready | { message: string } {
  const connector = deps.getConnector(connection.provider);
  if (!connector) return { message: 'Connecteur indisponible' };
  const parsed = connector.configSchema.safeParse(connection.config);
  if (!parsed.success) return { message: "Configuration illisible : rebranchez l'outil" };
  return { connector, config: parsed.data };
}

// Une page après l'autre : ingestion, puis curseur. Une reprise après plantage refait au pire la
// dernière page, l'ingestion ne crée aucun doublon. Renvoie « soon » quand la limite est atteinte,
// « lost » quand une autre relève a repris la réservation (le passage s'arrête là).
type Again = 'soon' | 'later' | 'lost';

async function readPages(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
  ready: Ready,
): Promise<Again> {
  const { connector, config } = ready;
  const http = createConnectorHttp({
    provider: connection.provider,
    hosts: connector.hosts(config),
    minIntervalMs: connector.minIntervalMs,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  const state = { cursor: connection.cursor, since: connection.since };
  let read = 0;
  for await (const page of connector.sync(config, state, http)) {
    const items = page.items.flatMap((item) => normalizeItem(item, connection.provider) ?? []);
    if (items.length > 0)
      await ingestConnectorItems(ctx, { ...connection, privateRaw: connector.privateRaw }, items);
    const { id, lockedAt } = connection;
    if (!(await saveSyncProgress(ctx, id, lockedAt, page.cursor, items.length))) return 'lost';
    read += page.items.length;
    if (read >= SYNC_ITEMS_MAX) return 'soon';
  }
  return 'later';
}

const isOAuth = (connection: LoadedConnection) => connection.config.authMode === 'oauth';

// Avant le passage : sur une connexion OAuth, renouvelle l'accès s'il expire bientôt.
async function withFreshTokens(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
): Promise<LoadedConnection> {
  const connector = deps.getConnector(connection.provider);
  if (!connector?.oauth) return connection;
  return { ...connection, config: await ensureFreshTokens(ctx, connection, connector, deps) };
}

// Un accès refusé (401) en plein passage alors qu'on a de quoi le renouveler : un renouvellement
// forcé, enregistré, puis le passage repart une fois, au curseur d'origine (l'ingestion ne crée
// aucun doublon). Un second refus remonte.
async function readWithRenewal(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
  ready: Ready,
): Promise<Again> {
  try {
    return await readPages(ctx, connection, deps, ready);
  } catch (error) {
    const { refreshToken } = connection.config;
    const renewable =
      isOAuth(connection) && typeof refreshToken === 'string' && refreshToken !== '';
    // Seul un 401 dit « jeton expiré » ; un 403 est un manque de droits, qu'un nouveau jeton ne
    // règle pas (et le renouvellement userait pour rien un jeton à usage unique).
    if (!(error instanceof ConnectorAuthError) || error.status !== 401 || !renewable) throw error;
  }
  const config = await ensureFreshTokens(ctx, connection, ready.connector, {
    ...deps,
    force: true,
  });
  const renewed = prepare({ ...connection, config }, deps);
  if ('message' in renewed) throw new ConnectorHttpError(null, renewed.message);
  return readPages(ctx, connection, deps, renewed);
}

function authMessage(connection: LoadedConnection, error: ConnectorAuthError | OAuthRefusedError) {
  const label = PROVIDER_LABELS[connection.provider];
  if (error instanceof OAuthRefusedError) return `Reconnectez ${label} : l'autorisation a expiré.`;
  if (isOAuth(connection)) return `Reconnectez ${label} : l'autorisation a été retirée.`;
  return `Clé refusée par ${label} : vérifiez-la ou remplacez-la.`;
}

// Le message de `last_error` est écrit par nous : celui d'une ConnectorHttpError, ou le résumé
// d'une erreur inconnue. Jamais le corps d'une réponse, ni la clé.
async function recordFailure(
  ctx: TenantContext,
  connection: LoadedConnection,
  error: unknown,
): Promise<'auth_error' | 'error'> {
  logError('connector.sync_failed', error, {
    connectionId: connection.id,
    provider: connection.provider,
  });
  if (error instanceof ConnectorAuthError || error instanceof OAuthRefusedError) {
    const message = authMessage(connection, error);
    await finishSync(ctx, connection.id, connection.lockedAt, { kind: 'auth_error', message });
    return 'auth_error';
  }
  const message = error instanceof ConnectorHttpError ? error.message : safeErrorSummary(error);
  await finishSync(ctx, connection.id, connection.lockedAt, { kind: 'error', message });
  return 'error';
}

// Toute issue d'une connexion réservée passe par `finishSync`, qui libère la réservation, sauf une
// réservation perdue en route : elle appartient déjà à une autre relève.
export async function runConnectorSync(job: ConnectorSyncJob, deps: SyncDeps): Promise<SyncResult> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'skipped';
  const connection = await claim(ctx, job.connectionId);
  if (connection === null) return 'skipped';
  if ('unreadable' in connection) {
    const outcome = { kind: 'error', message: UNREADABLE_KEY } as const;
    await finishSync(ctx, job.connectionId, connection.unreadable, outcome);
    return 'error';
  }
  let fresh: LoadedConnection;
  try {
    fresh = await withFreshTokens(ctx, connection, deps);
  } catch (error) {
    return recordFailure(ctx, connection, error);
  }
  const ready = prepare(fresh, deps);
  if ('message' in ready) {
    await finishSync(ctx, connection.id, connection.lockedAt, {
      kind: 'error',
      message: ready.message,
    });
    return 'error';
  }
  let again: Again;
  try {
    again = await readWithRenewal(ctx, fresh, deps, ready);
  } catch (error) {
    return recordFailure(ctx, fresh, error);
  }
  if (again === 'lost') return 'skipped';
  await finishSync(ctx, connection.id, connection.lockedAt, { kind: 'ok', again });
  return 'ok';
}

type DueRow = { connection_id: string; tenant_id: string; user_id: string };

// Un job par connexion due. `connector_syncs_due()` ne rend que des identifiants ; la file
// `connector-sync` (politique « short ») garde un seul job en attente par connexion.
export async function enqueueDueSyncs(): Promise<number> {
  const { rows } = await db.execute<DueRow>(
    sql`select connection_id, tenant_id, user_id from connector_syncs_due()`,
  );
  const boss = await getBoss();
  let queued = 0;
  for (const row of rows) {
    const job: ConnectorSyncJob = {
      connectionId: row.connection_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
    };
    const jobId = await boss.send(CONNECTOR_QUEUES.sync, job, { singletonKey: job.connectionId });
    if (jobId) queued += 1;
  }
  return queued;
}
