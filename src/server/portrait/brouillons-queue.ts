import { and, eq } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import type { TenantContext } from '@/server/auth/tenant-context';
import { reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { ensureQueue, getBoss } from '@/server/pipeline/queue';
import { EN_SERVICE } from './agents';
import { FicheJobSchema } from './queue';

// La file des passages de l'agent « Brouillons de réponse » (brouillons-worker.ts), sur le modèle de `fiche-construire`
// (queue.ts) : « stately », clé (organisation, personne), donc un seul passage en attente et un seul en cours par
// personne, et jamais deux appels au modèle au même instant pour le même mail. Un échec (la base) est repris deux fois,
// de plus en plus tard. Le travail ne porte que la personne, comme celui de la fiche.

export const BROUILLONS_QUEUE = 'brouillons-ecrire';
const QUEUE = { policy: 'stately', retryLimit: 2, retryDelay: 60, retryBackoff: true } as const;

// Sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForBrouillons = globalThis as typeof globalThis & {
  leonBrouillonsBoss?: Promise<PgBoss>;
};

export function getBrouillonsBoss(): Promise<PgBoss> {
  globalForBrouillons.leonBrouillonsBoss ??= (async () => {
    const boss = await getBoss();
    await ensureQueue(boss, BROUILLONS_QUEUE, QUEUE);
    return boss;
  })().catch((error) => {
    globalForBrouillons.leonBrouillonsBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBrouillons.leonBrouillonsBoss;
}

// Rend false quand un passage de la personne attend déjà (il le fera).
export async function enqueueBrouillons(job: {
  tenantId: string;
  userId: string;
}): Promise<boolean> {
  const data = FicheJobSchema.parse(job);
  const boss = await getBrouillonsBoss();
  const singletonKey = `${data.tenantId}:${data.userId}`;
  return (await boss.send(BROUILLONS_QUEUE, data, { singletonKey })) !== null;
}

// Demande un passage pour la personne, si elle a dit oui à l'agent : quand elle lui répond (propositions.ts), puis à la
// fin de chaque relève de sa boîte (connectors/sync.ts). Une demande qui échoue est journalisée sans faire échouer sa
// réponse ni la relève : la relève suivante en refait une.
export async function requestBrouillons(ctx: TenantContext): Promise<void> {
  try {
    const [answer] = await withTenant(ctx, (tx) =>
      tx
        .select({ oui: reponsesAgent.oui })
        .from(reponsesAgent)
        .where(
          and(
            eq(reponsesAgent.tenantId, ctx.tenantId),
            eq(reponsesAgent.userId, ctx.userId),
            eq(reponsesAgent.agent, EN_SERVICE),
          ),
        ),
    );
    if (answer?.oui) await enqueueBrouillons(ctx);
  } catch (error) {
    logError('brouillons.enqueue', error, { userId: ctx.userId });
  }
}
