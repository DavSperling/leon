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
  saveAccountKey,
  saveSyncProgress,
  UnreadableSecretError,
} from './connections';
import { ConnectorAuthError, ConnectorHttpError } from './http';
import { ingestConnectorItems, removeConnectorItems } from './ingest-items';
import { normalizeItem } from './normalize';
import { ensureFreshTokens, OAuthRefusedError } from './oauth';
import { connectorHttp, deleteExternalUser, listLeonUsers, pipedreamEnv } from './pipedream';
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

const UNREADABLE_KEY = 'Unreadable key: replace it.';

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
  if (!connector) return { message: 'Connector unavailable' };
  const parsed = connector.configSchema.safeParse(connection.config);
  if (!parsed.success) return { message: 'Unreadable configuration: reconnect the tool' };
  return { connector, config: parsed.data };
}

// Une page après l'autre : ingestion, puis curseur. Une reprise après plantage refait au pire la
// dernière page, l'ingestion ne crée aucun doublon. Renvoie « soon » quand la limite est atteinte,
// « lost » quand une autre relève a repris la réservation (le passage s'arrête là). Une connexion
// Pipedream, payée à la requête, repasse aux heures de bureau (« office ») plutôt que tous les quarts d'heure.
type Again = 'soon' | 'later' | 'office' | 'lost';

async function readPages(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
  ready: Ready,
): Promise<Again> {
  const { connector, config } = ready;
  const http = connectorHttp(connection.provider, connector, config, deps);
  const state = { cursor: connection.cursor, since: connection.since };
  let read = 0;
  for await (const page of connector.sync(config, state, http)) {
    const items = page.items.flatMap((item) => normalizeItem(item, connection.provider) ?? []);
    if (items.length > 0)
      await ingestConnectorItems(ctx, { ...connection, privateRaw: connector.privateRaw }, items);
    if (page.removed?.length) await removeConnectorItems(ctx, connection, page.removed);
    const { id, lockedAt } = connection;
    if (!(await saveSyncProgress(ctx, id, lockedAt, page.cursor, items.length))) return 'lost';
    read += page.items.length;
    if (read >= SYNC_ITEMS_MAX) return 'soon';
  }
  return connector.pipedream ? 'office' : 'later';
}

const isOAuth = (connection: LoadedConnection) => connection.config.authMode === 'oauth';
// Branchée par le bouton, chez l'éditeur ou par Pipedream : il faut reconnecter, pas changer de clé.
const isButton = (connection: LoadedConnection) =>
  isOAuth(connection) || connection.config.authMode === 'pipedream';

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

// Audit 5 n° 2 : une connexion OAuth enregistrée sans `accountKey` se reconnaît au libellé, et ne se
// reconnecte plus si le compte a été renommé. Après une relève réussie, `verify` (avec ses propres jetons)
// lui donne son identifiant, une seule fois. Une vérification en panne ne change rien : elle sera refaite.
async function rememberAccountKey(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
  ready: Ready,
): Promise<void> {
  if (!isButton(connection) || 'accountKey' in connection.config) return;
  const { connector, config } = ready;
  try {
    const http = connectorHttp(connection.provider, connector, config, deps);
    const { accountKey } = await connector.verify(config, http);
    await saveAccountKey(ctx, connection.id, connection.lockedAt, accountKey ?? null);
  } catch (error) {
    logError('connector.account_key_failed', error, {
      connectionId: connection.id,
      provider: connection.provider,
    });
  }
}

function authMessage(connection: LoadedConnection, error: ConnectorAuthError | OAuthRefusedError) {
  const label = PROVIDER_LABELS[connection.provider];
  if (error instanceof OAuthRefusedError)
    return `Reconnect ${label}: the authorization has expired.`;
  if (isButton(connection)) return `Reconnect ${label}: the authorization was revoked.`;
  return `${label} rejected the key: check it or replace it.`;
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
  // Par Pipedream, chaque essai est payé : l'erreur qui dure n'est pas réessayée toutes les heures.
  const again = connection.config.authMode === 'pipedream' ? { again: 'office' as const } : {};
  await finishSync(ctx, connection.id, connection.lockedAt, { kind: 'error', message, ...again });
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
  await rememberAccountKey(ctx, fresh, deps, ready);
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

// Plus d'une heure : un utilisateur plus jeune attend peut-être son retour de Pipedream (OAUTH_COOKIE_MAX_AGE, 10 min).
const SWEEP_MIN_AGE_MS = 3_600_000;

// Le balayage quotidien : retire chez Pipedream les utilisateurs `leon-` qu'aucune connexion n'utilise plus (retour
// jamais revenu, connexion partie en cascade avec son membre ou son espace). Les connexions de toutes les
// organisations sont lues après la liste de Pipedream : un utilisateur branché entre les deux compte comme en service.
// Seulement avec PIPEDREAM_SWEEP=on : une autre base branchée sur le même projet Pipedream (un poste local, une
// démo) prendrait les utilisateurs de celle-ci pour des orphelins. Pipedream injoignable : journalisé, rien ne casse,
// le balayage du lendemain reprend. Rend les utilisateurs retirés.
export async function sweepPipedreamUsers(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<string[]> {
  const env = pipedreamEnv();
  if (!env || process.env.PIPEDREAM_SWEEP !== 'on') return [];
  const removed: string[] = [];
  try {
    const users = await listLeonUsers(env, fetchImpl);
    const { rows } = await db.execute<{ external_user_id: string }>(
      sql`select external_user_id from pipedream_users_en_service()`,
    );
    const inUse = new Set(rows.map((row) => row.external_user_id));
    for (const user of users) {
      const old = now - user.createdAt >= SWEEP_MIN_AGE_MS; // faux sans date (NaN) : on le garde
      if (!old || inUse.has(user.externalId)) continue;
      await deleteExternalUser(env, user.externalId, fetchImpl);
      removed.push(user.externalId);
    }
  } catch (error) {
    logError('connector.pipedream_sweep_failed', error);
  }
  if (removed.length > 0)
    console.info('[leon]', 'connector.pipedream_sweep', JSON.stringify({ removed }));
  return removed;
}
