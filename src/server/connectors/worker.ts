import { logError, safeErrorSummary } from '@/server/log';
import { getBoss } from '@/server/pipeline/queue';
import { CONNECTOR_QUEUES, ConnectorSyncJobSchema } from './queue';
import { getConnector } from './registry';
import { enqueueDueSyncs, runConnectorSync, type SyncDeps } from './sync';

const RETRY = { retryLimit: 2 };
// Un seul job en attente par connexion (singletonKey). `expireInSeconds` est la durée de la
// réservation : le défaut de pg-boss, 15 minutes, déclarerait expiré un long passage encore en cours.
const SYNC_QUEUE = { ...RETRY, policy: 'short', expireInSeconds: 1800 } as const;

// pg-boss a besoin d'un message sans texte capté : ni l'erreur d'origine (une erreur de base cite
// ses paramètres), ni rien d'autre que son résumé.
function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}

// pg-boss teste la présence de la clé : `pollingIntervalSeconds: undefined` y est refusé.
async function registerWorkers(deps: SyncDeps, pollingIntervalSeconds: number | undefined) {
  const boss = await getBoss();
  await boss.createQueue(CONNECTOR_QUEUES.tick, RETRY);
  await boss.createQueue(CONNECTOR_QUEUES.sync, SYNC_QUEUE);
  await boss.schedule(CONNECTOR_QUEUES.tick, '* * * * *');
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  const options = { batchSize: 1, localConcurrency: 1, ...polling };
  await boss.work(CONNECTOR_QUEUES.tick, options, async () => {
    await enqueueDueSyncs().catch((error) => rethrowSummary('connector.tick_failed', error));
  });
  await boss.work(CONNECTOR_QUEUES.sync, options, async ([job]) => {
    const parsed = ConnectorSyncJobSchema.parse(job?.data);
    await runConnectorSync(parsed, deps).catch((error) =>
      rethrowSummary('connector.job_failed', error, { connectionId: parsed.connectionId }),
    );
  });
}

const globalForWorker = globalThis as typeof globalThis & { leonConnectorWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startConnectorWorker(
  deps: SyncDeps = { getConnector },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonConnectorWorker ??= registerWorkers(
    deps,
    options.pollingIntervalSeconds,
  ).catch((error) => {
    globalForWorker.leonConnectorWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonConnectorWorker;
}
