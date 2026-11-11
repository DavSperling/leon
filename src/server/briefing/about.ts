import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { aboutSuggestions, briefings } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { BRIEFING_DELAY_SECONDS, enqueueBriefingRefresh, refreshOnSignal } from './queue';

// Ce que l'utilisateur dit de lui dans Réglages > Profil (son rôle, ses sujets du moment) : seul son point du matin
// le lit, pour choisir ce qui compte pour lui. La limite est aussi celle de la base (0036-a-propos.sql).
export const ABOUT_MAX_CHARS = 500;

export async function readAbout(userId: string): Promise<string | null> {
  const [row] = await db.select({ about: users.about }).from(users).where(eq(users.id, userId));
  return row?.about ?? null;
}

// Marque périmés les points de la personne, et refait dans 30 minutes ceux dont elle a lu la version actuelle dans la
// semaine ; les autres se refont à leur prochaine lecture (readBriefing). Comme un signal (refreshOnSignal). `write`
// est exécuté dans la même transaction que le marquage : ce qui change le point (le texte « À propos », le poste) et
// `stale` se posent ensemble. Les points sont sous les droits de la personne : `ctx` est le sien, jamais celui d'un
// administrateur.
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
      .returning({
        project: briefings.project,
        preparedAt: briefings.preparedAt,
        lastReadAt: briefings.lastReadAt,
      });
  });
  for (const point of points) {
    if (!refreshOnSignal(point)) continue;
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

// Un texte vide efface. Un texte rempli, d'ici ou de la carte « About you » du Chat, ferme la proposition ouverte dans
// la même transaction : vidé plus tard, « À propos » ne la fait pas revenir (elle ne s'affiche qu'une fois). Écrit ici
// et non par closeAboutSuggestion, qui importe ce fichier.
export const saveAbout = (ctx: TenantContext, about: string | null): Promise<void> =>
  markBriefingsStale(ctx, async (tx) => {
    await tx.update(users).set({ about, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
    if (about?.trim())
      await tx
        .update(aboutSuggestions)
        .set({ closedAt: sql`now()` })
        .where(and(eq(aboutSuggestions.userId, ctx.userId), isNull(aboutSuggestions.closedAt)));
  });
