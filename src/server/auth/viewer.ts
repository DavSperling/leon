import { eq } from 'drizzle-orm';
import { cache } from 'react';
import type { ViewerProfile } from '@/capture/api-contract';
import { db } from '@/server/db/client';
import { organizations, users } from '@/server/db/schema/auth';
import type { TenantContext } from './tenant-context';

// ctx vient de resolveTenantContext : l'appartenance à l'organisation est déjà vérifiée.
// cache() : lu par le layout et par l'Accueil, une seule fois par rendu (même contexte, voir session.ts).
export const getViewerProfile = cache(async (ctx: TenantContext): Promise<ViewerProfile> => {
  const [row] = await db
    .select({ userName: users.name, email: users.email, organizationName: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, ctx.tenantId))
    .where(eq(users.id, ctx.userId))
    .limit(1);
  if (!row) throw new Error('profil introuvable');
  return { userId: ctx.userId, tenantId: ctx.tenantId, ...row };
});
