import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { briefings } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';

// Ce que l'utilisateur dit de lui dans Réglages > Profil (son rôle, ses sujets du moment) : seul son point du matin
// le lit, pour choisir ce qui compte pour lui. La limite est aussi celle de la base (0036-a-propos.sql).
export const ABOUT_MAX_CHARS = 500;

export async function readAbout(userId: string): Promise<string | null> {
  const [row] = await db.select({ about: users.about }).from(users).where(eq(users.id, userId));
  return row?.about ?? null;
}

// Un texte vide efface. Les points de l'utilisateur sont marqués périmés : ils se refont avec le nouveau texte au
// prochain tic du matin ou à leur prochaine lecture.
export async function saveAbout(ctx: TenantContext, about: string | null): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.update(users).set({ about, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
    await tx.update(briefings).set({ stale: true }).where(eq(briefings.userId, ctx.userId));
  });
}
