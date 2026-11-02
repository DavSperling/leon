import { sql } from 'drizzle-orm';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import type { Llm } from '@/server/llm/llm';
import { logError, safeErrorSummary } from '@/server/log';
import { listAboutCandidates, proposeAbout } from './about-suggestion';
import { BRIEFING_TIME_ZONE } from './briefing-prompt';
import { briefingIsFresh, refreshBriefing } from './briefings';
import {
  AboutJobSchema,
  BRIEFING_QUEUES,
  BRIEFING_READ_DAYS,
  BriefingJobSchema,
  enqueueBriefingRefresh,
  getBriefingBoss,
} from './queue';

// Le worker du point du matin (T13) : il lit la file `point-refresh` (un point à refaire) et, chaque jour à 6 h,
// heure de Paris, le tic `point-matin` remet en file les points lus dans la semaine, puis une proposition « About
// you » par personne prête, que lit la file `apropos-proposer`. Sur les files de pg-boss, comme le worker de la
// recherche (search/worker.ts).
//
// Sans modèle (getLlm rend null) : un job de recalcul se termine sans rien faire, sans échec ni reprise. C'est le
// plus simple : aucune boucle, et le point se refait au prochain signal, à la prochaine lecture ou au tic du matin
// une fois la clé réglée.

export const MORNING_CRON = '0 6 * * *';
// Le fuseau des dates écrites dans le point (briefing-prompt.ts).
export const MORNING_TIME_ZONE = BRIEFING_TIME_ZONE;
// Les points lus depuis moins de 7 jours sont refaits chaque matin (plan, T13).
export const MORNING_READ_DAYS = BRIEFING_READ_DAYS;
// Points refaits en parallèle dans un processus : chacun est un appel au modèle d'une demi-minute environ.
const REFRESH_CONCURRENCY = 2;

type DueRow = { tenant_id: string; user_id: string; project: string };

// Met en file, tout de suite, le recalcul de chaque point lu depuis moins de MORNING_READ_DAYS jours. La liste vient
// de briefings_a_rafraichir, qui ne rend que des identifiants ; chaque job se fait ensuite sous les droits de son
// utilisateur. Une mise en file qui échoue n'empêche pas les suivantes. Rend le nombre de points mis en file (un
// recalcul déjà en attente pour la même clé n'en ajoute pas).
export async function enqueueMorningRefreshes(): Promise<number> {
  const { rows } = await db.execute<DueRow>(
    sql`select tenant_id, user_id, project from briefings_a_rafraichir(${MORNING_READ_DAYS})`,
  );
  let queued = 0;
  for (const row of rows) {
    try {
      const sent = await enqueueBriefingRefresh({
        tenantId: row.tenant_id,
        userId: row.user_id,
        project: row.project,
      });
      if (sent) queued += 1;
    } catch (error) {
      logError('briefing.morning_enqueue_failed', error, {
        tenantId: row.tenant_id,
        userId: row.user_id,
      });
    }
  }
  return queued;
}

// Met en file la proposition « About you » de chaque personne prête (listAboutCandidates). La clé est (organisation,
// utilisateur) : la file est « stately », une proposition déjà en attente n'est pas doublée. Comme pour les points, un
// envoi qui échoue n'empêche pas les suivants. Rend le nombre de propositions mises en file.
export async function enqueueAboutProposals(): Promise<number> {
  const candidates = await listAboutCandidates();
  const boss = await getBriefingBoss();
  let queued = 0;
  for (const { tenantId, userId } of candidates) {
    try {
      const id = await boss.send(
        BRIEFING_QUEUES.about,
        { tenantId, userId },
        { singletonKey: `${tenantId}:${userId}` },
      );
      if (id !== null) queued += 1;
    } catch (error) {
      logError('about.enqueue_failed', error, { tenantId, userId });
    }
  }
  return queued;
}

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer du texte capté (une
// erreur de base cite ses paramètres) ; seulement son résumé (safeErrorSummary).
function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}

async function processRefreshJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  const { llm } = deps;
  if (llm === null) return;
  const job = BriefingJobSchema.parse(data);
  const ids = { tenantId: job.tenantId, userId: job.userId };
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    // Parti de l'organisation : personne ne peut plus lire ce point sous ses droits.
    if (!ctx) return;
    // Rien n'a bougé depuis sa préparation (aucun signal, aucune source devenue invisible) : le tic du matin ne paie
    // pas un appel au modèle pour réécrire le même point.
    if (await briefingIsFresh(ctx, job.project)) return;
    await refreshBriefing(ctx, job.project, { llm });
  } catch (error) {
    rethrowSummary('briefing.refresh_failed', error, ids);
  }
}

// Même patron que le recalcul d'un point. Sans modèle, le job se termine sans échec : la proposition se remettra en
// file au prochain tic, une fois la clé réglée. Une panne du modèle remonte (LlmError), et pg-boss reprend le job.
async function processAboutJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  const { llm } = deps;
  if (llm === null) return;
  const job = AboutJobSchema.parse(data);
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    // Parti de l'organisation : plus personne à qui proposer quoi que ce soit.
    if (!ctx) return;
    await proposeAbout(ctx, { llm });
  } catch (error) {
    rethrowSummary('about.propose_failed', error, { tenantId: job.tenantId, userId: job.userId });
  }
}

async function registerWorkers(
  deps: { llm: Llm | null },
  pollingIntervalSeconds: number | undefined,
): Promise<void> {
  const boss = await getBriefingBoss();
  // pg-boss teste la présence de la clé : `pollingIntervalSeconds: undefined` y est refusé.
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  await boss.work(
    BRIEFING_QUEUES.refresh,
    { batchSize: 1, localConcurrency: REFRESH_CONCURRENCY, ...polling },
    async ([job]) => processRefreshJob(job?.data, deps),
  );
  // Un tic manqué (serveur arrêté à 6 h) part une fois au redémarrage, pas autant de fois que de jours manqués.
  await boss.schedule(BRIEFING_QUEUES.morning, MORNING_CRON, null, {
    tz: MORNING_TIME_ZONE,
    missed: 'once',
  });
  await boss.work(
    BRIEFING_QUEUES.morning,
    { batchSize: 1, localConcurrency: 1, ...polling },
    async () => {
      // Les deux mises en file tournent toujours : l'échec de l'une ne prive pas l'autre de son tic du jour. Chaque
      // échec est journalisé, puis la première erreur est relancée, pour que pg-boss reprenne le tic.
      const results = await Promise.allSettled([
        enqueueMorningRefreshes(),
        enqueueAboutProposals(),
      ]);
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      for (const error of errors) logError('briefing.morning_tick_failed', error);
      if (errors.length > 0) throw new Error(safeErrorSummary(errors[0]));
    },
  );
  await boss.work(
    BRIEFING_QUEUES.about,
    { batchSize: 1, localConcurrency: 1, ...polling },
    async ([job]) => processAboutJob(job?.data, deps),
  );
}

const globalForWorker = globalThis as typeof globalThis & { leonBriefingWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startBriefingWorker(
  deps: { llm: Llm | null },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonBriefingWorker ??= registerWorkers(
    deps,
    options.pollingIntervalSeconds,
  ).catch((error) => {
    globalForWorker.leonBriefingWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonBriefingWorker;
}
