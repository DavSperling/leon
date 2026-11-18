import { PgBoss, type Queue, type Warning, type WorkHandler } from 'pg-boss';
import { z } from 'zod';
import { env } from '@/server/env';
import { logError } from '@/server/log';

// Files de l'indexation (C5) : `index` découpe en passages les tours d'un run, `reindex` et `requeue`
// reprennent ce qui est resté en route (vecteurs manquants, runs jamais mis en file).
export const PIPELINE_QUEUES = {
  index: 'pipeline-index',
  reindex: 'pipeline-reindex',
  requeue: 'pipeline-requeue',
} as const;
export type PipelineStep = keyof typeof PIPELINE_QUEUES;

// Files du tri supprimé (premier jet) : sur une base déjà utilisée, elles restent avec leurs jobs et sans lecteur.
// Le démarrage les retire (deleteQueue ne fait rien si la file n'existe pas).
const LEGACY_QUEUES = ['pipeline-triage', 'pipeline-extraction', 'pipeline-placement'];

export const PipelineJobSchema = z.object({
  ingestRunId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true };

// Audit 3 n° 5 : le tic des vecteurs (jusqu'à 45 s de lots, plus un appel au fournisseur) peut dépasser la minute.
// Un seul job actif et un seul en attente : les tics suivants ne s'empilent pas derrière lui.
const QUEUE_OPTIONS: Record<string, Omit<Queue, 'name'>> = {
  [PIPELINE_QUEUES.reindex]: { ...RETRY, policy: 'stately' },
};

// pg-boss ne change pas la politique d'une file qui existe (createQueue ne fait rien) : une file créée avec une
// autre est retirée puis recréée. Ses jobs en attente sont perdus (ceux d'un tic : le suivant les refait) et ses
// plannings aussi (le worker replanifie ses tics à chaque démarrage).
// Toutes les files de Leon réveillent leurs lecteurs à chaque envoi (`notify`, voir startBoss) ; une file créée
// avant, sans, y passe ici.
export async function ensureQueue(
  boss: PgBoss,
  name: string,
  options: Omit<Queue, 'name'>,
): Promise<void> {
  const existing = await boss.getQueue(name);
  if (existing && existing.policy !== (options.policy ?? 'standard')) await boss.deleteQueue(name);
  else if (existing && !existing.notify) await boss.updateQueue(name, { notify: true });
  await boss.createQueue(name, { ...options, notify: true });
}

// Avec l'écoute, une boucle de pg-boss attend 30 s après chaque job, sauf si un envoi l'a réveillée entre-temps :
// passé une rafale, le reste de la file ne partirait plus qu'à quelques jobs toutes les 30 s. Chaque job fini
// réveille donc les boucles de sa file, qui la relisent aussitôt. Une file vide ne lance aucun job, donc plus aucun
// réveil : les boucles retournent à leur attente.
export function wakeQueueAfter(
  boss: PgBoss,
  name: string,
  handler: WorkHandler<unknown>,
): WorkHandler<unknown> {
  return async (jobs) => {
    try {
      return await handler(jobs);
    } finally {
      for (const worker of boss.getWipData())
        if (worker.name === name) boss.notifyWorker(worker.id);
    }
  };
}

// Si la connexion d'écoute échoue au démarrage, pg-boss reste au sondage rapide jusqu'au prochain redémarrage et le
// trafic de la base remonte : on le dit. Les autres alertes (requêtes lentes) portent du SQL et des valeurs de
// jobs : on ne journalise jamais leur contenu.
export function logBossWarning(warning: Warning): void {
  if ((warning.data as { type?: unknown } | undefined)?.type !== 'listen_notify_unavailable')
    return;
  logError('pgboss.listen_unavailable', new Error(warning.message));
}

// Priorité des jobs de la file `index` (pg-boss lit d'abord la plus grande, puis le plus ancien). Une ingestion
// neuve passe devant les reprises : la migration 0010 a remis tout l'historique en attente et le tic de reprise
// le met en file à raison de 200 par minute, sans quoi un élément fraîchement capté attendrait derrière lui.
export const INDEX_PRIORITY = { ingestion: 10, reprise: 0 } as const;

// Le singleton vit sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForBoss = globalThis as typeof globalThis & { leonBoss?: Promise<PgBoss> };

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    createSchema: false,
    max: 2, // 10 par défaut : le budget de connexions est expliqué dans db/client.ts
    // Supabase facture le trafic sortant de la base, et les boucles qui demandaient sans arrêt « une tâche ? » en
    // faisaient l'essentiel. Postgres réveille désormais les lecteurs quand un job arrive (connexion d'écoute à
    // part, hors de `max`) et elles ne relisent plus qu'à 30 s. Si l'écoute échoue, pg-boss revient seul au sondage.
    useListenNotify: true,
    // Le passage des dépendances entre jobs relit toute la table des files : Leon n'en a pas (ni dependsOn ni flow).
    flowIntervalSeconds: 300,
  });
  boss.on('error', (error) => logError('pgboss.error', error));
  boss.on('warning', logBossWarning);
  await boss.start();
  for (const name of LEGACY_QUEUES) await boss.deleteQueue(name);
  for (const name of Object.values(PIPELINE_QUEUES)) {
    await ensureQueue(boss, name, QUEUE_OPTIONS[name] ?? RETRY);
  }
  return boss;
}

export function getBoss(): Promise<PgBoss> {
  globalForBoss.leonBoss ??= startBoss().catch((error) => {
    globalForBoss.leonBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBoss.leonBoss;
}

// `priority` : celle d'une ingestion neuve par défaut ; la reprise d'un run en retard passe `INDEX_PRIORITY.reprise`.
export async function enqueuePipelineStep(
  step: PipelineStep,
  job: PipelineJob,
  options: { priority?: number } = {},
): Promise<void> {
  const boss = await getBoss();
  await boss.send(PIPELINE_QUEUES[step], job, { priority: INDEX_PRIORITY.ingestion, ...options });
}
