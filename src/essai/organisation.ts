import { hashPassword } from 'better-auth/crypto';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { generateApiToken, hashApiToken } from '@/server/auth/api-tokens';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, organizations, users } from '@/server/db/schema/auth';
import { ingestRuns } from '@/server/db/schema/memory';
import type { AdminDb } from './admin-db';
import { type Entreprise, ESSAI_DOMAINE, ESSAI_SLUG } from './schema';

export type Compte = { cle: string; userId: string; token: string };

// Supprime l'organisation d'essai (sa mémoire, ses jetons et son usage suivent en cascade), puis ses
// comptes, et recrée le tout. Bornée au slug et au domaine d'essai, fixés par EntrepriseSchema.
export async function remettreAZero(
  db: AdminDb,
  entreprise: Entreprise,
): Promise<{ tenantId: string; comptes: Compte[] }> {
  if (entreprise.slug !== ESSAI_SLUG || entreprise.domaine !== ESSAI_DOMAINE)
    throw new Error('Remise à zéro refusée : ce n est pas l organisation d essai.');
  const password = await hashPassword(entreprise.motDePasse);
  return db.transaction(async (tx) => {
    // L'organisation d'abord : les faits référencent leurs auteurs sans cascade.
    await tx.delete(organizations).where(eq(organizations.slug, ESSAI_SLUG));
    await tx.delete(users).where(like(users.email, `%@${ESSAI_DOMAINE}`));
    const [org] = await tx
      .insert(organizations)
      .values({ name: entreprise.organisation, slug: ESSAI_SLUG, createdAt: new Date() })
      .returning({ id: organizations.id });
    if (!org) throw new Error('organisation d essai non créée');

    const comptes: Compte[] = [];
    for (const [index, personnage] of entreprise.personnages.entries()) {
      const [user] = await tx
        .insert(users)
        .values({
          name: personnage.nom,
          email: `${personnage.cle}@${ESSAI_DOMAINE}`,
          emailVerified: true,
        })
        .returning({ id: users.id });
      if (!user) throw new Error('compte d essai non créé');
      // Compte « credential » de Better Auth : connexion par e-mail et mot de passe dans l'interface.
      await tx.execute(sql`insert into account ("accountId", "providerId", "userId", password, "createdAt", "updatedAt")
                           values (${user.id}, 'credential', ${user.id}, ${password}, now(), now())`);
      await tx.insert(members).values({
        organizationId: org.id,
        userId: user.id,
        role: index === 0 ? 'owner' : 'member',
        createdAt: new Date(),
      });
      const token = generateApiToken();
      await tx.insert(apiTokens).values({
        tenantId: org.id,
        userId: user.id,
        name: 'Jeu d essai',
        tokenHash: hashApiToken(token),
        tokenHint: token.slice(-4),
      });
      comptes.push({ cle: personnage.cle, userId: user.id, token });
    }
    return { tenantId: org.id, comptes };
  });
}

export async function tenantEssai(db: AdminDb): Promise<string | null> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, ESSAI_SLUG));
  return org?.id ?? null;
}

export async function runsEnCours(db: AdminDb, slug = ESSAI_SLUG): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ingestRuns)
    .innerJoin(organizations, eq(organizations.id, ingestRuns.tenantId))
    .where(and(eq(organizations.slug, slug), inArray(ingestRuns.status, ['queued', 'running'])));
  return row?.n ?? 0;
}
