import { and, eq, sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { PROJECT_KEY_PATTERN } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { briefings } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { getBoss } from '@/server/pipeline/queue';

// Les files du point du matin (T13), à côté de celles de l'indexation (pipeline/queue.ts) : `point-refresh` refait
// le point d'un utilisateur sur un projet, `point-matin` est le tic de 6 h (worker.ts). Ce module ne dépend d'aucun
// modèle : l'indexation l'appelle (signalSourceActivity) et doit tourner sans clé Anthropic.

export const BRIEFING_QUEUES = { refresh: 'point-refresh', morning: 'point-matin' } as const;

// Contraintes globales du plan : un recalcul au plus toutes les 30 minutes par (utilisateur, projet). Un signal met
// le recalcul en file dans 30 minutes ; les signaux suivants le trouvent en attente et n'en ajoutent pas.
export const BRIEFING_DELAY_SECONDS = 30 * 60;

// « stately » : un seul job en attente et un seul en cours par clé (organisation, utilisateur, projet). Un second
// envoi pendant l'attente est ignoré par pg-boss (send rend null) ; une donnée arrivée pendant le recalcul en met
// un nouveau en file. Un échec (modèle, base) est repris trois fois, de plus en plus tard.
const REFRESH_QUEUE = {
  policy: 'stately',
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
} as const;
const MORNING_QUEUE = { retryLimit: 2, retryDelay: 300 } as const;

export const BriefingJobSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  project: z.string().max(200).regex(PROJECT_KEY_PATTERN),
});
export type BriefingJob = z.infer<typeof BriefingJobSchema>;

export const briefingKey = (job: BriefingJob): string =>
  `${job.tenantId}:${job.userId}:${job.project}`;

// Les files sont créées une fois par processus (createQueue ne fait rien quand elles existent). Sur globalThis :
// le rechargement à chaud de Next réimporte ce module.
const globalForBriefing = globalThis as typeof globalThis & { leonBriefingBoss?: Promise<PgBoss> };

export function getBriefingBoss(): Promise<PgBoss> {
  globalForBriefing.leonBriefingBoss ??= (async () => {
    const boss = await getBoss();
    await boss.createQueue(BRIEFING_QUEUES.refresh, REFRESH_QUEUE);
    await boss.createQueue(BRIEFING_QUEUES.morning, MORNING_QUEUE);
    return boss;
  })().catch((error) => {
    globalForBriefing.leonBriefingBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBriefing.leonBriefingBoss;
}

// Met en file le recalcul d'un point, tout de suite ou dans `delaySeconds`. Rend false quand un recalcul de la même
// clé attend déjà (il le fera).
export async function enqueueBriefingRefresh(
  job: BriefingJob,
  options: { delaySeconds?: number } = {},
): Promise<boolean> {
  const data = BriefingJobSchema.parse(job);
  const boss = await getBriefingBoss();
  const id = await boss.send(BRIEFING_QUEUES.refresh, data, {
    singletonKey: briefingKey(data),
    ...(options.delaySeconds ? { startAfter: options.delaySeconds } : {}),
  });
  return id !== null;
}

// De nouvelles données sur un projet : le point de chaque destinataire est marqué périmé et refait dans 30 minutes.
// Destinataires : les membres de l'organisation de `ctx` qui ont un point sur ce projet (briefings_du_projet, qui ne
// rend que des identifiants) et `extraUserIds` (le propriétaire d'une session, qui n'a peut-être pas encore de
// point). Chacun est traité sous ses propres droits ; un membre parti de l'organisation, ou d'une autre organisation,
// est sauté sans erreur. L'échec d'un destinataire n'empêche pas les suivants.
export async function signalProjectActivity(
  ctx: TenantContext,
  project: string,
  extraUserIds: string[],
): Promise<void> {
  if (project.length > 200 || !PROJECT_KEY_PATTERN.test(project)) return;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ user_id: string }>(sql`select user_id from briefings_du_projet(${project})`),
  );
  const recipients = [...new Set([...rows.map((row) => row.user_id), ...extraUserIds])];
  for (const userId of recipients) {
    try {
      const recipient = await resolveTenantContext(userId, ctx.tenantId);
      if (!recipient) continue;
      await withTenant(recipient, (tx) =>
        tx
          .update(briefings)
          .set({ stale: true })
          .where(and(eq(briefings.userId, recipient.userId), eq(briefings.project, project))),
      );
      await enqueueBriefingRefresh(
        { tenantId: recipient.tenantId, userId: recipient.userId, project },
        { delaySeconds: BRIEFING_DELAY_SECONDS },
      );
    } catch (error) {
      logError('briefing.signal_failed', error, { tenantId: ctx.tenantId, userId });
    }
  }
}

// Le projet que touche une source, et qui le signaler en plus des membres qui y ont un point : une session Claude
// Code (sa clé de projet, C8 ; son propriétaire), un élément GitHub (la clé de son dépôt). Les autres sources ne
// sont rattachées à aucun projet : ce qui y mentionne quelqu'un entre dans son point au tic du matin.
export function projectOfSource(source: {
  kind: string;
  ownerUserId: string;
  metadata: unknown;
}): { project: string; extraUserIds: string[] } | null {
  const metadata =
    typeof source.metadata === 'object' && source.metadata !== null
      ? (source.metadata as Record<string, unknown>)
      : {};
  const valid = (key: string) => key.length <= 200 && PROJECT_KEY_PATTERN.test(key);
  if (source.kind === 'claude_code') {
    const { project } = metadata;
    return typeof project === 'string' && valid(project)
      ? { project, extraUserIds: [source.ownerUserId] }
      : null;
  }
  if (source.kind === 'github') {
    const origin = metadata.origin;
    const repo =
      typeof origin === 'object' && origin !== null
        ? (origin as Record<string, unknown>).repo
        : undefined;
    if (typeof repo !== 'string') return null;
    const project = `github.com/${repo.toLowerCase()}`;
    return valid(project) && !repo.split('/').some((part) => part === '.' || part === '..')
      ? { project, extraUserIds: [] }
      : null;
  }
  return null;
}

// Après l'indexation d'un run (search/index-run.ts) : signale le projet de sa source, lue sous les droits de `ctx`.
export async function signalSourceActivity(ctx: TenantContext, sourceId: string): Promise<void> {
  const [source] = await withTenant(ctx, (tx) =>
    tx
      .select({ kind: sources.kind, ownerUserId: sources.ownerUserId, metadata: sources.metadata })
      .from(sources)
      .where(eq(sources.id, sourceId)),
  );
  if (!source) return;
  const target = projectOfSource(source);
  if (target) await signalProjectActivity(ctx, target.project, target.extraUserIds);
}
