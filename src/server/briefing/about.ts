import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { briefings } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { BRIEFING_DELAY_SECONDS, BRIEFING_READ_DAYS, enqueueBriefingRefresh } from './queue';

// Ce que l'utilisateur dit de lui dans Réglages > Profil (son rôle, ses sujets du moment) : seul son point du matin
// le lit, pour choisir ce qui compte pour lui. La limite est aussi celle de la base (0036-a-propos.sql).
export const ABOUT_MAX_CHARS = 500;

export async function readAbout(userId: string): Promise<string | null> {
  const [row] = await db.select({ about: users.about }).from(users).where(eq(users.id, userId));
  return row?.about ?? null;
}

// Marque périmés les points de la personne, et refait dans 30 minutes ceux qu'elle a lus dans la semaine ; les autres
// se refont à leur prochaine lecture (readBriefing). Comme un signal (signalProjectActivity). `write` est exécuté dans
// la même transaction que le marquage : ce qui change le point (le texte « À propos », le poste) et `stale` se posent
// ensemble. Les points sont sous les droits de la personne : `ctx` est le sien, jamais celui d'un administrateur.
export async function markBriefingsStale(
  ctx: TenantContext,
  write?: (tx: Tx) => Promise<unknown>,
): Promise<void> {
  const points = await withTenant(ctx, async (tx) => {
    await write?.(tx);
    return tx
      .update(briefings)
      .set({ stale: true })
      .where(eq(briefings.userId, ctx.userId))
      .returning({ project: briefings.project, lastReadAt: briefings.lastReadAt });
  });
  const readSince = new Date(Date.now() - BRIEFING_READ_DAYS * 24 * 60 * 60 * 1000);
  for (const point of points) {
    if (point.lastReadAt === null || point.lastReadAt <= readSince) continue;
    try {
      await enqueueBriefingRefresh(
        { tenantId: ctx.tenantId, userId: ctx.userId, project: point.project },
        { delaySeconds: BRIEFING_DELAY_SECONDS },
      );
    } catch (error) {
      // Ce qui a changé est enregistré : le tic du matin refera le point.
      logError('briefing.enqueue_failed', error, { tenantId: ctx.tenantId, userId: ctx.userId });
    }
  }
}

// Un texte vide efface.
export const saveAbout = (ctx: TenantContext, about: string | null): Promise<void> =>
  markBriefingsStale(ctx, (tx) =>
    tx.update(users).set({ about, updatedAt: new Date() }).where(eq(users.id, ctx.userId)),
  );
